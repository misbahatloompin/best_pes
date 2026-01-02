// @ts-nocheck
import React, { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  Legend,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ExternalLink, RefreshCw, Upload } from "lucide-react";

/**
 * Prime Bank Social Media Dashboard
 * - Upload bes_brand_period + bes_posts (CSV or JSON)
 * - View Prime-only by default, with optional competitor compare
 * - Includes a Follow-up Actions page to plan a +25% BES improvement
 */

const PRIME = "Prime Bank";
const DEFAULT_COMPETITOR = "BRAC Bank PLC";

// Chart colors (requested: blue vs green)
const PRIME_COLOR = "#2563EB";
const COMP_COLOR = "#16A34A";
const COMP_NEUTRAL = "#6B7280";

function DefLink({ to, children }) {
  return (
    <a
      href={`#${to}`}
      className="underline underline-offset-4 decoration-muted-foreground hover:decoration-foreground"
    >
      {children}
    </a>
  );
}

function DefTerm({ id, title, children }) {
  return (
    <div id={id} className="scroll-mt-24">
      <div className="font-medium text-foreground">{title}</div>
      <div className="text-sm text-muted-foreground mt-1">{children}</div>
    </div>
  );
}

// ---------- parsing helpers ----------
function parseCSV(text) {
  const rows = [];
  let i = 0;
  const n = text.length;
  let field = "";
  let row = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    if (row.length === 1 && row[0] === "") {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const c = text[i];

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (c === ",") {
      pushField();
      i += 1;
      continue;
    }

    if (c === "\n") {
      pushField();
      pushRow();
      i += 1;
      continue;
    }

    if (c === "\r") {
      i += 1;
      continue;
    }

    field += c;
    i += 1;
  }

  pushField();
  if (row.length) pushRow();
  if (!rows.length) return [];

  const header = rows[0].map((h) => String(h || "").trim());
  return rows
    .slice(1)
    .filter((r) => r.some((v) => String(v || "").trim() !== ""))
    .map((r) => {
      const obj = {};
      for (let j = 0; j < header.length; j++) obj[header[j]] = r[j] ?? "";
      return obj;
    });
}

function coerceNumberFields(obj) {
  const out = { ...obj };
  for (const k of Object.keys(out)) {
    const v = out[k];
    if (typeof v !== "string") continue;
    const s = v.trim();
    if (s === "") continue;
    const lk = k.toLowerCase();
    if (lk.includes("url") || lk.includes("id")) continue;
    const num = Number(s);
    if (Number.isFinite(num) && /^-?[0-9]+(\.[0-9]+)?$/.test(s)) out[k] = num;
  }
  return out;
}

function safeStr(x) {
  return x == null ? "" : String(x);
}

function normalizeWhitespace(s) {
  // IMPORTANT: keep the escape sequences as "\n" and "\t".
  // A previous edit accidentally inserted literal newlines inside quotes,
  // causing an "unterminated string constant" parser error.
  return String(s || "").replaceAll("\n", " ").replaceAll("\t", " ");
}

function parseWeekKey(k) {
  const m = /^([0-9]{4})-W([0-9]{2})$/.exec(String(k || ""));
  if (!m) return { y: 0, w: 0 };
  return { y: Number(m[1]), w: Number(m[2]) };
}

function sortWeekKeys(keys) {
  return [...keys].sort((a, b) => {
    const A = parseWeekKey(a);
    const B = parseWeekKey(b);
    if (A.y !== B.y) return A.y - B.y;
    return A.w - B.w;
  });
}

function fmtInt(v) {
  if (v === null || v === undefined || v === "") return "–";
  const n = Number(v);
  if (!Number.isFinite(n)) return "–";
  return n.toLocaleString();
}

function fmtNum(v, digits = 2) {
  if (v === null || v === undefined || v === "") return "–";
  const n = Number(v);
  if (!Number.isFinite(n)) return "–";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function fmtScored(value, scored, digits) {
  // "scored" means the metric has enough coverage to be considered reliable.
  // If coverage is below threshold but some data exists, we still surface a *partial* value
  // (computed only from rows/posts where the metric is available) and label it accordingly.
  if (scored) return fmtNum(value, digits);

  const n = Number(value);
  if (Number.isFinite(n)) return `${fmtNum(value, digits)} (partial)`;

  return "Not scored";
}

function clamp01(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function median(arr) {
  const xs = arr
    .filter((x) => Number.isFinite(Number(x)))
    .map((x) => Number(x))
    .sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  if (xs.length % 2 === 1) return xs[mid];
  return (xs[mid - 1] + xs[mid]) / 2;
}

function percentile(arr, p) {
  const xs = arr
    .filter((x) => Number.isFinite(Number(x)))
    .map((x) => Number(x))
    .sort((a, b) => a - b);
  if (!xs.length) return null;
  const idx = (xs.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return xs[lo];
  const w = idx - lo;
  return xs[lo] * (1 - w) + xs[hi] * w;
}

function pickField(row, candidates) {
  if (!row) return null;
  for (const k of candidates) {
    if (Object.prototype.hasOwnProperty.call(row, k)) return k;
  }
  return null;
}

// ---------- aggregation ----------
function aggregateBrand(rows) {
  const sum = (k) => rows.reduce((acc, r) => acc + (Number(r[k]) || 0), 0);

  const n_posts = sum("n_posts");
  const reactions = sum("reactions");
  const comments = sum("comments");
  const shares = sum("shares");
  const EP = sum("EP");
  const AdvocacyShares = sum("AdvocacyShares");
  const depth_covered_posts = sum("depth_covered_posts");
  const service_covered_posts = sum("service_covered_posts");

  const depth_coverage = n_posts ? depth_covered_posts / n_posts : 0;
  const service_coverage = n_posts ? service_covered_posts / n_posts : 0;

  // Reliability thresholds (from your spec)
  const depth_scored = depth_coverage >= 0.6;
  const service_scored = service_coverage >= 0.5;

  const wAvg = (k, wKey) => {
    const wSum = rows.reduce((acc, r) => acc + (Number(r[wKey]) || 0), 0);
    if (!wSum) return null;
    const num = rows.reduce(
      (acc, r) => acc + (Number(r[k]) || 0) * (Number(r[wKey]) || 0),
      0
    );
    return num / wSum;
  };

  const SentimentProxy_avg_w = wAvg("SentimentProxy_avg_w", "n_posts");

  // Compute available averages regardless of reliability threshold.
  const Depth_avg_w = depth_covered_posts > 0 ? wAvg("Depth_avg_w", "depth_covered_posts") : null;
  const ServiceScore_avg_w =
    service_covered_posts > 0 ? wAvg("ServiceScore_avg_w", "service_covered_posts") : null;

  const BES_raw_avg = wAvg("BES_raw_avg", "n_posts");
  const BES_0_100 = wAvg("BES_0_100", "n_posts");

  const EP_per_post = n_posts ? EP / n_posts : 0;
  const Advocacy_per_post = n_posts ? AdvocacyShares / n_posts : 0;
  const engagement_components = reactions + comments + shares;

  return {
    n_posts,
    reactions,
    comments,
    shares,
    EP,
    AdvocacyShares,
    depth_covered_posts,
    service_covered_posts,
    depth_coverage,
    service_coverage,
    depth_scored,
    service_scored,
    SentimentProxy_avg_w,
    Depth_avg_w,
    ServiceScore_avg_w,
    BES_raw_avg,
    BES_0_100,
    EP_per_post,
    Advocacy_per_post,
    engagement_components,
  };
}

function kpiDelta(a, b) {
  const A = Number(a);
  const B = Number(b);
  if (!Number.isFinite(A) || !Number.isFinite(B)) return { pct: 0, dir: "flat", valid: false };
  if (A === 0 && B === 0) return { pct: 0, dir: "flat", valid: true };
  if (B === 0) return { pct: 1, dir: "up", valid: true };
  const pct = (A - B) / Math.abs(B);
  return {
    pct,
    dir: pct > 0.02 ? "up" : pct < -0.02 ? "down" : "flat",
    valid: true,
  };
}

function DeltaBadge({ a, b }) {
  const { pct, dir, valid } = kpiDelta(a, b);
  if (!valid) return null;
  const label = `${pct >= 0 ? "+" : ""}${(pct * 100).toFixed(0)}%`;
  const variant = dir === "up" ? "default" : dir === "down" ? "destructive" : "secondary";
  return (
    <Badge variant={variant} className="ml-2">
      {label}
    </Badge>
  );
}

// ---------- UI components ----------
function MiniValue({ label, value, hint }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold leading-tight">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function ScoreMetric({
  title,
  primeValue,
  compValue,
  primeDisplay,
  compDisplay,
  competitor,
  showCompetitor,
  showDelta = true,
  hint,
}) {
  return (
    <div className="rounded-2xl border p-4">
      <div className="text-sm font-medium">{title}</div>
      <div className={`grid ${showCompetitor ? "grid-cols-2" : "grid-cols-1"} gap-3 mt-3`}>
        <div className="rounded-xl border p-3">
          <div className="text-xs text-muted-foreground">{PRIME}</div>
          <div className="text-xl font-semibold mt-1">{primeDisplay}</div>
        </div>
        {showCompetitor ? (
          <div className="rounded-xl border p-3">
            <div className="text-xs text-muted-foreground">{competitor}</div>
            <div className="text-xl font-semibold mt-1 flex items-center">
              {compDisplay}
              {showDelta ? <DeltaBadge a={primeValue} b={compValue} /> : null}
            </div>
          </div>
        ) : null}
      </div>
      {hint ? <div className="text-xs text-muted-foreground mt-2">{hint}</div> : null}
    </div>
  );
}

function Scorecard({ competitor, showCompetitor, primeAgg, compAgg }) {
  const p = primeAgg;
  const c = compAgg;

  const depthHint = `Depth coverage (Prime): ${fmtInt(p.depth_covered_posts)} / ${fmtInt(
    p.n_posts
  )} (${(p.depth_coverage * 100).toFixed(0)}%)`;

  const serviceHint = showCompetitor
    ? `Reply-time coverage — Prime: ${(p.service_coverage * 100).toFixed(0)}%, ${competitor}: ${(
        c.service_coverage * 100
      ).toFixed(0)}%.`
    : `Reply-time coverage (Prime): ${(p.service_coverage * 100).toFixed(0)}%.`;

  const showDepthDelta = showCompetitor && p.depth_scored && c.depth_scored;
  const showServiceDelta = showCompetitor && p.service_scored && c.service_scored;

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Scorecard</CardTitle>
        <div className="text-xs text-muted-foreground">
          {PRIME}
          {showCompetitor ? (
            <>
              {" "}vs <span className="font-medium">{competitor}</span>
            </>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <ScoreMetric
            title={
              <>
                <DefLink to="def-ep">EP</DefLink> (total)
              </>
            }
            primeValue={p.EP}
            compValue={c.EP}
            primeDisplay={fmtInt(p.EP)}
            compDisplay={fmtInt(c.EP)}
            competitor={competitor}
            showCompetitor={showCompetitor}
          />
          <ScoreMetric
            title={
              <>
                <DefLink to="def-ep">EP</DefLink> per post
              </>
            }
            primeValue={p.EP_per_post}
            compValue={c.EP_per_post}
            primeDisplay={fmtNum(p.EP_per_post, 1)}
            compDisplay={fmtNum(c.EP_per_post, 1)}
            competitor={competitor}
            showCompetitor={showCompetitor}
          />
          <ScoreMetric
            title="Posts (volume)"
            primeValue={p.n_posts}
            compValue={c.n_posts}
            primeDisplay={fmtInt(p.n_posts)}
            compDisplay={fmtInt(c.n_posts)}
            competitor={competitor}
            showCompetitor={showCompetitor}
          />
          <ScoreMetric
            title={
              <>
                <DefLink to="def-advocacy">Advocacy shares</DefLink> (total)
              </>
            }
            primeValue={p.AdvocacyShares}
            compValue={c.AdvocacyShares}
            primeDisplay={fmtInt(p.AdvocacyShares)}
            compDisplay={fmtInt(c.AdvocacyShares)}
            competitor={competitor}
            showCompetitor={showCompetitor}
            showDelta={showCompetitor}
          />

          <ScoreMetric
            title={
              <>
                <DefLink to="def-sentiment">Sentiment</DefLink> (avg)
              </>
            }
            primeValue={p.SentimentProxy_avg_w}
            compValue={c.SentimentProxy_avg_w}
            primeDisplay={fmtNum(p.SentimentProxy_avg_w, 3)}
            compDisplay={fmtNum(c.SentimentProxy_avg_w, 3)}
            competitor={competitor}
            showCompetitor={showCompetitor}
          />
          <ScoreMetric
            title={
              <>
                <DefLink to="def-depth">Conversation depth</DefLink> (avg)
              </>
            }
            primeValue={p.Depth_avg_w}
            compValue={c.Depth_avg_w}
            primeDisplay={fmtScored(p.Depth_avg_w, p.depth_scored, 2)}
            compDisplay={fmtScored(c.Depth_avg_w, c.depth_scored, 2)}
            competitor={competitor}
            showCompetitor={showCompetitor}
            showDelta={showDepthDelta}
            hint={depthHint}
          />
          <ScoreMetric
            title={
              <>
                <DefLink to="def-service">Service score</DefLink> (avg)
              </>
            }
            primeValue={p.ServiceScore_avg_w}
            compValue={c.ServiceScore_avg_w}
            primeDisplay={fmtScored(p.ServiceScore_avg_w, p.service_scored, 3)}
            compDisplay={fmtScored(c.ServiceScore_avg_w, c.service_scored, 3)}
            competitor={competitor}
            showCompetitor={showCompetitor}
            showDelta={showServiceDelta}
            hint={serviceHint}
          />
          <ScoreMetric
            title={
              <>
                <DefLink to="def-bes">BES</DefLink> (raw avg)
              </>
            }
            primeValue={p.BES_raw_avg}
            compValue={c.BES_raw_avg}
            primeDisplay={fmtNum(p.BES_raw_avg, 3)}
            compDisplay={fmtNum(c.BES_raw_avg, 3)}
            competitor={competitor}
            showCompetitor={showCompetitor}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function TopPostsTable({ rows, title, metricLabel }) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="text-xs text-muted-foreground">Sorted by {metricLabel}</div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background">
              <tr className="text-left border-b">
                <th className="py-2 pr-3 font-medium">When</th>
                <th className="py-2 pr-3 font-medium">Where</th>
                <th className="py-2 pr-3 font-medium">
                  <DefLink to="def-ep">EP</DefLink>
                </th>
                <th className="py-2 pr-3 font-medium">
                  <DefLink to="def-sentiment">Sent</DefLink>
                </th>
                <th className="py-2 pr-3 font-medium">
                  <DefLink to="def-depth">Depth</DefLink>
                </th>
                <th className="py-2 pr-3 font-medium">
                  <DefLink to="def-service">Service</DefLink>
                </th>
                <th className="py-2 pr-3 font-medium">Link</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={`${r.post_id}-${r.brand}-${r.source_type}`}
                  className="border-b last:border-0"
                >
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <div className="font-medium">{safeStr(r.period_key)}</div>
                    <div className="text-xs text-muted-foreground">
                      {safeStr(r.post_creation_time).slice(0, 10)}
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <div className="line-clamp-2">{safeStr(r.page_name)}</div>
                    <div className="text-xs text-muted-foreground">{safeStr(r.source_type)}</div>
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">{fmtInt(r.EP)}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{fmtNum(r.SentimentProxy, 3)}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">{fmtNum(r.Depth, 2)}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    {r.ServiceScore === null || r.ServiceScore === undefined || r.ServiceScore === ""
                      ? "Not scored"
                      : fmtNum(r.ServiceScore, 3)}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <a
                      href={safeStr(r.post_post_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm underline"
                    >
                      Open <ExternalLink className="h-4 w-4" />
                    </a>
                  </td>
                </tr>
              ))}
              {!rows.length ? (
                <tr>
                  <td className="py-6 text-muted-foreground" colSpan={7}>
                    No posts match the current filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function SmallBar({ title, data, valueKey, color = PRIME_COLOR, height = 160 }) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period_key" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v) =>
                  Number.isFinite(Number(v)) ? Number(v).toLocaleString() : v
                }
              />
              <Bar dataKey={valueKey} fill={color} radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- data loading ----------
function detectDatasetKind(rows) {
  if (!rows || !rows.length) return "unknown";
  const keys = new Set(Object.keys(rows[0] || {}));
  if (keys.has("post_id") || keys.has("post_post_url")) return "posts";
  if (keys.has("period_key") && keys.has("brand") && keys.has("BES_raw_avg")) return "brand_period";
  return "unknown";
}

async function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsText(file);
  });
}

async function parseDataFile(file) {
  const text = await readFileAsText(file);
  const name = (file.name || "").toLowerCase();
  if (name.endsWith(".json")) {
    const parsed = JSON.parse(text);
    const rows = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.rows) ? parsed.rows : [];
    return rows.map(coerceNumberFields);
  }
  return parseCSV(text).map(coerceNumberFields);
}

function runSelfTestsOnce() {
  if (typeof window === "undefined") return;
  if (window.__PB_DASH_TESTED__) return;
  window.__PB_DASH_TESTED__ = true;

  const assert = (cond, msg) => {
    if (!cond) throw new Error(`Self-test failed: ${msg}`);
  };

  const a = parseWeekKey("2025-W07");
  assert(a.y === 2025 && a.w === 7, "parseWeekKey should parse year/week");

  const sorted = sortWeekKeys(["2025-W10", "2024-W52", "2025-W01"]);
  assert(
    JSON.stringify(sorted) === JSON.stringify(["2024-W52", "2025-W01", "2025-W10"]),
    "sortWeekKeys should sort chronologically"
  );

  assert(
    normalizeWhitespace("a\nb\tc") === "a b c",
    "normalizeWhitespace should replace newline/tab with spaces"
  );

  const agg = aggregateBrand([
    {
      n_posts: 2,
      reactions: 10,
      comments: 4,
      shares: 1,
      EP: 100,
      AdvocacyShares: 3,
      depth_covered_posts: 2,
      service_covered_posts: 1,
      SentimentProxy_avg_w: 0.2,
      Depth_avg_w: 5,
      ServiceScore_avg_w: 0.5,
      BES_raw_avg: 0.3,
      BES_0_100: 50,
    },
    {
      n_posts: 1,
      reactions: 2,
      comments: 1,
      shares: 0,
      EP: 20,
      AdvocacyShares: 0,
      depth_covered_posts: 0,
      service_covered_posts: 0,
      SentimentProxy_avg_w: 0.4,
      Depth_avg_w: 0,
      ServiceScore_avg_w: 0,
      BES_raw_avg: 0.1,
      BES_0_100: 0,
    },
  ]);

  assert(agg.n_posts === 3, "aggregateBrand sums n_posts");
  assert(agg.EP === 120, "aggregateBrand sums EP");
  assert(Math.abs(agg.EP_per_post - 40) < 1e-9, "EP_per_post computed");
  assert(agg.depth_scored === true, "depth_scored true when coverage >= 0.6");
  assert(agg.service_scored === false, "service_scored false when coverage < 0.5");
  assert(
    Math.abs(agg.ServiceScore_avg_w - 0.5) < 1e-9,
    "ServiceScore_avg_w computed as partial when some data exists"
  );

  assert(String(fmtScored(0.5, false, 3)).toLowerCase().includes("partial"), "fmtScored labels partial");

  assert(median([1, 2, 3]) === 2, "median odd length");
  assert(median([1, 2, 3, 4]) === 2.5, "median even length");

  assert(fmtNum(null) === "–", "fmtNum null should be dash");
  assert(fmtInt(undefined) === "–", "fmtInt undefined should be dash");

  assert(detectDatasetKind([{ post_id: "x" }]) === "posts", "detect posts");
  assert(
    detectDatasetKind([{ brand: "A", period_key: "2025-W01", BES_raw_avg: 0.1 }]) === "brand_period",
    "detect brand_period"
  );
}

function DataLoader({ onLoad }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleFiles = async (fileList) => {
    setError("");
    if (!fileList?.length) return;
    setBusy(true);
    try {
      let brandPeriod = null;
      let posts = null;

      for (const file of Array.from(fileList)) {
        const rows = await parseDataFile(file);
        const kind = detectDatasetKind(rows);
        if (kind === "brand_period") brandPeriod = rows;
        else if (kind === "posts") posts = rows;
      }

      if (!brandPeriod || !posts) {
        const missing = [!brandPeriod ? "bes_brand_period" : null, !posts ? "bes_posts" : null]
          .filter(Boolean)
          .join(" and ");
        throw new Error(`Could not detect ${missing}. Please upload both datasets (JSON or CSV).`);
      }

      onLoad({ brandPeriod, posts });
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Load datasets</CardTitle>
        <div className="text-xs text-muted-foreground">
          Upload <span className="font-medium">bes_brand_period</span> and{" "}
          <span className="font-medium">bes_posts</span> (CSV or JSON).
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <label className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2 cursor-pointer hover:bg-muted">
            <Upload className="h-4 w-4" />
            <span className="text-sm font-medium">Choose files</span>
            <input
              type="file"
              className="hidden"
              accept=".csv,.json"
              multiple
              onChange={(e) => handleFiles(e.target.files)}
            />
          </label>
          <div className="text-xs text-muted-foreground">Tip: upload JSON exports to avoid CSV parsing quirks.</div>
        </div>
        {busy ? <div className="text-sm">Loading…</div> : null}
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
      </CardContent>
    </Card>
  );
}

// ---------- executive summary ----------
function ExecutiveSummaryPage({ brandPeriod, posts, competitor, showCompetitor }) {
  const getPeriods = (src) => {
    const keys = brandPeriod
      .filter((r) => r.source_type === src)
      .map((r) => String(r.period_key || "").trim())
      .filter(Boolean);
    return sortWeekKeys(Array.from(new Set(keys)));
  };

  const getQuarter = (sortedKeys, n = 13) => {
    const q = sortedKeys.slice(Math.max(0, sortedKeys.length - n));
    const startIdx = Math.max(0, sortedKeys.length - q.length);
    const prev = sortedKeys.slice(Math.max(0, startIdx - q.length), startIdx);
    return { quarter: q, prev };
  };

  const mkAgg = (src, brand, keys) => {
    const set = new Set(keys);
    const rows = brandPeriod.filter(
      (r) => r.source_type === src && r.brand === brand && set.has(String(r.period_key))
    );
    return aggregateBrand(rows);
  };

  const mkTrend = (src, keys, metricField) => {
    const set = new Set(keys);
    const pMap = new Map(
      brandPeriod
        .filter((r) => r.source_type === src && r.brand === PRIME && set.has(String(r.period_key)))
        .map((r) => [String(r.period_key), r])
    );
    const cMap = new Map(
      brandPeriod
        .filter((r) => r.source_type === src && r.brand === competitor && set.has(String(r.period_key)))
        .map((r) => [String(r.period_key), r])
    );

    const calc = (row) => {
      if (!row) return null;
      const v = row[metricField];
      return v === null || v === undefined || v === "" ? null : Number(v);
    };

    return keys.map((k) => ({
      period_key: k,
      prime: calc(pMap.get(k)),
      competitor: calc(cMap.get(k)),
    }));
  };

  const pickTopPosts = (src, keys, n = 3) => {
    const set = new Set(keys);
    const rows = posts.filter(
      (p) => p.brand === PRIME && p.source_type === src && set.has(String(p.period_key))
    );
    const besKey = pickField(rows?.[0] || null, ["BES_raw", "BES", "bes_raw", "bes"]);
    const epKey = pickField(rows?.[0] || null, ["EP", "ep"]);
    const score = (p) => {
      if (besKey && Number.isFinite(Number(p[besKey]))) return Number(p[besKey]);
      return Number(p[epKey]) || 0;
    };
    return [...rows].sort((a, b) => score(b) - score(a)).slice(0, n);
  };

  const ownedKeys = useMemo(() => getPeriods("owned"), [brandPeriod]);
  const earnedKeys = useMemo(() => getPeriods("earned"), [brandPeriod]);

  const ownedQ = useMemo(() => getQuarter(ownedKeys, 13), [ownedKeys]);
  const earnedQ = useMemo(() => getQuarter(earnedKeys, 13), [earnedKeys]);

  const ownedPrime = useMemo(() => mkAgg("owned", PRIME, ownedQ.quarter), [brandPeriod, ownedQ.quarter]);
  const earnedPrime = useMemo(() => mkAgg("earned", PRIME, earnedQ.quarter), [brandPeriod, earnedQ.quarter]);

  const ownedComp = useMemo(() => mkAgg("owned", competitor, ownedQ.quarter), [brandPeriod, competitor, ownedQ.quarter]);
  const earnedComp = useMemo(() => mkAgg("earned", competitor, earnedQ.quarter), [brandPeriod, competitor, earnedQ.quarter]);

  const ownedPrimePrev = useMemo(() => mkAgg("owned", PRIME, ownedQ.prev), [brandPeriod, ownedQ.prev]);
  const earnedPrimePrev = useMemo(() => mkAgg("earned", PRIME, earnedQ.prev), [brandPeriod, earnedQ.prev]);

  const ownedTrendBES = useMemo(() => mkTrend("owned", ownedQ.quarter, "BES_raw_avg"), [brandPeriod, competitor, ownedQ.quarter]);
  const earnedTrendBES = useMemo(() => mkTrend("earned", earnedQ.quarter, "BES_raw_avg"), [brandPeriod, competitor, earnedQ.quarter]);

  const topOwned = useMemo(() => pickTopPosts("owned", ownedQ.quarter, 3), [posts, ownedQ.quarter]);
  const topEarned = useMemo(() => pickTopPosts("earned", earnedQ.quarter, 3), [posts, earnedQ.quarter]);

  const quarterLabel = (keys) => {
    if (!keys.length) return "–";
    const first = keys[0];
    const last = keys[keys.length - 1];
    return `${first} → ${last} (${keys.length} periods)`;
  };

  const deltaText = (curr, prev) => {
    const d = kpiDelta(curr, prev);
    if (!d.valid) return "–";
    const pct = (d.pct * 100).toFixed(0);
    return `${pct >= 0 ? "+" : ""}${pct}% vs prior quarter`;
  };

  const Section = ({ title, subtitle, children }) => (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        {subtitle ? <div className="text-xs text-muted-foreground">{subtitle}</div> : null}
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );

  const QuarterTrend = ({ title, data }) => (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <div className="text-xs text-muted-foreground">BES (raw) by period</div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="h-[240px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period_key" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => (Number.isFinite(Number(v)) ? fmtNum(v, 3) : v)} />
              {showCompetitor ? <Legend /> : null}
              <Line
                type="monotone"
                dataKey="prime"
                name={PRIME}
                stroke={PRIME_COLOR}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              {showCompetitor ? (
                <Line
                  type="monotone"
                  dataKey="competitor"
                  name={competitor}
                  stroke={COMP_COLOR}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ) : null}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );

  const PostPills = ({ rows }) => {
    if (!rows?.length) return <div className="text-sm text-muted-foreground">No posts found in the last quarter.</div>;
    return (
      <div className="flex flex-wrap gap-2">
        {rows.map((p) => (
          <a
            key={String(p.post_id)}
            href={safeStr(p.post_post_url)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs hover:bg-muted"
            title={safeStr(p.page_name)}
          >
            <span className="font-medium">{safeStr(p.period_key)}</span>
            <span className="text-muted-foreground truncate max-w-[240px]">{safeStr(p.page_name)}</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <Section
        title="Executive summary"
        subtitle={`Last quarter snapshot across Owned and Earned. ${showCompetitor ? `Benchmarking vs ${competitor}.` : "Prime Bank only."}`}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border p-4">
            <div className="text-sm font-medium">Owned — last quarter</div>
            <div className="text-xs text-muted-foreground mt-1">{quarterLabel(ownedQ.quarter)}</div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <MiniValue label={<><DefLink to="def-bes">BES</DefLink> (raw avg)</>} value={fmtNum(ownedPrime.BES_raw_avg, 3)} hint={deltaText(ownedPrime.BES_raw_avg, ownedPrimePrev.BES_raw_avg)} />
              <MiniValue label={<><DefLink to="def-ep">EP</DefLink> per post</>} value={fmtNum(ownedPrime.EP_per_post, 1)} />
              <MiniValue label="Posts" value={fmtInt(ownedPrime.n_posts)} />
              <MiniValue label={<DefLink to="def-advocacy">Advocacy shares</DefLink>} value={fmtInt(ownedPrime.AdvocacyShares)} />
              <MiniValue label={<DefLink to="def-sentiment">Sentiment</DefLink>} value={fmtNum(ownedPrime.SentimentProxy_avg_w, 3)} />
              <MiniValue label={<DefLink to="def-depth">Conversation depth</DefLink>} value={fmtScored(ownedPrime.Depth_avg_w, ownedPrime.depth_scored, 2)} />
              <MiniValue label={<DefLink to="def-service">Service score</DefLink>} value={fmtScored(ownedPrime.ServiceScore_avg_w, ownedPrime.service_scored, 3)} />
            </div>
            {showCompetitor ? (
              <div className="mt-3 text-xs text-muted-foreground">
                Benchmark (Owned): {competitor} BES {fmtNum(ownedComp.BES_raw_avg, 3)} • EP/post {fmtNum(ownedComp.EP_per_post, 1)}
              </div>
            ) : null}
          </div>

          <div className="rounded-2xl border p-4">
            <div className="text-sm font-medium">Earned — last quarter</div>
            <div className="text-xs text-muted-foreground mt-1">{quarterLabel(earnedQ.quarter)}</div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <MiniValue label={<><DefLink to="def-bes">BES</DefLink> (raw avg)</>} value={fmtNum(earnedPrime.BES_raw_avg, 3)} hint={deltaText(earnedPrime.BES_raw_avg, earnedPrimePrev.BES_raw_avg)} />
              <MiniValue label={<><DefLink to="def-ep">EP</DefLink> per post</>} value={fmtNum(earnedPrime.EP_per_post, 1)} />
              <MiniValue label="Posts" value={fmtInt(earnedPrime.n_posts)} />
              <MiniValue label={<DefLink to="def-advocacy">Advocacy shares</DefLink>} value={fmtInt(earnedPrime.AdvocacyShares)} />
              <MiniValue label={<DefLink to="def-sentiment">Sentiment</DefLink>} value={fmtNum(earnedPrime.SentimentProxy_avg_w, 3)} />
              <MiniValue label={<DefLink to="def-depth">Conversation depth</DefLink>} value={fmtScored(earnedPrime.Depth_avg_w, earnedPrime.depth_scored, 2)} />
              <MiniValue label={<DefLink to="def-service">Service score</DefLink>} value={fmtScored(earnedPrime.ServiceScore_avg_w, earnedPrime.service_scored, 3)} />
            </div>
            {showCompetitor ? (
              <div className="mt-3 text-xs text-muted-foreground">
                Benchmark (Earned): {competitor} BES {fmtNum(earnedComp.BES_raw_avg, 3)} • EP/post {fmtNum(earnedComp.EP_per_post, 1)}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
          <QuarterTrend title="Owned BES trend (last quarter)" data={ownedTrendBES} />
          <QuarterTrend title="Earned BES trend (last quarter)" data={earnedTrendBES} />
        </div>
      </Section>

      <Section title="What performed best (last quarter)" subtitle="Quick links to the posts most responsible for results in the last quarter.">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border p-4">
            <div className="text-sm font-medium">Prime Bank — Owned</div>
            <div className="text-xs text-muted-foreground mt-1">Top posts in the quarter</div>
            <div className="mt-3"><PostPills rows={topOwned} /></div>
          </div>
          <div className="rounded-2xl border p-4">
            <div className="text-sm font-medium">Prime Bank — Earned</div>
            <div className="text-xs text-muted-foreground mt-1">Top posts in the quarter</div>
            <div className="mt-3"><PostPills rows={topEarned} /></div>
          </div>
        </div>
      </Section>

      <Section title="Suggested improvements (short)" subtitle="A concise set of next steps tied to the Follow-up actions backlog.">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border p-4">
            <div className="text-sm font-medium">What to do next</div>
            <ul className="mt-3 text-sm text-muted-foreground list-disc pl-5 space-y-2">
              <li>
                Build an always-on stream of practical, shareable posts that customers save and forward.
                <span className="ml-2"><a className="underline" href="#init-PB-EPIC-01">See PB-EPIC-01</a></span>
              </li>
              <li>
                Improve the tone mix with real community impact stories (higher positive reactions and advocacy).
                <span className="ml-2"><a className="underline" href="#init-PB-EPIC-02">See PB-EPIC-02</a></span>
              </li>
              <li>
                Strengthen responsiveness where service data exists (faster replies, clearer handoffs) to protect sentiment in comment threads.
                <span className="ml-2"><a className="underline" href="#init-PB-EPIC-03">See PB-EPIC-03</a></span>
              </li>
              <li>
                Run a scheduled Q&A and recycle highlights as short videos to increase conversation depth.
                <span className="ml-2"><a className="underline" href="#init-PB-EPIC-04">See PB-EPIC-04</a></span>
              </li>
              <li>
                Transfer the most effective community-style prompts from Earned into page posts to unlock deeper threads.
                <span className="ml-2"><a className="underline" href="#init-PB-EPIC-05">See PB-EPIC-05</a></span>
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border p-4">
            <div className="text-sm font-medium">How this lifts BES</div>
            <div className="mt-3 text-sm text-muted-foreground space-y-3">
              <div><span className="font-medium text-foreground">Higher engagement</span>: education-first formats typically increase saves, shares, and comment activity.</div>
              <div><span className="font-medium text-foreground">Better sentiment</span>: clearer guidance and human stories reduce frustration and attract more positive reactions.</div>
              <div><span className="font-medium text-foreground">Deeper conversations</span>: prompts + Q&A formats increase back-and-forth discussion when coverage supports it.</div>
              <div><span className="font-medium text-foreground">Stronger service signal</span>: consistent replies (where reply-time exists) improve the service component without guessing.</div>
              <div className="text-xs text-muted-foreground">Tip: switch to the <span className="font-medium">Follow-up actions</span> tab for the 6-week rollout plan.</div>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

// ---------- glossary ----------
function GlossaryPage() {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Glossary</CardTitle>
        <div className="text-xs text-muted-foreground">
          Plain-language definitions used across the dashboard. Click any linked term to jump here.
        </div>
      </CardHeader>
      <CardContent className="pt-0 text-sm text-muted-foreground space-y-4">
        <div>
          These metrics are meant to be read like a story: <DefLink to="def-ep">engagement</DefLink> tells you how much attention content earned, <DefLink to="def-sentiment">sentiment</DefLink> hints at how people felt, <DefLink to="def-depth">depth</DefLink> shows whether conversations formed, and <DefLink to="def-service">service</DefLink> reflects how quickly pages tend to respond when reply-time data exists. <DefLink to="def-bes">BES</DefLink> is the roll-up score.
        </div>

        <div className="space-y-4">
          <DefTerm id="def-owned" title="Owned">
            Posts published on the bank’s own Facebook pages. This view usually behaves like classic brand content: reactions and shares tend to be a bigger part of the engagement mix.
          </DefTerm>

          <DefTerm id="def-earned" title="Earned">
            Posts that appear on external pages, groups, or communities but are attributed to the brand in the dataset. Earned posts often generate longer comment threads, so “conversation” metrics can matter more here.
          </DefTerm>

          <DefTerm id="def-ep" title="EP (Engagement Points)">
            A single “overall interaction” score that combines reactions, comments, and shares. It’s designed so that actions that take more effort or create more reach count more than a simple reaction. Use EP to compare which brand (or which period) generated more total audience activity.
            <div className="mt-2">
              EP is calculated as: reactions + 2×comments + 3×shares.
            </div>
          </DefTerm>

          <DefTerm id="def-sentiment" title="Sentiment proxy">
            A lightweight mood signal based on the mix of positive versus negative reactions. Because it is normalized, a post with many reactions doesn’t automatically look “more emotional” than a smaller post — it’s about the balance of reaction types.
            <div className="mt-2">
              Sentiment proxy is calculated as: (Love + Care + Wow + Haha − Sad − Angry) divided by total reactions.
            </div>
          </DefTerm>

          <DefTerm id="def-depth" title="Conversation depth">
            A measure of whether people actually talked (and replied to each other), not just clicked reactions. We only treat depth as “scored” when comment export coverage is strong (at least 60%). If coverage is lower, you may still see a partial value — it is based only on posts where the required comment data exists.
            <div className="mt-2">
              How to interpret it: higher depth usually means more unique people participated and more replies happened inside threads (not just one-off comments).
            </div>
          </DefTerm>

          <DefTerm id="def-service" title="Service score">
            A responsiveness proxy based on reply speed in comment threads (when reply-time is available). Faster replies imply better responsiveness, but we do not “guess” it: if reply-time is missing for most posts in the selected slice, service is shown as <span className="font-medium text-foreground">Not scored</span>.
            <div className="mt-2">
              When reply-time is available, service score rewards faster typical replies. When it isn’t available for most rows, we keep it unscored to avoid inventing support performance.
            </div>
          </DefTerm>

          <DefTerm id="def-advocacy" title="Advocacy shares">
            Shares that are tagged as advocacy in the dataset. Think of this as “amplification”: people not only engaged, they also helped distribute the content.
          </DefTerm>

          <DefTerm id="def-bes" title="BES (Brand Experience Score)">
            The composite score used to summarize performance across multiple dimensions: how much attention content earned (<DefLink to="def-ep">EP</DefLink>), how people reacted emotionally (<DefLink to="def-sentiment">sentiment</DefLink>), whether conversation formed (<DefLink to="def-depth">depth</DefLink>), and whether pages responded quickly when data exists (<DefLink to="def-service">service</DefLink>), plus advocacy-style sharing.
            <div className="mt-2">
              BES is computed separately for <DefLink to="def-owned">Owned</DefLink> and <DefLink to="def-earned">Earned</DefLink> because their engagement dynamics differ (group posts often skew toward comments; page posts often skew toward reactions/shares).
            </div>
            <div className="mt-2">
              In this dashboard, <span className="font-medium text-foreground">BES (raw)</span> is best for trend comparisons over time. <span className="font-medium text-foreground">BES (0–100)</span> is a within-period, within-source-type index that’s mainly useful for ranking within the same week/month.
            </div>
          </DefTerm>
        </div>

        <div>
          Tip: if you see “partial” or missing values for <DefLink to="def-depth">depth</DefLink> or <DefLink to="def-service">service</DefLink>, it usually means the underlying exports didn’t include enough comment/reply data for that slice — not that performance was truly zero.
        </div>
      </CardContent>
    </Card>
  );
}

// ---------- follow-up actions ----------
function ActionsPage({ brandPeriod, posts }) {
  // Pick a single competitor for tone/format inspiration in examples.
  const competitorForInspo = useMemo(() => {
    const brands = Array.from(new Set(brandPeriod.map((r) => String(r.brand || "").trim()))).filter(
      (b) => b && b !== PRIME
    );
    if (!brands.length) return DEFAULT_COMPETITOR;
    if (brands.includes(DEFAULT_COMPETITOR)) return DEFAULT_COMPETITOR;

    const totals = new Map();
    for (const r of brandPeriod) {
      const b = String(r.brand || "").trim();
      if (!b || b === PRIME) continue;
      totals.set(b, (totals.get(b) || 0) + (Number(r.EP) || 0));
    }
    const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]);
    return ranked[0]?.[0] || brands[0];
  }, [brandPeriod]);

  // --- slices ---
  const primeOwnedBP = useMemo(
    () => brandPeriod.filter((r) => r.brand === PRIME && r.source_type === "owned"),
    [brandPeriod]
  );
  const ownedAgg = useMemo(() => aggregateBrand(primeOwnedBP), [primeOwnedBP]);

  // Detect optional text field for hashing/tonality hints.
  const postTextField = useMemo(() => {
    const sample = posts?.[0] || null;
    return pickField(sample, [
      "post_message",
      "message",
      "text",
      "post_text",
      "caption",
      "post_caption",
      "body",
    ]);
  }, [posts]);

  const postFields = useMemo(() => {
    const sample = posts?.[0] || null;
    return {
      bes: pickField(sample, ["BES_raw", "BES", "bes_raw", "bes"]),
      ep: pickField(sample, ["EP", "ep"]),
    };
  }, [posts]);

  const pickTopPosts = (brand, sourceType, n = 3) => {
    const rows = posts.filter((p) => p.brand === brand && p.source_type === sourceType);
    const besKey = postFields.bes;
    const epKey = postFields.ep;

    const score = (p) => {
      if (besKey && Number.isFinite(Number(p[besKey]))) return Number(p[besKey]);
      return Number(p[epKey]) || 0;
    };

    return [...rows].sort((a, b) => score(b) - score(a)).slice(0, n);
  };

  const topPrimeOwned = useMemo(() => pickTopPosts(PRIME, "owned", 3), [posts, postFields]);
  const topPrimeEarned = useMemo(() => pickTopPosts(PRIME, "earned", 3), [posts, postFields]);
  const topCompOwned = useMemo(
    () => pickTopPosts(competitorForInspo, "owned", 3),
    [posts, postFields, competitorForInspo]
  );

  // --- Backlog builder: initiatives + work items (bank-friendly naming) ---
  const recipes = useMemo(() => {
    const makeItem = (id, title, why, deliverables, completion, owner, points, weeks) => ({
      id,
      title,
      why,
      deliverables,
      completion,
      owner,
      points,
      weeks,
    });

    const initiative = (key, title, objective, why, focus, owner, points, items, inspiredBy) => ({
      key,
      title,
      objective,
      why,
      focus,
      owner,
      points,
      items,
      inspiredBy,
    });

    const eps = [];

    eps.push(
      initiative(
        "PB-EPIC-01",
        "Always-on ‘Prime Money Smart’ series (education-first)",
        "Earn more saves, shares, and comments by publishing predictable, genuinely useful financial literacy content (not promos).",
        "Education posts are more likely to be saved and shared, and they reduce confusion—lifting both engagement and mood.",
        ["More sharing", "More helpful engagement", "Better sentiment"],
        "Digital Content & Community Lead",
        13,
        [
          makeItem(
            "PB-01.1",
            "Set 4 weekly content themes mapped to Prime’s products",
            "Clear themes make the page easier to follow and easier to plan.",
            [
              "Agree 4 themes: savings & deposits, cards & offers, digital banking how-tos, SME basics",
              "Create 6 reusable formats per theme (carousel, short video, infographic, Q&A, customer story, myth-busting)",
              "Write a short ‘Prime voice’ checklist: courteous, clear, customer-first",
            ],
            [
              "A 4-week calendar exists with at least 3 options per theme",
              "Each template has a clear opening, one key takeaway, and one next step",
            ],
            "Digital Content Lead",
            5,
            [1]
          ),
          makeItem(
            "PB-01.2",
            "Produce 8 high-clarity assets (4 carousels + 4 short videos)",
            "Short and swipeable formats improve reach and reshares.",
            [
              "Design 4 carousel posts with big headers and minimal text",
              "Record 4 short videos (20–35 seconds) with on-brand subtitles",
              "Add a tasteful ‘save and share if useful’ prompt (avoid engagement bait)",
            ],
            [
              "8 assets are scheduled in Meta Business Suite",
              "Benefit is visible in the first slide / first 2 seconds",
            ],
            "Creative Studio Lead",
            5,
            [2, 3]
          ),
          makeItem(
            "PB-01.3",
            "Turn comments into guided conversations",
            "Early replies and good prompts create healthier threads.",
            [
              "Add one open question per post",
              "Reply to early questions quickly and pin a starter comment with safe guidance",
              "Capture the top 3 questions weekly to shape the next content drop",
            ],
            [
              "At least 75% of posts include a purposeful prompt",
              "Weekly ‘top questions’ list is produced and used",
            ],
            "Community Manager",
            3,
            [3, 4, 5, 6]
          ),
        ],
        { primeOwned: topPrimeOwned, primeEarned: topPrimeEarned, competitor: topCompOwned }
      )
    );

    eps.push(
      initiative(
        "PB-EPIC-02",
        "Community impact storytelling (trust and warmth)",
        "Increase positive reactions and meaningful sharing by highlighting Prime’s real-world impact in a human way.",
        "Purpose-led stories build trust and tend to attract more positive reactions and advocacy-style sharing.",
        ["More positive reactions", "More advocacy"],
        "Brand Communications Lead",
        8,
        [
          makeItem(
            "PB-02.1",
            "Create an impact-story pipeline (assets + approvals)",
            "Impact posts need real people and real outcomes to feel credible.",
            [
              "Collect 8 story candidates (financial literacy, inclusion, SME enablement, community programs)",
              "For each: secure one hero photo/video, a quote, and a specific outcome",
              "Prepare approvals/consent checklist",
            ],
            [
              "A story backlog exists with assets and approvals",
              "Each story clearly states who benefited and what changed",
            ],
            "Brand Communications",
            3,
            [1, 2]
          ),
          makeItem(
            "PB-02.2",
            "Publish one impact short video + one carousel recap",
            "Short videos + carousels make impact easier to consume and share.",
            [
              "Cut a 25–45s short video with subtitles and one clear message",
              "Publish a carousel with 3–5 proof points and a soft next step",
              "Optionally boost the top-performing impact post (small budget, proven creative)",
            ],
            [
              "One impact short video and one carousel published",
              "Boost only after the post proves strong engagement",
            ],
            "Digital Marketing Lead",
            5,
            [3, 4, 5]
          ),
        ],
        { primeOwned: topPrimeOwned, primeEarned: topPrimeEarned, competitor: topCompOwned }
      )
    );

    eps.push(
      initiative(
        "PB-EPIC-03",
        "Fast, helpful community support (ServiceScore lift)",
        "Improve perceived responsiveness and reduce negative reactions by operationalizing how Prime replies to questions.",
        "Quick, consistent replies prevent frustration and keep threads constructive—especially on posts that trigger service questions.",
        ["Better responsiveness", "Less negative escalation"],
        "Customer Care Lead",
        13,
        [
          makeItem(
            "PB-03.1",
            "Set up a comment triage playbook",
            "Not all comments need the same handling. Triage protects speed and safety.",
            [
              "Create 5 labels: Product question, Branch/service issue, Complaint, Scam/fraud report, Praise",
              "Define an owner and response target per label",
              "Define escalation path to Customer Care and Branch Operations",
            ],
            ["Labels and targets documented", "Escalation owner and coverage schedule confirmed"],
            "Customer Care Ops",
            5,
            [1]
          ),
          makeItem(
            "PB-03.2",
            "Configure Meta Business Suite messaging and saved responses",
            "Instant replies set expectations and reduce perceived wait time.",
            [
              "Enable Messenger greeting + instant reply + away message",
              "Create 10 saved responses for FAQs (fees, account opening, card issues, app login)",
              "Include safe next steps and official channels",
            ],
            ["Automations enabled", "Saved responses cover top FAQs with safe handoffs"],
            "Community Manager",
            5,
            [2]
          ),
          makeItem(
            "PB-03.3",
            "Pilot first-hour replies on high-comment posts",
            "Early responses reduce pile-ons and keep the discussion helpful.",
            [
              "Ensure at least 10 helpful replies within the first hour on eligible posts",
              "Pin a help-hub comment with official contact options and scam-safety reminder",
              "Track reply time weekly and adjust staffing",
            ],
            ["Weekly report exists (reply time + sentiment notes)", "Improvement actions logged and followed"],
            "Social Care Team",
            3,
            [3, 4, 5, 6]
          ),
        ],
        { primeOwned: topPrimeOwned, primeEarned: topPrimeEarned, competitor: topCompOwned }
      )
    );

    eps.push(
      initiative(
        "PB-EPIC-04",
        "Scheduled Q&A session → short video highlights (Depth + EP)",
        "Create spikes of conversation depth using a scheduled Q&A session, then recycle the best moments as short videos.",
        "Q&A formats invite real questions and can be repurposed into multiple discovery moments.",
        ["More conversation", "More participation"],
        "Digital Marketing Lead",
        8,
        [
          makeItem(
            "PB-04.1",
            "Select the first Q&A theme and appoint host + moderator",
            "A confident, friendly host increases trust and keeps the session focused.",
            [
              "Pick one theme: smart savings, SME basics, or digital banking safety",
              "Write 12 FAQs plus 3 ‘myth vs fact’ segments",
              "Assign a moderator to capture questions and keep chat clean",
            ],
            ["30-minute run sheet prepared", "Host and moderator confirmed"],
            "Brand & Digital Team",
            3,
            [2]
          ),
          makeItem(
            "PB-04.2",
            "Schedule and promote the Q&A session",
            "Scheduling creates an announcement and helps build attendance.",
            [
              "Schedule the session inside Facebook",
              "Publish 2 reminders (24 hours and 1 hour before)",
              "Ask one simple question in the announcement to seed comments",
            ],
            ["Session scheduled with clear title and cover", "Reminders queued"],
            "Digital Marketing",
            2,
            [3]
          ),
          makeItem(
            "PB-04.3",
            "Publish 5 highlight clips as short videos",
            "Highlights extend the value of one session into multiple posts.",
            [
              "Select 5 moments (10–25 seconds each)",
              "Add subtitles and a clear takeaway header",
              "Publish 2 per week and link back to the replay",
            ],
            ["5 highlight clips published", "Each clip has a single takeaway"],
            "Creative Studio Lead",
            3,
            [5, 6]
          ),
        ],
        { primeOwned: topPrimeOwned, primeEarned: topPrimeEarned, competitor: topCompOwned }
      )
    );

    eps.push(
      initiative(
        "PB-EPIC-05",
        "Earned-to-Owned format transfer (page posts that feel like community)",
        "Adapt what works in groups (threads and peer replies) into page-friendly prompts to lift depth on Owned.",
        "Earned posts often drive longer threads; we can transfer that dynamic to the page with the right prompts and follow-up replies.",
        ["More comment threads"],
        "Community Lead",
        5,
        [
          makeItem(
            "PB-05.1",
            "Extract 10 conversation starters from high-performing Earned posts",
            "Prompt style matters more than the topic.",
            [
              "Review Prime’s top Earned posts and note the opening-line pattern",
              "Create 10 prompt templates (choose-one, this-or-that, quick poll, personal story)",
              "Rewrite each prompt in Prime’s courteous brand voice",
            ],
            ["Prompt library exists", "Each prompt has a moderation note"],
            "Community Manager",
            2,
            [1]
          ),
          makeItem(
            "PB-05.2",
            "Run 1 prompt-post per week with active replies",
            "Low cadence avoids fatigue and keeps quality high.",
            [
              "Publish one prompt-post weekly",
              "Reply to the first 20 comments with short follow-up questions",
              "Add a ‘best answers’ recap comment after 24 hours",
            ],
            ["4+ prompt-posts completed", "Each post has an active reply pattern"],
            "Community Manager",
            3,
            [2, 3, 4, 5, 6]
          ),
        ],
        { primeOwned: topPrimeOwned, primeEarned: topPrimeEarned, competitor: topCompOwned }
      )
    );

    return eps;
  }, [posts, postFields, competitorForInspo, topPrimeOwned, topPrimeEarned, topCompOwned]);

  const Section = ({ title, subtitle, children }) => (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        {subtitle ? <div className="text-xs text-muted-foreground">{subtitle}</div> : null}
      </CardHeader>
      <CardContent className="pt-0">{children}</CardContent>
    </Card>
  );

  const WeekDots = ({ weeks }) => {
    const set = new Set((weeks || []).map((x) => Number(x)));
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5, 6].map((w) => (
          <div
            key={w}
            className={`h-2.5 w-2.5 rounded-full ${set.has(w) ? "bg-blue-600" : "bg-muted"}`}
            title={`Week ${w}${set.has(w) ? " planned" : ""}`}
          />
        ))}
      </div>
    );
  };

  const PostPills = ({ rows }) => {
    if (!rows?.length) return <div className="text-sm text-muted-foreground">No examples found.</div>;
    return (
      <div className="flex flex-wrap gap-2">
        {rows.map((p) => (
          <a
            key={String(p.post_id)}
            href={safeStr(p.post_post_url)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs hover:bg-muted"
            title={safeStr(p.page_name)}
          >
            <span className="font-medium">{safeStr(p.period_key)}</span>
            <span className="text-muted-foreground truncate max-w-[220px]">{safeStr(p.page_name)}</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ))}
      </div>
    );
  };

  const currentBES = Number(ownedAgg.BES_raw_avg);
  const targetBES = Number.isFinite(currentBES) ? currentBES * 1.25 : null;

  return (
    <div className="space-y-6">
      <Section
        title="Action backlog (6-week rollout)"
        subtitle="One-page delivery view with stable keys, effort points, suggested owners, and a week-by-week rollout to lift Owned BES by ~25%."
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="rounded-2xl border p-4">
            <div className="text-sm font-medium">Outcome target</div>
            <div className="mt-2 text-sm text-muted-foreground">
              Current Owned <DefLink to="def-bes">BES (raw)</DefLink> average: <span className="font-medium text-foreground">{fmtNum(currentBES, 3)}</span>
              <br />
              Planning target (about +25%): <span className="font-medium text-foreground">{targetBES == null ? "–" : fmtNum(targetBES, 3)}</span>
            </div>
            <div className="mt-3 grid gap-2">
              <MiniValue label="Post volume" value={`${fmtInt(ownedAgg.n_posts)} posts in view`} />
              <MiniValue label={<><DefLink to="def-ep">EP</DefLink> per post</>} value={fmtNum(ownedAgg.EP_per_post, 1)} />
              <MiniValue label={<><DefLink to="def-advocacy">Advocacy</DefLink> per post</>} value={fmtNum(ownedAgg.Advocacy_per_post, 2)} />
              <MiniValue label={<DefLink to="def-sentiment">Sentiment</DefLink>} value={fmtNum(ownedAgg.SentimentProxy_avg_w, 3)} />
              <MiniValue label={<DefLink to="def-depth">Conversation depth</DefLink>} value={fmtScored(ownedAgg.Depth_avg_w, ownedAgg.depth_scored, 2)} />
              <MiniValue label={<DefLink to="def-service">Service score</DefLink>} value={fmtScored(ownedAgg.ServiceScore_avg_w, ownedAgg.service_scored, 3)} />
            </div>
          </div>

          <div className="rounded-2xl border p-4 lg:col-span-2">
            <div className="text-sm font-medium">Backlog summary</div>
            <div className="text-sm text-muted-foreground mt-2">
              Each row is a named initiative (with a stable key), a suggested owner, and an effort estimate in points.
              The dots show which weeks are planned within a 6-week rollout.
            </div>

            <div className="mt-4 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-background">
                  <tr className="text-left border-b">
                    <th className="py-2 pr-3 font-medium">Key</th>
                    <th className="py-2 pr-3 font-medium">Initiative</th>
                    <th className="py-2 pr-3 font-medium">Owner</th>
                    <th className="py-2 pr-3 font-medium">Points</th>
                    <th className="py-2 pr-3 font-medium">Weeks</th>
                  </tr>
                </thead>
                <tbody>
                  {recipes.map((r) => (
                    <React.Fragment key={r.key}>
                      <tr className="border-b">
                        <td className="py-2 pr-3 whitespace-nowrap">
                          <div id={`init-${r.key}`} className="scroll-mt-24" />
                          <span className="font-medium">{r.key}</span>
                        </td>
                        <td className="py-2 pr-3">
                          <div className="font-medium">{r.title}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">{r.objective}</div>
                          <div className="mt-1 flex flex-wrap gap-2">
                            {(r.focus || []).map((f, i) => (
                              <Badge key={i} variant="secondary">{f}</Badge>
                            ))}
                          </div>
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{r.owner}</td>
                        <td className="py-2 pr-3 whitespace-nowrap"><span className="font-semibold">{r.points}</span></td>
                        <td className="py-2 pr-3">
                          <WeekDots weeks={[...new Set(r.items.flatMap((x) => x.weeks || []))]} />
                        </td>
                      </tr>
                      <tr className="border-b last:border-0">
                        <td colSpan={5} className="py-3">
                          <details className="rounded-xl border p-3">
                            <summary className="cursor-pointer text-sm font-medium">View delivery details</summary>
                            <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-4">
                              <div className="rounded-xl border p-3">
                                <div className="text-sm font-medium">Why this matters</div>
                                <div className="text-sm text-muted-foreground mt-2">{r.why}</div>
                                <div className="mt-3 text-xs text-muted-foreground">
                                  Example posts to adapt (from your dataset):
                                </div>
                                <div className="mt-2 space-y-2">
                                  <div>
                                    <div className="text-xs text-muted-foreground">Prime — Owned</div>
                                    <div className="mt-1"><PostPills rows={r.inspiredBy.primeOwned} /></div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-muted-foreground">Prime — Earned</div>
                                    <div className="mt-1"><PostPills rows={r.inspiredBy.primeEarned} /></div>
                                  </div>
                                  <div>
                                    <div className="text-xs text-muted-foreground">Competitor reference — {competitorForInspo}</div>
                                    <div className="mt-1"><PostPills rows={r.inspiredBy.competitor} /></div>
                                  </div>
                                </div>
                              </div>

                              <div className="rounded-xl border p-3">
                                <div className="text-sm font-medium">Work items</div>
                                <div className="text-xs text-muted-foreground mt-1">Deliverables + completion checks + planned weeks.</div>
                                <div className="mt-3 space-y-3">
                                  {r.items.map((it) => (
                                    <div key={it.id} className="rounded-xl border p-3">
                                      <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <div className="text-sm font-medium">{it.id} — {it.title}</div>
                                          <div className="text-xs text-muted-foreground mt-0.5">{it.why}</div>
                                        </div>
                                        <div className="text-right">
                                          <div className="text-xs text-muted-foreground">Owner</div>
                                          <div className="text-sm font-medium">{it.owner}</div>
                                          <div className="text-xs text-muted-foreground mt-1">Points: <span className="font-medium text-foreground">{it.points}</span></div>
                                        </div>
                                      </div>
                                      <div className="mt-2"><WeekDots weeks={it.weeks} /></div>
                                      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div>
                                          <div className="text-xs text-muted-foreground">Deliverables</div>
                                          <ul className="mt-1 text-sm list-disc pl-5 space-y-1">
                                            {it.deliverables.map((d, i) => (
                                              <li key={i} className="text-muted-foreground">{d}</li>
                                            ))}
                                          </ul>
                                        </div>
                                        <div>
                                          <div className="text-xs text-muted-foreground">Completion checks</div>
                                          <ul className="mt-1 text-sm list-disc pl-5 space-y-1">
                                            {it.completion.map((c, i) => (
                                              <li key={i} className="text-muted-foreground">{c}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </details>
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 text-xs text-muted-foreground">
              Points are a relative effort estimate (“bigger” vs “smaller” work). Owners are suggested roles—adjust to match your org.
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

// ---------- main dashboard body ----------
function DashboardBody({
  sourceType,
  period,
  competitor,
  showCompetitor,
  primeAgg,
  compAgg,
  trendData,
  volumeData,
  radarData,
  topPrimePosts,
  topCompPosts,
  postSort,
  setPostSort,
  postQuery,
  setPostQuery,
  trendMetricLabel,
}) {
  const p = primeAgg;
  const c = compAgg;

  const chartSubtitle = showCompetitor
    ? `Prime vs ${competitor} (each bar is a period)`
    : "Prime Bank only (each bar is a period)";

  return (
    <div className="space-y-6">
      <Scorecard competitor={competitor} showCompetitor={showCompetitor} primeAgg={p} compAgg={c} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="rounded-2xl shadow-sm xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Trend — {trendMetricLabel}</CardTitle>
            <div className="text-xs text-muted-foreground">{chartSubtitle}</div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trendData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period_key" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip
                    formatter={(v) =>
                      Number.isFinite(Number(v))
                        ? Number(v).toLocaleString(undefined, { maximumFractionDigits: 3 })
                        : v
                    }
                  />
                  {showCompetitor ? <Legend /> : null}
                  <Bar dataKey="prime" name={PRIME} fill={PRIME_COLOR} radius={[8, 8, 0, 0]} />
                  {showCompetitor ? (
                    <Bar dataKey="competitor" name={competitor} fill={COMP_COLOR} radius={[8, 8, 0, 0]} />
                  ) : null}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Profile (normalized)</CardTitle>
            <div className="text-xs text-muted-foreground">0–1 per dimension in the current view</div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="75%">
                  <PolarGrid />
                  <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11 }} />
                  <PolarRadiusAxis tick={{ fontSize: 11 }} domain={[0, 1]} />
                  <Radar name={PRIME} dataKey="prime" stroke={PRIME_COLOR} fill={PRIME_COLOR} fillOpacity={0.18} />
                  {showCompetitor ? (
                    <Radar name={competitor} dataKey="competitor" stroke={COMP_NEUTRAL} fill={COMP_NEUTRAL} fillOpacity={0.1} />
                  ) : null}
                  {showCompetitor ? <Legend /> : null}
                  <Tooltip formatter={(v) => fmtNum(v, 2)} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="rounded-2xl shadow-sm xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Volume & reach proxy</CardTitle>
            <div className="text-xs text-muted-foreground">EP by period</div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[320px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volumeData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="period_key" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v) => fmtInt(v)} />
                  {showCompetitor ? <Legend /> : null}
                  <Bar dataKey="prime_EP" name={`${PRIME} EP`} fill={PRIME_COLOR} />
                  {showCompetitor ? <Bar dataKey="comp_EP" name={`${competitor} EP`} fill={COMP_COLOR} /> : null}
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className={`grid ${showCompetitor ? "grid-cols-2" : "grid-cols-1"} gap-3 mt-4`}>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">{PRIME} engagement components</div>
                <div className="text-lg font-semibold mt-1">{fmtInt(p.engagement_components)}</div>
                <div className="text-xs text-muted-foreground">reactions + comments + shares</div>
              </div>
              {showCompetitor ? (
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-muted-foreground">{competitor} engagement components</div>
                  <div className="text-lg font-semibold mt-1">{fmtInt(c.engagement_components)}</div>
                  <div className="text-xs text-muted-foreground">reactions + comments + shares</div>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-2xl shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Quick comparison</CardTitle>
            <div className="text-xs text-muted-foreground">Totals and averages for the current slice</div>
          </CardHeader>
          <CardContent className="pt-0 space-y-4">
            <div className={`grid ${showCompetitor ? "grid-cols-2" : "grid-cols-1"} gap-3`}>
              <div className="rounded-xl border p-3">
                <div className="text-xs text-muted-foreground">{PRIME}</div>
                <div className="mt-2 grid gap-2">
                  <MiniValue label={<DefLink to="def-ep">EP</DefLink>} value={fmtInt(p.EP)} />
                  <MiniValue label="Posts" value={fmtInt(p.n_posts)} />
                  <MiniValue label={<DefLink to="def-sentiment">Sentiment</DefLink>} value={fmtNum(p.SentimentProxy_avg_w, 3)} />
                  <MiniValue label={<DefLink to="def-depth">Depth</DefLink>} value={fmtScored(p.Depth_avg_w, p.depth_scored, 2)} hint={`Covered: ${fmtInt(p.depth_covered_posts)}`} />
                  <MiniValue label={<DefLink to="def-service">Service</DefLink>} value={fmtScored(p.ServiceScore_avg_w, p.service_scored, 3)} hint={`Covered: ${fmtInt(p.service_covered_posts)}`} />
                </div>
              </div>

              {showCompetitor ? (
                <div className="rounded-xl border p-3">
                  <div className="text-xs text-muted-foreground">{competitor}</div>
                  <div className="mt-2 grid gap-2">
                    <MiniValue label={<DefLink to="def-ep">EP</DefLink>} value={fmtInt(c.EP)} />
                    <MiniValue label="Posts" value={fmtInt(c.n_posts)} />
                    <MiniValue label={<DefLink to="def-sentiment">Sentiment</DefLink>} value={fmtNum(c.SentimentProxy_avg_w, 3)} />
                    <MiniValue label={<DefLink to="def-depth">Depth</DefLink>} value={fmtScored(c.Depth_avg_w, c.depth_scored, 2)} hint={`Covered: ${fmtInt(c.depth_covered_posts)}`} />
                    <MiniValue label={<DefLink to="def-service">Service</DefLink>} value={fmtScored(c.ServiceScore_avg_w, c.service_scored, 3)} hint={`Covered: ${fmtInt(c.service_covered_posts)}`} />
                  </div>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <div className="text-lg font-semibold">Top posts</div>
          <div className="text-sm text-muted-foreground">
            Filter and review the posts most responsible for engagement and brand experience.
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="min-w-[240px]">
            <div className="text-xs text-muted-foreground mb-1">Sort by</div>
            <Select value={postSort} onValueChange={setPostSort}>
              <SelectTrigger className="rounded-2xl">
                <SelectValue placeholder="EP" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="EP">
                  <DefLink to="def-ep">EP</DefLink>
                </SelectItem>
                <SelectItem value="BES_raw">
                  <>
                    <DefLink to="def-bes">BES</DefLink> raw
                  </>
                </SelectItem>
                <SelectItem value="comments">Comments</SelectItem>
                <SelectItem value="reactions">Reactions</SelectItem>
                <SelectItem value="shares">Shares</SelectItem>
                <SelectItem value="Depth">
                  <DefLink to="def-depth">Depth</DefLink>
                </SelectItem>
                <SelectItem value="ServiceScore">
                  <DefLink to="def-service">Service score</DefLink>
                </SelectItem>
                <SelectItem value="median_reply_time_minutes">Median reply time</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className={`grid grid-cols-1 ${showCompetitor ? "xl:grid-cols-2" : ""} gap-4`}>
        <TopPostsTable
          rows={topPrimePosts}
          title={`${PRIME} — top posts (${sourceType}${period !== "All" ? ", " + period : ""})`}
          metricLabel={postSort}
        />
        {showCompetitor ? (
          <TopPostsTable
            rows={topCompPosts}
            title={`${competitor} — top posts (${sourceType}${period !== "All" ? ", " + period : ""})`}
            metricLabel={postSort}
          />
        ) : null}
      </div>
    </div>
  );
}

// ---------- main ----------
export default function PrimeBankSocialDashboard() {
  useEffect(() => {
    runSelfTestsOnce();
  }, []);

  const [brandPeriod, setBrandPeriod] = useState([]);
  const [posts, setPosts] = useState([]);

  const [mainTab, setMainTab] = useState("dashboard");

  const [sourceType, setSourceType] = useState("owned");
  const [viewMode, setViewMode] = useState("prime"); // default: Prime Bank only
  const showCompetitor = viewMode === "compare";

  const [competitor, setCompetitor] = useState(DEFAULT_COMPETITOR);
  const [period, setPeriod] = useState("All");
  const [trendMetric, setTrendMetric] = useState("EP");
  const [postSort, setPostSort] = useState("EP");
  const [postQuery, setPostQuery] = useState("");

  const hasData = brandPeriod.length > 0 && posts.length > 0;

  // If a user clicks a linked definition (e.g., #def-ep) or initiative (e.g., #init-PB-EPIC-01),
  // switch to the right tab before scrolling so anchors always work.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const jumpToHash = () => {
      const raw = window.location.hash || "";
      const id = raw.startsWith("#") ? raw.slice(1) : raw;
      if (!id) return;

      const go = (tab) => {
        setMainTab(tab);
        // Wait for the tab content to render before scrolling.
        setTimeout(() => {
          const el = document.getElementById(id);
          if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 50);
      };

      if (id.startsWith("def-")) go("glossary");
      else if (id.startsWith("init-")) go("actions");
    };

    jumpToHash();
    window.addEventListener("hashchange", jumpToHash);
    return () => window.removeEventListener("hashchange", jumpToHash);
  }, []);

  const availablePeriods = useMemo(() => {
    if (!hasData) return [];
    const keys = new Set(brandPeriod.filter((r) => r.source_type === sourceType).map((r) => r.period_key));
    return sortWeekKeys(Array.from(keys));
  }, [brandPeriod, hasData, sourceType]);

  const competitorOptions = useMemo(() => {
    if (!hasData) return [];
    const brands = new Set(
      brandPeriod
        .filter((r) => r.source_type === sourceType)
        .map((r) => r.brand)
        .filter((b) => b && b !== PRIME)
    );
    const list = Array.from(brands).sort((a, b) => String(a).localeCompare(String(b)));
    if (list.includes(DEFAULT_COMPETITOR)) return [DEFAULT_COMPETITOR, ...list.filter((b) => b !== DEFAULT_COMPETITOR)];
    return list;
  }, [brandPeriod, hasData, sourceType]);

  useEffect(() => {
    if (!competitorOptions.length) return;
    if (!competitorOptions.includes(competitor)) setCompetitor(String(competitorOptions[0]));
  }, [competitorOptions, competitor]);

  const filteredBrandPeriod = useMemo(() => {
    if (!hasData) return [];
    return brandPeriod.filter((r) => {
      if (r.source_type !== sourceType) return false;
      if (period !== "All" && r.period_key !== period) return false;
      return true;
    });
  }, [brandPeriod, hasData, sourceType, period]);

  const primeRows = useMemo(() => filteredBrandPeriod.filter((r) => r.brand === PRIME), [filteredBrandPeriod]);
  const compRows = useMemo(() => filteredBrandPeriod.filter((r) => r.brand === competitor), [filteredBrandPeriod, competitor]);

  const primeAgg = useMemo(() => aggregateBrand(primeRows), [primeRows]);
  const compAgg = useMemo(() => aggregateBrand(compRows), [compRows]);

  const trendMetricLabel = {
    EP: "EP (Engagement Points)",
    n_posts: "Post volume",
    EP_per_post: "EP per post",
    Sentiment: "Sentiment proxy",
    Depth: "Conversation depth",
    Service: "Service score",
    BES_raw: "BES (raw)",
    BES_0_100: "BES (0–100 rank)",
  }[trendMetric];

  const trendData = useMemo(() => {
    if (!hasData) return [];
    const periods = availablePeriods;

    const pMap = new Map(
      brandPeriod
        .filter((r) => r.source_type === sourceType && r.brand === PRIME)
        .map((r) => [r.period_key, r])
    );
    const cMap = new Map(
      brandPeriod
        .filter((r) => r.source_type === sourceType && r.brand === competitor)
        .map((r) => [r.period_key, r])
    );

    const metricToField = {
      EP: "EP",
      n_posts: "n_posts",
      EP_per_post: "EP_per_post",
      Sentiment: "SentimentProxy_avg_w",
      Depth: "Depth_avg_w",
      Service: "ServiceScore_avg_w",
      BES_raw: "BES_raw_avg",
      BES_0_100: "BES_0_100",
    };

    const f = metricToField[trendMetric] || "EP";

    const calc = (row) => {
      if (!row) return null;
      if (f === "EP_per_post") {
        return row.n_posts ? (Number(row.EP) || 0) / (Number(row.n_posts) || 1) : 0;
      }
      const v = row[f];
      return v === null || v === undefined || v === "" ? null : Number(v);
    };

    return periods.map((k) => ({
      period_key: k,
      prime: calc(pMap.get(k)),
      competitor: calc(cMap.get(k)),
    }));
  }, [availablePeriods, brandPeriod, competitor, hasData, sourceType, trendMetric]);

  const volumeData = useMemo(() => {
    if (!hasData) return [];
    const periods = availablePeriods;

    const pMap = new Map(
      brandPeriod
        .filter((r) => r.source_type === sourceType && r.brand === PRIME)
        .map((r) => [r.period_key, r])
    );
    const cMap = new Map(
      brandPeriod
        .filter((r) => r.source_type === sourceType && r.brand === competitor)
        .map((r) => [r.period_key, r])
    );

    return periods.map((k) => {
      const p = pMap.get(k);
      const c = cMap.get(k);
      return {
        period_key: k,
        prime_EP: Number(p?.EP) || 0,
        comp_EP: Number(c?.EP) || 0,
      };
    });
  }, [availablePeriods, brandPeriod, competitor, hasData, sourceType]);

  const radarData = useMemo(() => {
    if (!hasData) return [];
    const p = primeAgg;
    const c = compAgg;

    const dims = [
      { label: "Engagement / post", p: p.EP_per_post, c: c.EP_per_post },
      { label: "Advocacy / post", p: p.Advocacy_per_post, c: c.Advocacy_per_post },
      { label: "Sentiment", p: p.SentimentProxy_avg_w, c: c.SentimentProxy_avg_w },
    ];

    if (p.depth_covered_posts > 0 || (showCompetitor && c.depth_covered_posts > 0)) {
      dims.push({ label: "Conversation depth", p: p.Depth_avg_w, c: c.Depth_avg_w });
    }

    if (p.service_covered_posts > 0 || (showCompetitor && c.service_covered_posts > 0)) {
      dims.push({ label: "Service", p: p.ServiceScore_avg_w, c: c.ServiceScore_avg_w });
    }

    return dims.map((d) => {
      const P = Number(d.p);
      const C = Number(d.c);
      const pVal = Number.isFinite(P) ? P : 0;
      const cVal = showCompetitor && Number.isFinite(C) ? C : 0;
      const max = Math.max(pVal, cVal, 1e-9);
      return {
        dimension: d.label,
        prime: clamp01(pVal / max),
        competitor: clamp01(cVal / max),
      };
    });
  }, [compAgg, hasData, primeAgg, showCompetitor]);

  const topPrimePosts = useMemo(() => {
    if (!hasData) return [];
    const q = postQuery.trim().toLowerCase();
    const rows = posts.filter((p) => {
      if (p.source_type !== sourceType) return false;
      if (p.brand !== PRIME) return false;
      if (period !== "All" && p.period_key !== period) return false;
      if (!q) return true;
      return (
        safeStr(p.page_name).toLowerCase().includes(q) ||
        safeStr(p.post_post_url).toLowerCase().includes(q) ||
        safeStr(p.period_key).toLowerCase().includes(q)
      );
    });
    const key = postSort;
    return rows.sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0)).slice(0, 8);
  }, [hasData, period, postQuery, postSort, posts, sourceType]);

  const topCompPosts = useMemo(() => {
    if (!hasData) return [];
    if (!showCompetitor) return [];
    const q = postQuery.trim().toLowerCase();
    const rows = posts.filter((p) => {
      if (p.source_type !== sourceType) return false;
      if (p.brand !== competitor) return false;
      if (period !== "All" && p.period_key !== period) return false;
      if (!q) return true;
      return (
        safeStr(p.page_name).toLowerCase().includes(q) ||
        safeStr(p.post_post_url).toLowerCase().includes(q) ||
        safeStr(p.period_key).toLowerCase().includes(q)
      );
    });
    const key = postSort;
    return rows.sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0)).slice(0, 8);
  }, [competitor, hasData, period, postQuery, postSort, posts, showCompetitor, sourceType]);

  const periodLabel = period === "All" ? "All weeks" : period;

  const refresh = () => {
    setMainTab("dashboard");
    setViewMode("prime");
    setPeriod("All");
    setTrendMetric("EP");
    setPostSort("EP");
    setPostQuery("");
    if (competitorOptions.includes(DEFAULT_COMPETITOR)) setCompetitor(DEFAULT_COMPETITOR);
    else if (competitorOptions[0]) setCompetitor(competitorOptions[0]);
  };

  return (
    <div className="p-5 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <div className="text-2xl md:text-3xl font-semibold tracking-tight">Prime Bank — Social Media Presence Dashboard</div>
          <div className="text-sm text-muted-foreground mt-1">
            Comparing <span className="font-medium">Owned</span> vs <span className="font-medium">Earned</span> performance, with an optional competitor benchmark.
            {hasData ? (
              <>
                {" "}Current view: <span className="font-medium">{sourceType}</span> • <span className="font-medium">{periodLabel}</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" className="rounded-xl" onClick={refresh} disabled={!hasData}>
            <RefreshCw className="h-4 w-4 mr-2" /> Reset
          </Button>
        </div>
      </div>

      {!hasData ? (
        <DataLoader
          onLoad={({ brandPeriod: bp, posts: ps }) => {
            setBrandPeriod(bp);
            setPosts(ps);
          }}
        />
      ) : null}

      <Tabs value={mainTab} onValueChange={setMainTab} className="w-full">
        <TabsList className="rounded-2xl">
          <TabsTrigger value="dashboard" className="rounded-xl">
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="actions" className="rounded-xl">
            Follow-up actions
          </TabsTrigger>
          <TabsTrigger value="executive" className="rounded-xl">
            Executive summary
          </TabsTrigger>
          <TabsTrigger value="glossary" className="rounded-xl">
            Glossary
          </TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-5 space-y-6">
          <Tabs value={sourceType} onValueChange={setSourceType} className="w-full">
            <div className="flex flex-col lg:flex-row lg:items-center gap-3">
              <TabsList className="rounded-2xl">
                <TabsTrigger value="owned" className="rounded-xl">
                  Owned
                </TabsTrigger>
                <TabsTrigger value="earned" className="rounded-xl">
                  Earned
                </TabsTrigger>
              </TabsList>

              <div className="flex flex-col sm:flex-row gap-3 flex-1">
                <div className="min-w-[200px]">
                  <div className="text-xs text-muted-foreground mb-1">View</div>
                  <Select value={viewMode} onValueChange={setViewMode} disabled={!hasData}>
                    <SelectTrigger className="rounded-2xl">
                      <SelectValue placeholder="Prime only" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="prime">Prime Bank only</SelectItem>
                      <SelectItem value="compare">Compare vs competitor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {showCompetitor ? (
                  <div className="min-w-[220px]">
                    <div className="text-xs text-muted-foreground mb-1">Competitor</div>
                    <Select value={competitor} onValueChange={setCompetitor} disabled={!hasData}>
                      <SelectTrigger className="rounded-2xl">
                        <SelectValue placeholder="Select competitor" />
                      </SelectTrigger>
                      <SelectContent>
                        {competitorOptions.map((b) => (
                          <SelectItem key={String(b)} value={String(b)}>
                            {String(b)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}

                <div className="min-w-[180px]">
                  <div className="text-xs text-muted-foreground mb-1">Period</div>
                  <Select value={period} onValueChange={setPeriod} disabled={!hasData}>
                    <SelectTrigger className="rounded-2xl">
                      <SelectValue placeholder="All" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="All">All weeks</SelectItem>
                      {availablePeriods.map((k) => (
                        <SelectItem key={String(k)} value={String(k)}>
                          {String(k)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="min-w-[240px]">
                  <div className="text-xs text-muted-foreground mb-1">Trend metric</div>
                  <Select value={trendMetric} onValueChange={setTrendMetric} disabled={!hasData}>
                    <SelectTrigger className="rounded-2xl">
                      <SelectValue placeholder="EP" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="EP">
                        <DefLink to="def-ep">EP</DefLink>
                      </SelectItem>
                      <SelectItem value="EP_per_post">
                        <>
                          <DefLink to="def-ep">EP</DefLink> per post
                        </>
                      </SelectItem>
                      <SelectItem value="n_posts">Post volume</SelectItem>
                      <SelectItem value="Sentiment">
                        <DefLink to="def-sentiment">Sentiment</DefLink>
                      </SelectItem>
                      <SelectItem value="Depth">
                        <DefLink to="def-depth">Depth</DefLink>
                      </SelectItem>
                      <SelectItem value="Service">
                        <DefLink to="def-service">Service</DefLink>
                      </SelectItem>
                      <SelectItem value="BES_raw">
                        <>
                          <DefLink to="def-bes">BES</DefLink> (raw)
                        </>
                      </SelectItem>
                      <SelectItem value="BES_0_100">
                        <>
                          <DefLink to="def-bes">BES</DefLink> (0–100 rank)
                        </>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <TabsContent value="owned" className="mt-5 space-y-6">
              {hasData ? (
                <DashboardBody
                  sourceType={sourceType}
                  period={period}
                  competitor={competitor}
                  showCompetitor={showCompetitor}
                  primeAgg={primeAgg}
                  compAgg={compAgg}
                  trendData={trendData}
                  volumeData={volumeData}
                  radarData={radarData}
                  topPrimePosts={topPrimePosts}
                  topCompPosts={topCompPosts}
                  postSort={postSort}
                  setPostSort={setPostSort}
                  postQuery={postQuery}
                  setPostQuery={setPostQuery}
                  trendMetricLabel={trendMetricLabel}
                />
              ) : null}
            </TabsContent>

            <TabsContent value="earned" className="mt-5 space-y-6">
              {hasData ? (
                <DashboardBody
                  sourceType={sourceType}
                  period={period}
                  competitor={competitor}
                  showCompetitor={showCompetitor}
                  primeAgg={primeAgg}
                  compAgg={compAgg}
                  trendData={trendData}
                  volumeData={volumeData}
                  radarData={radarData}
                  topPrimePosts={topPrimePosts}
                  topCompPosts={topCompPosts}
                  postSort={postSort}
                  setPostSort={setPostSort}
                  postQuery={postQuery}
                  setPostQuery={setPostQuery}
                  trendMetricLabel={trendMetricLabel}
                />
              ) : null}
            </TabsContent>
          </Tabs>
        </TabsContent>

        <TabsContent value="executive" className="mt-5 space-y-6">
          {hasData ? (
            <ExecutiveSummaryPage
              brandPeriod={brandPeriod}
              posts={posts}
              competitor={competitor}
              showCompetitor={showCompetitor}
            />
          ) : null}
          {!hasData ? (
            <Card className="rounded-2xl shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Upload required</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-muted-foreground">
                Upload <span className="font-medium">bes_brand_period</span> and <span className="font-medium">bes_posts</span> to generate the executive summary.
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="actions" className="mt-5 space-y-6">
          {hasData ? <ActionsPage brandPeriod={brandPeriod} posts={posts} /> : null}
          {!hasData ? (
            <Card className="rounded-2xl shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">Upload required</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-sm text-muted-foreground">
                Upload <span className="font-medium">bes_brand_period</span> and <span className="font-medium">bes_posts</span> to generate the action backlog.
              </CardContent>
            </Card>
          ) : null}
        </TabsContent>

        <TabsContent value="glossary" className="mt-5 space-y-6">
          <GlossaryPage />
        </TabsContent>
      </Tabs>
    </div>
  );
}
