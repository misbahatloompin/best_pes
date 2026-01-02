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
