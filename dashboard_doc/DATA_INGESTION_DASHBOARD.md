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
