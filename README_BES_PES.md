# BES/PES Pipeline (Bangladesh Banks Facebook)

This package contains `bes_pes_pipeline_bd.py`, a fully offline pipeline that:

1. Applies the Prime Bank product taxonomy (theme → category → subcategory) to:
   - `denormalized_posts_wide.csv`
   - `denormalized_comments_wide.csv`

2. Computes Brand Experience Score (BES) and Product Experience Score (PES) weekly,
   following the *Brand and Product Experience* methodology.

3. Aggregates BES/PES per **week × bank × taxonomy level** (theme/category/subcategory).

4. Produces *wide dashboard* CSVs where each row is **week × bank** and columns are
   BES/PES for each taxonomy slice.

## Install

```bash
pip install -r requirements_bes_pes.txt
```

## Run

```bash
python bes_pes_pipeline_bd.py \
  --posts denormalized_posts_wide.csv \
  --comments denormalized_comments_wide.csv \
  --taxonomy Prime_Bank_taxonomy.json \
  --method_doc "Brand and Product Experience.docx" \
  --outdir outputs
```

## Outputs (in `outputs/`)

- `posts_with_taxonomy.csv`, `comments_with_taxonomy.csv`
- `posts_with_features.csv`, `comments_with_features.csv`
- `weekly_bes_pes_theme.csv`, `weekly_bes_pes_category.csv`, `weekly_bes_pes_subcategory.csv`
- `wide_dashboard_theme.csv`, `wide_dashboard_category.csv`, `wide_dashboard_subcategory.csv`
- `BES_PES_outputs.xlsx` (all key tables in one workbook)

## Notes on Bangladesh text

The script normalizes mixed English + বাংলা + Banglish (phonetic Bengali) and uses
lightweight lexicons for sentiment/intent detection. For higher accuracy, replace the
lexicon functions with a multilingual sentiment/intent classifier (e.g., a fine-tuned
transformer).
