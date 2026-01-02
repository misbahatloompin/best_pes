# Prime Bank Social Media Presence Dashboard — Documentation

This documentation explains how the **Prime Bank Social Media Presence Dashboard** is generated from the provided datasets, how metrics are calculated and displayed, and how the Executive Summary and Follow-up Actions pages are produced.

- **App type:** React (single-file component)
- **Primary goal:** Analyze Prime Bank’s social media performance and compare vs a competitor across:
  - **Owned** (Prime Bank pages)
  - **Earned** (community/groups / external surfaces attributed to the brand)
- **Tabs (left → right):**
  1. Dashboard
  2. Follow-up actions
  3. Executive summary
  4. Glossary

## What you need to run it

### Required datasets
Upload both datasets to the dashboard UI:
- `bes_brand_period` (CSV or JSON)
- `bes_posts` (CSV or JSON)

### What happens after upload
Once both datasets are loaded:
- **Dashboard** becomes interactive (Owned/Earned, Prime-only or competitor compare, period selection, trend metric selection).
- **Follow-up actions** generates a structured action backlog using:
  - Prime’s observed patterns (Owned + Earned)
  - Competitor examples (tone/format inspiration)
- **Executive summary** produces a last-quarter snapshot (last 13 periods per source type).
- **Glossary** contains definitions and supports click-to-jump from the rest of the UI.

## Where to look next
- `DATA_INGESTION.md`
- `METRICS.md`
- `UI_BEHAVIOR.md`
- `EXECUTIVE_SUMMARY.md`
- `FOLLOW_UP_ACTIONS.md`
- `SUGGESTED_PROMPTS.md`
- `TROUBLESHOOTING.md`

Generated on 2026-01-02.
