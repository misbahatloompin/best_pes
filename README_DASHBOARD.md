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
