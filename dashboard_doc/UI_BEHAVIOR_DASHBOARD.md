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
