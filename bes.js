#!/usr/bin/env node
/**
 * Brand Experience Score (BES) calculator for bank_data_enhanced.json
 *
 * Implements Steps 2–5 from the BES process:
 * 2) Brand attribution (owned vs earned + brand mapping)
 * 3) Compute per-post components (EP, Advocacy, SentimentProxy, Depth, Service)
 * 4) Combine to BES_raw and normalize (0–100) by period + source_type
 * 5) Aggregate to brand-period outputs + export CSV/JSON
 *
 * Input expected: an array of post objects with fields like:
 * - page_profile_url, page_name, post_tagged_bank, post_tagged_banks
 * - post_reactions_total, post_total_comment_count, post_share_count
 * - reaction breakdown: post_reaction_Love/Care/Wow/Haha/Sad/Angry
 * - comments_export_coverage, unique_comment_authors, comment_replies_sum
 * - median_reply_time_minutes
 */

'use strict';

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {
    input: 'bank_data_enhanced.json',
    outDir: 'output',
    period: 'week', // week | month
    coverageThreshold: 0.6,
    includeUnattributed: false,
    normalization: 'minmax', // minmax | zscore | none
    // Default weights aligned with the earlier BES example:
    weights: { eng: 0.15, adv: 0.20, sent: 0.35, depth: 0.15, service: 0.15 }
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--input') args.input = argv[++i];
    else if (a === '--out') args.outDir = argv[++i];
    else if (a === '--period') args.period = argv[++i];
    else if (a === '--coverageThreshold') args.coverageThreshold = Number(argv[++i]);
    else if (a === '--includeUnattributed') args.includeUnattributed = argv[++i] === 'true';
    else if (a === '--normalization') args.normalization = argv[++i];
    else if (a === '--weights') {
      // Example: --weights "eng=0.15,adv=0.2,sent=0.35,depth=0.15,service=0.15"
      const s = argv[++i];
      const parts = s.split(',').map(x => x.trim()).filter(Boolean);
      const w = { ...args.weights };
      for (const p of parts) {
        const [k, v] = p.split('=').map(x => x.trim());
        if (k && v && Object.prototype.hasOwnProperty.call(w, k)) w[k] = Number(v);
      }
      // Normalize to sum to 1 (if user entered imperfectly)
      const sum = Object.values(w).reduce((acc, x) => acc + (Number.isFinite(x) ? x : 0), 0) || 1;
      for (const k of Object.keys(w)) w[k] = w[k] / sum;
      args.weights = w;
    }
    else if (a === '--help' || a === '-h') {
      console.log(`
Usage:
  node bes.js --input bank_data_enhanced.json --out output [options]

Options:
  --period week|month                  Default: week
  --coverageThreshold 0.6              Default: 0.6
  --includeUnattributed true|false     Default: false
  --normalization minmax|zscore|none   Default: minmax
  --weights "eng=0.15,adv=0.2,..."     Default: eng=0.15, adv=0.20, sent=0.35, depth=0.15, service=0.15

Outputs:
  <out>/bes_posts.csv
  <out>/bes_brand_period.csv
  <out>/bes_brand_period.json
`);
      process.exit(0);
    }
  }

  if (!['week', 'month'].includes(args.period)) {
    throw new Error(`--period must be week or month (got: ${args.period})`);
  }
  if (!['minmax', 'zscore', 'none'].includes(args.normalization)) {
    throw new Error(`--normalization must be minmax, zscore, or none (got: ${args.normalization})`);
  }
  if (!Number.isFinite(args.coverageThreshold) || args.coverageThreshold < 0 || args.coverageThreshold > 1) {
    throw new Error(`--coverageThreshold must be between 0 and 1 (got: ${args.coverageThreshold})`);
  }
  return args;
}

function safeNum(x, d = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : d;
}

function isoWeekKey(date) {
  // Returns "YYYY-Www" (ISO week date)
  // Adapted from common ISO week algorithm.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Thursday in current week decides the year.
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  const yyyy = d.getUTCFullYear();
  return `${yyyy}-W${String(weekNo).padStart(2, '0')}`;
}

function monthKey(date) {
  const yyyy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${yyyy}-${mm}`;
}

function getPeriodKey(isoString, period) {
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return null;
  return period === 'week' ? isoWeekKey(d) : monthKey(d);
}

function classifySourceType(pageProfileUrl) {
  const u = (pageProfileUrl || '').toLowerCase();
  return u.includes('facebook.com/groups/') ? 'earned' : 'owned';
}

function explodeAttribution(post, sourceType) {
  // Returns array of attribution records { brand, confidence }
  const out = [];

  const postTaggedBank = post.post_tagged_bank || null;
  const postTaggedBanks = Array.isArray(post.post_tagged_banks) ? post.post_tagged_banks.filter(Boolean) : [];

  const anyCommentTagged = !!post.any_comment_tagged;
  const commentTaggedBanks = Array.isArray(post.comment_tagged_banks_union)
    ? post.comment_tagged_banks_union.filter(Boolean)
    : [];

  if (sourceType === 'owned') {
    const brand = postTaggedBank || post.page_name || null;
    if (brand) out.push({ brand, confidence: postTaggedBank ? 'post_tag' : 'page_name' });
    return out;
  }

  // earned
  if (postTaggedBank) {
    out.push({ brand: postTaggedBank, confidence: 'post_tag' });
    return out;
  }
  if (postTaggedBanks.length > 0) {
    for (const b of postTaggedBanks) out.push({ brand: b, confidence: 'post_tag_list' });
    return out;
  }
  if (anyCommentTagged && commentTaggedBanks.length > 0) {
    for (const b of commentTaggedBanks) out.push({ brand: b, confidence: 'comment_tag' });
    return out;
  }

  if (post.page_name) {
    // keep group name as “context” but not as a brand
    // out.push({ brand: post.page_name, confidence: 'group_context' });
  }

  return out; // empty => unattributed
}

function computeComponents(post, coverageThreshold) {
  const reactions = safeNum(post.post_reactions_total, 0);
  const comments = safeNum(post.post_total_comment_count, 0);
  const shares = safeNum(post.post_share_count, 0);

  // Engagement Points (EP): reactions + 2*comments + 3*shares
  const EP = reactions + 2 * comments + 3 * shares;

  // Advocacy proxy: shares (+1 if any_comment_tagged)
  const ADV = shares + (post.any_comment_tagged ? 1 : 0);

  // Reaction-mix sentiment proxy: (pos - neg)/reactions
  const love = safeNum(post.post_reaction_Love, 0);
  const care = safeNum(post.post_reaction_Care, 0);
  const wow = safeNum(post.post_reaction_Wow, 0);
  const haha = safeNum(post.post_reaction_Haha, 0);
  const sad = safeNum(post.post_reaction_Sad, 0);
  const angry = safeNum(post.post_reaction_Angry, 0);
  const SentimentProxy = (love + care + wow + haha - sad - angry) / Math.max(1, reactions);

  // Depth (requires comment export coverage)
  const coverage = safeNum(post.comments_export_coverage, 0);
  const uniqueAuthors = safeNum(post.unique_comment_authors, 0);
  const repliesSum = safeNum(post.comment_replies_sum, 0);

  const depthAvailable = coverage >= coverageThreshold;
  const Depth = depthAvailable ? (Math.log1p(uniqueAuthors) + Math.log1p(repliesSum)) : 0;

  // Service score (if reply time is present)
  const rt = post.median_reply_time_minutes;
  const rtNum = (rt === null || rt === undefined) ? null : Number(rt);
  const serviceAvailable = Number.isFinite(rtNum) && rtNum >= 0;
  // Larger time => lower score
  const ServiceScore = serviceAvailable ? (1 / Math.log(2 + rtNum)) : 0;

  return {
    reactions, comments, shares,
    EP, ADV, SentimentProxy,
    coverage, uniqueAuthors, repliesSum, Depth, depthAvailable,
    rtMinutes: serviceAvailable ? rtNum : null,
    ServiceScore
  };
}

function computeBESraw(components, weights) {
  // log-squash for skewed engagement and advocacy
  const engTerm = Math.log1p(components.EP);
  const advTerm = Math.log1p(components.ADV);

  return (
    weights.eng * engTerm +
    weights.adv * advTerm +
    weights.sent * components.SentimentProxy +
    weights.depth * components.Depth +
    weights.service * components.ServiceScore
  );
}

function toCsv(rows, header) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const lines = [];
  lines.push(header.map(esc).join(','));
  for (const r of rows) {
    lines.push(header.map(k => esc(r[k])).join(','));
  }
  return lines.join('\n') + '\n';
}

function mean(xs) {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function std(xs) {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

function normalizeGroups(groups, normalization) {
  // groups: array of objects with keys: period_key, source_type, brand, BES_raw_avg
  // Normalize within (period_key, source_type)
  const byBucket = new Map();
  for (const g of groups) {
    const key = `${g.period_key}||${g.source_type}`;
    if (!byBucket.has(key)) byBucket.set(key, []);
    byBucket.get(key).push(g);
  }

  for (const [, arr] of byBucket.entries()) {
    const vals = arr.map(x => x.BES_raw_avg);
    if (normalization === 'none') {
      for (const g of arr) g.BES_0_100 = null;
      continue;
    }

    if (normalization === 'minmax') {
      const minV = Math.min(...vals);
      const maxV = Math.max(...vals);
      const denom = (maxV - minV);
      for (const g of arr) {
        g.BES_0_100 = denom > 0 ? (100 * (g.BES_raw_avg - minV) / denom) : 50;
      }
    } else if (normalization === 'zscore') {
      const m = mean(vals);
      const s = std(vals);
      for (const g of arr) {
        const z = (s > 0) ? ((g.BES_raw_avg - m) / s) : 0;
        // map z to 0–100 via logistic-ish squashing:
        g.BES_0_100 = 100 * (1 / (1 + Math.exp(-z)));
      }
    }
  }

  return groups;
}

function main() {
  const args = parseArgs(process.argv);

  const inputPath = path.resolve(args.input);
  const outDir = path.resolve(args.outDir);
  fs.mkdirSync(outDir, { recursive: true });

  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const raw = fs.readFileSync(inputPath, 'utf-8');
  let posts;
  try {
    posts = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Failed to parse JSON. Expected an array. Error: ${e.message}`);
  }
  if (!Array.isArray(posts)) {
    throw new Error(`Input JSON must be an array of post objects.`);
  }

  const postRecords = [];
  let unattributedCount = 0;

  for (const post of posts) {
    const sourceType = classifySourceType(post.page_profile_url);
    const periodKey = getPeriodKey(post.post_creation_time, args.period);

    if (!periodKey) continue;

    const attributions = explodeAttribution(post, sourceType);
    if (attributions.length === 0) {
      unattributedCount += 1;
      if (!args.includeUnattributed) continue;
      attributions.push({ brand: 'Unattributed', confidence: 'none' });
    }

    const comps = computeComponents(post, args.coverageThreshold);
    const besRaw = computeBESraw(comps, args.weights);

    for (const att of attributions) {
      postRecords.push({
        post_id: post.post_id,
        post_post_url: post.post_post_url,
        post_creation_time: post.post_creation_time,
        period_key: periodKey,
        source_type: sourceType,
        page_name: post.page_name,
        page_profile_url: post.page_profile_url,

        brand: att.brand,
        attribution_confidence: att.confidence,

        reactions: comps.reactions,
        comments: comps.comments,
        shares: comps.shares,

        EP: comps.EP,
        ADV: comps.ADV,
        SentimentProxy: comps.SentimentProxy,

        comments_export_coverage: comps.coverage,
        unique_comment_authors: comps.uniqueAuthors,
        comment_replies_sum: comps.repliesSum,
        Depth: comps.Depth,
        depth_available: comps.depthAvailable,

        median_reply_time_minutes: comps.rtMinutes,
        ServiceScore: comps.ServiceScore,

        BES_raw: besRaw
      });
    }
  }

  // Aggregate to (brand, source_type, period_key)
  const groupMap = new Map();
  for (const r of postRecords) {
    const key = `${r.brand}||${r.source_type}||${r.period_key}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        brand: r.brand,
        source_type: r.source_type,
        period_key: r.period_key,
        n_posts: 0,

        sum_reactions: 0,
        sum_comments: 0,
        sum_shares: 0,
        sum_EP: 0,

        // Weighted averages
        _w_sum: 0,
        _sent_w_sum: 0,
        _depth_w_sum: 0,
        _service_w_sum: 0,
        _bes_w_sum: 0,

        // Diagnostics
        depth_covered_posts: 0,
        service_covered_posts: 0
      });
    }

    const g = groupMap.get(key);
    g.n_posts += 1;
    g.sum_reactions += r.reactions;
    g.sum_comments += r.comments;
    g.sum_shares += r.shares;
    g.sum_EP += r.EP;

    const w = Math.log1p(r.EP); // exposure-like weight
    g._w_sum += w;
    g._sent_w_sum += w * r.SentimentProxy;
    g._depth_w_sum += w * r.Depth;
    g._service_w_sum += w * r.ServiceScore;
    g._bes_w_sum += w * r.BES_raw;

    if (r.depth_available) g.depth_covered_posts += 1;
    if (r.median_reply_time_minutes !== null && r.median_reply_time_minutes !== undefined) g.service_covered_posts += 1;
  }

  const groups = Array.from(groupMap.values()).map(g => {
    const denom = g._w_sum || 1;
    const out = {
      brand: g.brand,
      source_type: g.source_type,
      period_key: g.period_key,
      n_posts: g.n_posts,

      reactions: g.sum_reactions,
      comments: g.sum_comments,
      shares: g.sum_shares,

      EP: g.sum_EP,
      AdvocacyShares: g.sum_shares, // more interpretable
      SentimentProxy_avg_w: g._sent_w_sum / denom,
      Depth_avg_w: g._depth_w_sum / denom,
      ServiceScore_avg_w: g._service_w_sum / denom,

      BES_raw_avg: g._bes_w_sum / denom,

      depth_covered_posts: g.depth_covered_posts,
      service_covered_posts: g.service_covered_posts
    };
    return out;
  });

  normalizeGroups(groups, args.normalization);

  // Write outputs
  const postsCsvHeader = [
    'post_id','post_post_url','post_creation_time','period_key','source_type',
    'page_name','page_profile_url','brand','attribution_confidence',
    'reactions','comments','shares','EP','ADV','SentimentProxy',
    'comments_export_coverage','unique_comment_authors','comment_replies_sum',
    'Depth','depth_available','median_reply_time_minutes','ServiceScore','BES_raw'
  ];

  const groupsCsvHeader = [
    'brand','source_type','period_key','n_posts',
    'reactions','comments','shares','EP','AdvocacyShares',
    'SentimentProxy_avg_w','Depth_avg_w','ServiceScore_avg_w',
    'BES_raw_avg','BES_0_100',
    'depth_covered_posts','service_covered_posts'
  ];

  fs.writeFileSync(path.join(outDir, 'bes_posts.csv'), toCsv(postRecords, postsCsvHeader), 'utf-8');
  fs.writeFileSync(path.join(outDir, 'bes_brand_period.csv'), toCsv(groups, groupsCsvHeader), 'utf-8');
  fs.writeFileSync(path.join(outDir, 'bes_brand_period.json'), JSON.stringify(groups, null, 2), 'utf-8');

  // Simple run summary
  const summary = {
    input: inputPath,
    outDir,
    n_input_posts: posts.length,
    n_output_post_records: postRecords.length,
    unattributed_posts_skipped: args.includeUnattributed ? 0 : unattributedCount,
    period: args.period,
    coverageThreshold: args.coverageThreshold,
    normalization: args.normalization,
    weights: args.weights
  };
  fs.writeFileSync(path.join(outDir, 'run_summary.json'), JSON.stringify(summary, null, 2), 'utf-8');

  console.log('✅ Done.');
  console.log(`Input posts: ${posts.length}`);
  console.log(`Output post-records (after attribution explode): ${postRecords.length}`);
  if (!args.includeUnattributed) console.log(`Unattributed posts skipped: ${unattributedCount}`);
  console.log(`Wrote:
  - ${path.join(outDir, 'bes_posts.csv')}
  - ${path.join(outDir, 'bes_brand_period.csv')}
  - ${path.join(outDir, 'bes_brand_period.json')}
  - ${path.join(outDir, 'run_summary.json')}`);
}

if (require.main === module) {
  try { main(); }
  catch (e) {
    console.error('❌ Error:', e.message);
    process.exit(1);
  }
}
