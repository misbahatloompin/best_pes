# Prime Bank Social Media Dashboard — Combined README

This README combines all documentation pages shipped with the dashboard into a single file for easier sharing and offline reading.

## Table of contents

- [Prime Bank Social Media Presence Dashboard — Documentation](#prime-bank-social-media-presence-dashboard-documentation)
- [Run locally](#run-locally)
- [Data ingestion](#data-ingestion)
- [Metrics & calculations](#metrics-calculations)
- [UI behavior](#ui-behavior)
- [Executive summary (last quarter)](#executive-summary-last-quarter)
- [Follow-up actions (Action backlog)](#follow-up-actions-action-backlog)
- [Suggested prompts](#suggested-prompts)
- [Troubleshooting](#troubleshooting)


---

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
- `RUN_LOCALLY.md`
- `TROUBLESHOOTING.md`


## Run locally (JavaScript / React)

The dashboard code in canvas is a **single React component** (currently written as `index.tsx` with `// @ts-nocheck`).  
To run it locally you can use a standard React tooling setup (recommended: **Vite**).

### Option A — Vite + React (recommended)

**Prereqs**
- Node.js 18+ (or 20+)
- npm (or pnpm/yarn)

**1) Create a React project**
```bash
npm create vite@latest prime-bank-dashboard -- --template react-ts
cd prime-bank-dashboard
npm install
```

**2) Install dependencies used by the dashboard**
```bash
npm install recharts lucide-react
```

**3) Add Tailwind + UI components**
This dashboard imports UI primitives like:
- `@/components/ui/card`
- `@/components/ui/tabs`
- `@/components/ui/select`
- `@/components/ui/badge`
- `@/components/ui/input`
- `@/components/ui/button`

The fastest path is to set up **shadcn/ui** (Tailwind-based) and generate those components.

- Follow the shadcn/ui install steps for Vite + React + TS (Tailwind required)
- Then add the components:
  - `card`, `tabs`, `select`, `badge`, `input`, `button`

> If you don’t want shadcn/ui, you can replace those imports with your own simple components.

**4) Configure the `@` path alias**
The code uses `@/…` imports. Add a Vite alias and TS paths.

Create / edit `vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

Create / edit `tsconfig.json` (or `tsconfig.app.json` depending on Vite version):
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

**5) Add the dashboard component**
- Create `src/PrimeBankSocialDashboard.tsx`
- Paste the component code from canvas into that file
- Update `src/App.tsx` to render it:

```tsx
import PrimeBankSocialDashboard from "./PrimeBankSocialDashboard";

export default function App() {
  return <PrimeBankSocialDashboard />;
}
```

**6) Run**
```bash
npm run dev
```
Open the shown local URL (usually `http://localhost:5173`).

### Option B — Run as plain JavaScript (no TypeScript)

If you prefer `.jsx`:
1. Create a Vite project with `--template react`
2. Rename the dashboard file to `PrimeBankSocialDashboard.jsx`
3. Remove TypeScript-only syntax (if any)
4. Keep the same dependency + alias steps above

### Data files
When running locally, you’ll upload the datasets through the UI:
- `bes_brand_period.(csv|json)`
- `bes_posts.(csv|json)`

No backend is required — parsing happens in the browser.


Generated on 2026-01-02.

---

# Run locally

This page provides a step-by-step guide to run the dashboard code (from the canvas) on your own machine.

## What you’re running
- A single React component (the full dashboard) that runs entirely in the browser.
- Data is loaded by uploading `bes_brand_period` and `bes_posts` (CSV/JSON) in the UI.

## Recommended setup: Vite + React

### 1) Create a React project
```bash
npm create vite@latest prime-bank-dashboard -- --template react-ts
cd prime-bank-dashboard
npm install
```

### 2) Install libraries used by the dashboard
```bash
npm install recharts lucide-react
```

### 3) UI primitives (Card/Tabs/Select/etc.)
The canvas code imports UI primitives from:

- `@/components/ui/card`
- `@/components/ui/tabs`
- `@/components/ui/select`
- `@/components/ui/badge`
- `@/components/ui/input`
- `@/components/ui/button`

If you want the fastest local parity, install **Tailwind + shadcn/ui** and generate those components.
If you prefer not to, replace those imports with your own components.

### 4) Configure `@` import alias

**`vite.config.ts`**
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
```

**`tsconfig.json`** (or `tsconfig.app.json`)
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  }
}
```

### 5) Add the component + render it

Create `src/PrimeBankSocialDashboard.tsx` and paste the canvas code.

Then update `src/App.tsx`:
```tsx
import PrimeBankSocialDashboard from "./PrimeBankSocialDashboard";

export default function App() {
  return <PrimeBankSocialDashboard />;
}
```

### 6) Start the dev server
```bash
npm run dev
```

## Plain JavaScript option (JSX)
If you prefer to avoid TypeScript:

1. Create a Vite React project:
```bash
npm create vite@latest prime-bank-dashboard -- --template react
```
2. Save the dashboard as `PrimeBankSocialDashboard.jsx`
3. Import it in `App.jsx`

The rest (dependencies, alias, UI primitives) is the same.

## Common local issues

### “Cannot resolve '@/components/ui/…'”
You either:
- didn’t set up the `@` alias, or
- don’t have UI components at `src/components/ui/*`

Fix:
- configure the alias (above)
- add components (shadcn/ui) OR replace those imports with your own UI

### Charts not rendering
Ensure:
```bash
npm install recharts
```

### Icons missing
Ensure:
```bash
npm install lucide-react
```

---

# Data ingestion

This dashboard accepts two datasets and can read each as **CSV** or **JSON**.

## Upload flow
1. Each file is read into a string (via `FileReader`).
2. Format is detected by extension:
   - `.json` → `JSON.parse()`
   - `.csv`  → a lightweight in-app CSV parser (no external library)
3. Each row is normalized:
   - numeric-looking strings are converted into numbers (except URL/id-like fields)
4. Dataset “kind” is detected:
   - posts vs brand-period
5. If both datasets are detected successfully, they are stored in state:
   - `brandPeriod` (array of rows)
   - `posts` (array of rows)

If either dataset is missing, the loader shows a clear error:
“Could not detect bes_brand_period and/or bes_posts.”

## CSV parsing
The CSV parser is minimal:
- supports quoted fields and escaped quotes (`""`)
- splits by commas and newlines
- uses the first row as header
- returns an array of objects

> Tip: JSON uploads are recommended (fewer edge cases).

## Number coercion
After parsing, each row is coerced:
- `"123"` → `123`
- `"12.3"` → `12.3`
- fields containing `url` or `id` are not coerced

## Dataset kind detection
The app distinguishes files by inspecting the first row keys:

### `bes_posts`
Detected when a row includes:
- `post_id` OR `post_post_url`

### `bes_brand_period`
Detected when a row includes:
- `period_key`
- `brand`
- `BES_raw_avg`

## Built-in self-tests
On first render, quick self-tests run in the browser:
- period key parsing/sorting
- whitespace normalization
- aggregation math sanity checks
- dataset kind detection

---

# Metrics & calculations

The dashboard summarizes content performance across engagement, mood, conversation, and responsiveness.

## Levels
1) **Post-level** (`bes_posts`)  
Used for Top posts tables and for examples in Follow-up actions.

2) **Brand-period-level** (`bes_brand_period`)  
Used for scorecards, trends, executive summary, and comparisons.

## Owned vs Earned
- **Owned**: posts from Prime’s own pages  
- **Earned**: posts from external groups/communities attributed to the brand

They are treated separately because engagement dynamics differ (Earned often has deeper comment threads; Owned often has stronger reactions/shares).

## EP (Engagement Points)
A single interaction score that weights:
- reactions (1×)
- comments (2×)
- shares (3×)

The dashboard uses:
- EP total (volume)
- EP per post (efficiency)

## Sentiment proxy
A reaction-mix proxy for “overall mood” (normalized by total reactions).
Used as `SentimentProxy_avg_w` at brand-period level.

Interpretation:
- higher values indicate a higher share of positive reactions relative to negative

## Conversation depth
Coverage-gated:
- coverage = `depth_covered_posts / n_posts`
- “scored” when coverage ≥ 60%
- may still show a partial value when some depth data exists

Interpretation:
- higher depth usually means more unique participants and more reply chains (not just one-off comments)

## Service score
Coverage-gated:
- coverage = `service_covered_posts / n_posts`
- “scored” when coverage ≥ 50%
- otherwise partial or “Not scored”

Interpretation:
- higher service score indicates quicker typical replies where reply-time exists
- when reply-time data is missing broadly, the UI avoids guessing

## BES (Brand Experience Score)
Composite score shown as:
- **BES (raw)**: best for trends over time
- **BES (0–100)**: index-like ranking within the same context

---

# UI behavior

## Tabs
1. Dashboard  
2. Follow-up actions  
3. Executive summary  
4. Glossary  

## Owned vs Earned toggle
A sub-tab controls `sourceType`:
- `owned`
- `earned`

All computations (periods, competitor options, aggregations, charts, top posts) filter by `sourceType`.

## Prime-only vs compare
“View” selector:
- Prime Bank only (default)
- Compare vs competitor

Compare mode:
- shows competitor picker
- charts show both series
- scorecards show both values (with deltas where meaningful)

## Period selector
- “All weeks” or a specific `period_key`
- affects scorecards, charts, and top-post filtering

## Trend metric selector
Dashboard trend is a bar chart driven by the selected metric:
- EP, EP/post, post volume, sentiment, depth, service, BES (raw), BES (0–100)

Executive summary uses line charts for last-quarter BES trends.

## Clickable definitions (Glossary jump)
- Links like `#def-ep` switch to **Glossary** and scroll to the definition.
- Links like `#init-PB-EPIC-01` switch to **Follow-up actions** and scroll to the initiative.

---

# Executive summary (last quarter)

## What “last quarter” means
Implemented as the **last 13 periods** available (most recent `period_key` values), computed separately for:
- Owned
- Earned

If fewer than 13 periods exist, it uses what is available.

## What’s shown
For Owned and Earned:
- BES (raw avg) + change vs prior quarter (when available)
- EP/post, post count, advocacy shares
- sentiment, depth (scored/partial/not scored), service (scored/partial/not scored)

If competitor compare is enabled:
- includes a benchmark line with competitor BES and EP/post for the same quarter.

## Trend charts
- Owned BES trend (last quarter) — **line chart**
- Earned BES trend (last quarter) — **line chart**

Both plot `BES_raw_avg` by `period_key`.

## Top posts
Shows top 3 Prime posts in the quarter for:
- Owned
- Earned

If post-level BES exists, it ranks by BES; otherwise falls back to EP.

---

# Follow-up actions (Action backlog)

## Purpose
Generate a structured action backlog designed to lift **Owned BES (raw)** by ~25%.

## Inputs used
- Prime Owned aggregates from brand-period data
- Prime top posts (Owned + Earned) from posts data
- Competitor reference posts (Owned) for tone/format inspiration

## Competitor used for inspiration
- Prefers “BRAC Bank PLC” if present
- Otherwise picks the competitor with the highest total EP

## Output structure
Each initiative includes:
- stable key (e.g., PB-EPIC-01)
- objective and why it matters
- focus tags
- suggested owner role
- effort points
- work items with deliverables, completion checks, and rollout weeks (1–6)

Example links from the dataset are shown for Prime Owned, Prime Earned, and competitor.

---

# Suggested prompts

Use these prompts with a language model to regenerate or refine:
- Follow-up actions (action backlog)
- Executive summary

> Tip: Provide dataset excerpts (brand-period last quarter, top posts) as context.

---

## Prompt — Executive summary (last quarter)

You are a banking analytics lead. Summarize Prime Bank’s last quarter performance using the provided datasets. Split into Owned and Earned. Use clear, non-technical language. Highlight: BES direction, engagement and sharing patterns, sentiment tone, conversation depth (only if coverage supports it), and service signal (only if reply-time exists). Include 3 “what drove the result” bullets per section and 5 “what to do next” bullets total. If competitor benchmarking is enabled, compare against the selected competitor.

Inputs: last 13 periods of brand-period rows (Owned + Earned), top 3 posts per source type, competitor summary (optional).

---

## Prompt — Follow-up actions (6-week backlog)

Act as a senior digital banking communications lead. Build a 6-week action backlog to lift Prime Bank’s Owned BES by 25%. Use banking-friendly wording. For each initiative: include a stable key (PB-EPIC-##), a short objective, why it matters tied to observed performance, a suggested owner role, effort points (1–13), and 2–4 work items with deliverables, completion checks, and planned weeks (1–6). Use examples from Prime’s top Owned posts, Prime’s top Earned posts, and competitor’s top Owned posts for tone/format inspiration. Avoid actions Prime already appears to be doing heavily (infer from Prime posts).

Inputs: Prime top posts (Owned + Earned), competitor top posts (Owned), current Owned aggregates (post frequency, advocacy, sentiment, depth coverage, service coverage).

---

# Troubleshooting

## Could not detect datasets
Detection relies on keys:
- posts: `post_id` or `post_post_url`
- brand-period: `period_key`, `brand`, `BES_raw_avg`

Prefer JSON exports to avoid CSV edge cases.

## Depth/Service shows “Not scored”
These metrics are coverage-gated:
- depth scored when depth coverage ≥ 60%
- service scored when service coverage ≥ 50%

If some data exists but coverage is low, the UI may label values as “(partial)”.

## Trend charts show gaps
Nulls can exist for some metrics in some periods. Executive summary line charts connect nulls for readability.
