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
