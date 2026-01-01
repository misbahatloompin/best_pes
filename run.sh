#!/bin/bash
python pipeline.py \
  --posts denormalized_posts_wide.csv \
  --comments denormalized_comments_wide.csv \
  --taxonomy Prime_Bank_taxonomy.json \
  --method_doc "Brand and Product Experience.docx" \
  --outdir outputs