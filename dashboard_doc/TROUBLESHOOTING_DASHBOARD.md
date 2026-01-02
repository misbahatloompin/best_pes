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
