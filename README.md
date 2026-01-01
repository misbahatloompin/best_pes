# Brand Experience Score (BES) Calculator (Node.js)

This script computes a **Brand Experience Score** from the post-level engagement fields in `bank_data_enhanced.json`.

It implements the pipeline you asked for (Steps 2–5):
- **2) Brand attribution** (Owned vs Earned + bank attribution)
- **3) Per-post components** (Engagement Points, Advocacy, SentimentProxy, Depth, Service)
- **4) Combine** into `BES_raw` and normalize to `BES_0_100`
- **5) Aggregate** to a brand-period dataset (weekly/monthly)

## Requirements
- Node.js 18+ recommended (works with Node 16+ if available).

## Files
- `bes.js` — main script
- Output folder (created when you run):
  - `output/bes_posts.csv` — post-level records (after attribution “explode”)
  - `output/bes_brand_period.csv` — brand x period aggregated scores
  - `output/bes_brand_period.json` — same as JSON
  - `output/run_summary.json` — run parameters + counts

## How to run

From the folder containing `bes.js` and the JSON:

```bash
node bes.js --input bank_data_enhanced.json --out output
```

### Common options

**Monthly instead of weekly**
```bash
node bes.js --input bank_data_enhanced.json --out output --period month
```

**Include unattributed earned posts** (posts where no bank could be inferred)
```bash
node bes.js --input bank_data_enhanced.json --out output --includeUnattributed true
```

**Change comment-export coverage threshold** for the Depth component
```bash
node bes.js --input bank_data_enhanced.json --out output --coverageThreshold 0.8
```

**Choose normalization method**
- `minmax` (default): scales within (period, source_type) to 0–100
- `zscore`: z-score within (period, source_type) then squashed to 0–100
- `none`: skips normalized score

```bash
node bes.js --input bank_data_enhanced.json --out output --normalization zscore
```

**Adjust weights** (they are re-normalized to sum to 1)
```bash
node bes.js --input bank_data_enhanced.json --out output --weights "eng=0.15,adv=0.20,sent=0.35,depth=0.15,service=0.15"
```

## Notes / assumptions
- **Owned vs Earned**: uses `page_profile_url` containing `facebook.com/groups/` to label earned groups.
- **Brand attribution** for earned posts “explodes” multi-tag posts into **one row per tagged bank**.
- **SentimentProxy** is derived from reaction mix (Love/Care/Wow/Haha vs Sad/Angry). It is not full NLP sentiment.
- **Depth** uses `comments_export_coverage`, `unique_comment_authors`, and `comment_replies_sum`. If export coverage is below the threshold, Depth is set to 0 for that post.
- **ServiceScore** uses `median_reply_time_minutes` when available; if missing, it contributes 0.
