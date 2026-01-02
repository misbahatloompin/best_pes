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
