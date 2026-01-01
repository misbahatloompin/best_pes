# BES/PES Pipeline (Bangladesh Banks Facebook)

This package contains `bes_pes_pipeline_bd_v2.py`, an offline pipeline that:

1. Applies the Prime Bank product taxonomy (theme → category → subcategory) to:
   - `denormalized_posts_wide.csv`
   - `denormalized_comments_wide.csv`

2. Computes Brand Experience Score (BES) and Product Experience Score (PES) weekly
   following the *Brand and Product Experience* methodology.

3. Aggregates BES/PES per **week × bank × taxonomy level** (theme/category/subcategory).

4. Produces *wide dashboard* CSVs where each row is **week × bank** and columns are
   BES/PES for each taxonomy slice.

## New additions in v2

### 1) Optional multilingual sentiment via Transformers (use-if-installed)
- If you install `transformers` + `torch`, the script will use a multilingual sentiment model.
- If not installed (or model load fails), it automatically falls back to the built-in lexicon scorer.

CLI flags:
- `--sentiment_engine auto|transformers|lexicon` (default: `auto`)
- `--sentiment_model <hf-model-name>` (default: `cardiffnlp/twitter-xlm-roberta-base-sentiment`)

### 2) Cross-bank taxonomy expansion (reduces Uncategorized for non‑Prime banks)
Prime taxonomy contains Prime-specific product names (e.g., “Prime Personal Loan”).
The script now:
- adds a **brand‑stripped** variant (“personal loan”)
- adds **generic Bangladesh-relevant synonyms** (English + বাংলা + Banglish)
This improves matching for BRAC Bank / DBBL / EBL / City Bank content.

## Install

```bash
pip install -r requirements_bes_pes.txt
```

Optional (better sentiment):

```bash
pip install transformers torch sentencepiece
```

## Run

```bash
python bes_pes_pipeline_bd_v2.py \
  --posts denormalized_posts_wide.csv \
  --comments denormalized_comments_wide.csv \
  --taxonomy Prime_Bank_taxonomy.json \
  --method_doc "Brand and Product Experience.docx" \
  --outdir outputs
```

Useful knobs:

```bash
python bes_pes_pipeline_bd_v2.py ... \
  --tax_min_score 1.5 \
  --sentiment_engine auto \
  --sentiment_model cardiffnlp/twitter-xlm-roberta-base-sentiment
```

## Outputs

- `posts_with_taxonomy.csv`
- `comments_with_taxonomy.csv`
- `comments_scored.csv`
- `weekly_bes_pes_theme.csv`
- `weekly_bes_pes_category.csv`
- `weekly_bes_pes_subcategory.csv`
- `wide_dashboard_theme.csv`
- `wide_dashboard_category.csv`
- `wide_dashboard_subcategory.csv`
- `BES_PES_outputs.xlsx`
