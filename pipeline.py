#!/usr/bin/env python3
"""
BES/PES Pipeline for Bangladesh Bank Social (Facebook) Data
==========================================================

This script takes:
  - denormalized_posts_wide.csv
  - denormalized_comments_wide.csv
  - Prime_Bank_taxonomy.json (theme -> category -> subcategory)
  - (optional) Brand and Product Experience.docx (methodology reference)

and produces:

Step 1) Taxonomy-applied files:
  - posts_with_taxonomy.csv
  - comments_with_taxonomy.csv

Step 2) Feature-enriched files (for BES/PES):
  - comments_with_features.csv
  - posts_with_features.csv
  - weekly_features_<level>.csv (theme/category/subcategory)

Step 3) Aggregated BES/PES tables (per week × bank × taxonomy level):
  - weekly_bes_pes_theme.csv
  - weekly_bes_pes_category.csv
  - weekly_bes_pes_subcategory.csv

Step 4) “Wide dashboard” tables:
  - wide_dashboard_theme.csv
  - wide_dashboard_category.csv
  - wide_dashboard_subcategory.csv

Design goals
------------
- Works offline with lightweight dependencies (pandas, numpy).
- Handles English + বাংলা (Bengali) + common phonetic Bengali (Banglish) patterns.
- Uses a transparent rule-based taxonomy matcher (phrase/keyword scoring).
- Implements the Brand Experience Score (BES) and Product Experience Score (PES)
  from the provided “Brand and Product Experience” methodology document.

Important note about denominators
---------------------------------
The methodology prefers impressions/reach. If your CSVs do not contain impressions,
this script falls back to *proxy denominators*:
  - Engagement proxy (reactions + comments + shares) for "exposure"
  - Rolling z-score normalization for comparability

If you later add impressions/reach columns, the script will automatically use them.

Usage
-----
python bes_pes_pipeline_bd.py \
  --posts /path/to/denormalized_posts_wide.csv \
  --comments /path/to/denormalized_comments_wide.csv \
  --taxonomy /path/to/Prime_Bank_taxonomy.json \
  --outdir ./outputs

Optional:
  --method_doc "/path/to/Brand and Product Experience.docx"

Outputs are written to --outdir.

"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, Iterable, List, Optional, Tuple

import numpy as np
import pandas as pd


# ---------------------------
# Bangladesh-aware text utils
# ---------------------------

_BENGALI_RANGE = re.compile(r"[\u0980-\u09FF]")
_URL_RE = re.compile(r"https?://\S+|www\.\S+", re.IGNORECASE)
_EMAIL_RE = re.compile(r"\b[\w\.-]+@[\w\.-]+\.\w+\b")
_MULTI_SPACE_RE = re.compile(r"\s+")
# Keep Bangla letters, Latin letters, digits, and a small set of symbols useful in finance.
_CLEAN_CHARS_RE = re.compile(r"[^0-9A-Za-z\u0980-\u09FF\s৳%+.-]")

# Common Bangla digit normalization
_BN_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")

# Normalize common Bengali forms: e.g., 'য়' and 'য়' variants
_BN_CANON = {
    "য়": "য়",
    "ড়": "ড়",
    "ঢ়": "ঢ়",
}

# Minimal Bangladesh-focused sentiment + intent lexicons.
# You SHOULD expand these lists over time using your own labeled data.
POS_WORDS = {
    "good", "great", "excellent", "awesome", "love", "nice", "best", "amazing", "thanks", "thank", "thankyou",
    "dhonnobad", "ধন্যবাদ", "ধন্যবাদ।", "ভালো", "valo", "bhalo", "bhalo", "সুন্দর", "চমৎকার", "দারুণ",
    "helpful", "fast", "quick", "smooth", "easy", "awesome", "cool",
}
NEG_WORDS = {
    "bad", "worse", "worst", "poor", "hate", "scam", "fraud", "fake", "slow", "down", "bug", "problem", "issue",
    "kharap", "খারাপ", "বিরক্ত", "সমস্যা", "হয় না", "হচ্ছে না", "কাজ করছে না", "can't", "cannot", "unable",
    "delay", "late", "charging", "charge", "fee", "fees", "unprofessional", "helpless", "disappointed",
    "blocked", "block", "error", "fails", "failed",
}

QUESTION_WORDS = {
    "how", "why", "what", "when", "where", "which", "can i", "could i", "kivabe", "kibhabe",
    "কিভাবে", "কি ভাবে", "কেন", "কি", "কবে", "কোথায়", "কোন", "help", "please help", "plz", "pls",
}
COMPLAINT_WORDS = {
    "problem", "issue", "scam", "fraud", "fake", "not working", "doesn't work", "can't", "cannot", "unable",
    "slow", "down", "error", "blocked", "charging", "fee", "fees",
    "সমস্যা", "হচ্ছে না", "কাজ করছে না", "ডাউন", "স্লো", "ব্লক", "ফি",
}
FEATURE_REQUEST_WORDS = {
    "please add", "add feature", "feature", "request", "wish", "need", "should have", "update", "improve",
    "চাই", "দরকার", "যোগ", "অপশন", "ফিচার", "আপডেট", "উন্নতি",
}
RESOLUTION_WORDS = {
    "fixed", "solved", "resolved", "works now", "working now", "thanks, fixed", "ok now", "now ok",
    "সমাধান", "ঠিক", "হয়ে গেছে", "হইছে", "কাজ করছে",
}

# Product-issue / severity hints (very rough; replace with a classifier when available)
SEVERITY_5 = {"data loss", "lost money", "money lost", "stolen", "fraud", "scam", "chargeback", "account hacked",
              "টাকা কাটা", "টাকা নাই", "হ্যাক", "প্রতারনা"}
SEVERITY_4 = {"cannot login", "can't login", "unable to login", "app crash", "crash", "service down",
              "লগইন", "ঢুকতে পারছি না", "ডাউন", "ক্র্যাশ"}
SEVERITY_3 = {"not working", "doesn't work", "error", "failed", "otp", "verification", "slow",
              "হচ্ছে না", "কাজ করছে না", "এরর", "ফেইল", "ওটিপি", "স্লো"}
SEVERITY_2 = {"delay", "late", "pending", "wait", "support", "no response", "unresponsive",
              "দেরি", "লেট", "পেন্ডিং", "রেসপন্স"}
SEVERITY_1 = {"annoying", "irritating", "confusing", "hard", "difficult",
              "বিরক্ত", "ঝামেলা", "কনফিউজিং"}


def normalize_text_bd(text: Optional[str]) -> str:
    """
    Normalize English + Bengali + phonetic Bengali (“Banglish”) text for matching.

    - Lowercase Latin
    - Remove URLs/emails
    - Normalize Bengali digits to ASCII
    - Keep Bengali letters (U+0980–U+09FF)
    - Remove noisy punctuation but keep finance symbols like ৳, %, +, -, .
    """
    if text is None or (isinstance(text, float) and np.isnan(text)):
        return ""
    t = str(text)
    t = _URL_RE.sub(" ", t)
    t = _EMAIL_RE.sub(" ", t)
    t = t.translate(_BN_DIGITS)
    for k, v in _BN_CANON.items():
        t = t.replace(k, v)
    t = t.lower()
    t = _CLEAN_CHARS_RE.sub(" ", t)
    t = _MULTI_SPACE_RE.sub(" ", t).strip()
    return t


def contains_bengali(text: str) -> bool:
    return bool(_BENGALI_RANGE.search(text))


def slugify(name: str) -> str:
    name = normalize_text_bd(name)
    name = re.sub(r"[^\w]+", "_", name)
    name = re.sub(r"_+", "_", name).strip("_")
    return name or "na"


# ---------------------------
# Taxonomy loading + matching
# ---------------------------

@dataclass(frozen=True)
class Taxon:
    theme: str
    category: str
    subcategory: str
    phrases: Tuple[str, ...]  # normalized phrases


def _expand_phrases(raw: str) -> List[str]:
    """
    Expand a taxonomy string into a set of match phrases:
      - remove parentheses
      - include acronym/short forms if obvious
      - add Bangladesh-specific variants (loan/rin/ঋণ, card/কার্ড, app/অ্যাপ, etc.)
    """
    base = raw.strip()
    base_no_paren = re.sub(r"\s*\(.*?\)\s*", " ", base).strip()
    phrases = {base, base_no_paren}

    # Common normalization: remove punctuation
    for p in list(phrases):
        phrases.add(re.sub(r"[-–—]", " ", p))
        phrases.add(re.sub(r"[^0-9A-Za-z\u0980-\u09FF\s]", " ", p))

    # Heuristic variants
    lower = base_no_paren.lower()
    if "loan" in lower:
        phrases.update({"loan", "rin", "ঋণ", "লোন"})
    if "deposit" in lower or "savings" in lower or "account" in lower:
        phrases.update({"account", "a/c", "savings", "deposit", "dps", "fdr", "সেভিংস", "একাউন্ট", "অ্যাকাউন্ট"})
    if "card" in lower:
        phrases.update({"card", "debit card", "credit card", "কার্ড", "ক্রেডিট", "ডেবিট"})
    if "app" in lower or "digital" in lower:
        phrases.update({"app", "apps", "mobile app", "অ্যাপ", "ডিজিটাল"})
    if "remit" in lower or "remittance" in lower:
        phrases.update({"remit", "remittance", "প্রবাসী", "রেমিট্যান্স"})
    if "islamic" in lower or "hasanah" in lower or "mudaraba" in lower:
        phrases.update({"islamic", "shariah", "হালাল", "ইসলামিক", "মুদারাবা"})
    if "women" in lower or "neera" in lower:
        phrases.update({"women", "female", "নারী", "উইমেন", "neera"})
    if "sme" in lower:
        phrases.update({"sme", "উদ্যোক্তা", "ব্যবসা"})
    if "corporate" in lower:
        phrases.update({"corporate", "company", "ব্যবসা", "কর্পোরেট"})
    if "priority" in lower:
        phrases.update({"priority", "premium", "privilege"})

    # Normalize all phrases for matching
    out = []
    for p in phrases:
        n = normalize_text_bd(p)
        if n and len(n) >= 3:
            out.append(n)
    # Deduplicate while preserving length-desc order (prefer specific phrases)
    out = sorted(set(out), key=lambda x: (-len(x), x))
    return out


def load_taxonomy(json_path: str) -> List[Taxon]:
    """Load Prime Bank taxonomy JSON and return a flat list of Taxon objects."""
    with open(json_path, "r", encoding="utf-8") as f:
        obj = json.load(f)

    taxons: List[Taxon] = []
    for theme in obj["taxonomy"]["themes"]:
        theme_name = theme["name"]
        for cat in theme["categories"]:
            cat_name = cat["name"]
            for sub in cat["subCategories"]:
                phrases = _expand_phrases(sub) + _expand_phrases(cat_name) + _expand_phrases(theme_name)
                taxons.append(Taxon(theme=theme_name, category=cat_name, subcategory=sub, phrases=tuple(phrases)))
    return taxons


def best_taxonomy_match(text: str, taxons: List[Taxon], min_score: float = 2.0) -> Tuple[str, str, str, float]:
    """
    Find the best taxonomy match for a text.

    Scoring:
      - Match longer phrases higher (more specific)
      - Subcategory phrase matches beat category/theme-only matches naturally
      - Multiple phrase matches add up
    """
    t = normalize_text_bd(text)
    if not t:
        return ("Uncategorized", "Uncategorized", "Uncategorized", 0.0)

    best = ("Uncategorized", "Uncategorized", "Uncategorized", 0.0)

    for taxon in taxons:
        score = 0.0
        for phrase in taxon.phrases:
            # For Latin phrases, require a loose word boundary. For Bengali, substring is fine.
            if contains_bengali(phrase):
                hit = phrase in t
            else:
                hit = bool(re.search(rf"(^|[\s]){re.escape(phrase)}([\s]|$)", t))
                if not hit and len(phrase) >= 6:
                    # Allow substring for longer Latin phrases (helps with punctuation differences)
                    hit = phrase in t

            if hit:
                score += max(1.0, min(6.0, len(phrase) / 6.0))

        # small boost if the literal subcategory name appears
        sub_norm = normalize_text_bd(taxon.subcategory)
        if sub_norm and sub_norm in t:
            score += 2.0

        if score > best[3]:
            best = (taxon.theme, taxon.category, taxon.subcategory, score)

    if best[3] < min_score:
        return ("Uncategorized", "Uncategorized", "Uncategorized", best[3])
    return best


def apply_taxonomy(df: pd.DataFrame, text_cols: List[str], taxons: List[Taxon], prefix: str) -> pd.DataFrame:
    """
    Apply taxonomy to a dataframe given the list of text columns to consider.
    Adds:
      <prefix>_theme, <prefix>_category, <prefix>_subcategory, <prefix>_tax_score
    """
    def row_text(r) -> str:
        parts = []
        for c in text_cols:
            if c in r and pd.notna(r[c]):
                parts.append(str(r[c]))
        return " ".join(parts)

    matches = df.apply(lambda r: best_taxonomy_match(row_text(r), taxons), axis=1)
    df[f"{prefix}_theme"] = matches.apply(lambda x: x[0])
    df[f"{prefix}_category"] = matches.apply(lambda x: x[1])
    df[f"{prefix}_subcategory"] = matches.apply(lambda x: x[2])
    df[f"{prefix}_tax_score"] = matches.apply(lambda x: x[3])
    return df


# ---------------------------
# Bank name standardization
# ---------------------------

BANK_PATTERNS = [
    ("Prime Bank", [r"\bprime\b", r"prime bank", r"primebank"]),
    ("BRAC Bank", [r"\bbrac\b", r"brac bank"]),
    ("Dutch-Bangla Bank", [r"dutch", r"dbbl", r"dutch bangla", r"dutch-bangla"]),
    ("Eastern Bank", [r"\bebl\b", r"eastern bank"]),
    ("City Bank", [r"\bcity\b", r"city bank"]),
]

def standardize_bank(name: Optional[str]) -> str:
    t = normalize_text_bd(name or "")
    for canon, pats in BANK_PATTERNS:
        for p in pats:
            if re.search(p, t):
                return canon
    # fallback: keep original if something exists
    return (name or "Unknown").strip() or "Unknown"


# ---------------------------
# Time bucketing (week start)
# ---------------------------

def to_week_start(dt_series: pd.Series) -> pd.Series:
    """
    Convert timestamps to week-start (Monday) date (YYYY-MM-DD).
    Works with naive or tz-aware strings.
    """
    ts = pd.to_datetime(dt_series, errors="coerce", utc=True)
    # Monday as week start: subtract weekday
    week_start = (ts.dt.floor("D") - pd.to_timedelta(ts.dt.weekday, unit="D")).dt.date
    return week_start.astype("datetime64[ns]")


# ---------------------------
# Comment features: sentiment + intent
# ---------------------------

def lexicon_sentiment(text: str) -> float:
    """
    Very lightweight sentiment scorer in [-1, +1] based on lexicons.

    Replace with a proper multilingual sentiment model if you can.
    """
    t = normalize_text_bd(text)
    if not t:
        return 0.0
    toks = t.split()
    pos = sum(1 for w in toks if w in POS_WORDS)
    neg = sum(1 for w in toks if w in NEG_WORDS)
    if pos == 0 and neg == 0:
        # Mild heuristic: emojis often show affect; keep neutral if unknown
        return 0.0
    score = (pos - neg) / max(1, pos + neg)
    return float(np.clip(score, -1.0, 1.0))


def has_any(text: str, phrases: Iterable[str]) -> bool:
    t = normalize_text_bd(text)
    for p in phrases:
        pn = normalize_text_bd(p)
        if not pn:
            continue
        if contains_bengali(pn):
            if pn in t:
                return True
        else:
            if pn in t:
                return True
    return False


def is_question(text: str) -> bool:
    if "?" in (text or ""):
        return True
    return has_any(text, QUESTION_WORDS)


def is_complaint(text: str) -> bool:
    return has_any(text, COMPLAINT_WORDS)


def is_feature_request(text: str) -> bool:
    return has_any(text, FEATURE_REQUEST_WORDS)


def is_resolution(text: str) -> bool:
    return has_any(text, RESOLUTION_WORDS)


def is_praise(text: str) -> bool:
    # praise = positive sentiment OR explicit thanks
    s = lexicon_sentiment(text)
    return s > 0.3 or has_any(text, {"thanks", "thank", "dhonnobad", "ধন্যবাদ", "ভালো", "valo", "bhalo"})


def estimate_severity(text: str) -> int:
    """
    Estimate product issue severity 1–5 using rough keyword buckets.
    Only meaningful if the comment is an "issue/complaint".
    """
    t = normalize_text_bd(text)
    if not t:
        return 1
    def hit(s): return has_any(t, s)
    if hit(SEVERITY_5): return 5
    if hit(SEVERITY_4): return 4
    if hit(SEVERITY_3): return 3
    if hit(SEVERITY_2): return 2
    if hit(SEVERITY_1): return 1
    return 2


def add_comment_features(df: pd.DataFrame, text_col: str) -> pd.DataFrame:
    df = df.copy()
    df["sentiment"] = df[text_col].astype(str).map(lexicon_sentiment)
    df["is_question"] = df[text_col].astype(str).map(is_question).astype(int)
    df["is_complaint"] = df[text_col].astype(str).map(is_complaint).astype(int)
    df["is_feature_request"] = df[text_col].astype(str).map(is_feature_request).astype(int)
    df["is_resolution"] = df[text_col].astype(str).map(is_resolution).astype(int)
    df["is_praise"] = df[text_col].astype(str).map(is_praise).astype(int)
    # confusion proxy: question + "how-to" words or negative with question
    df["is_confusion"] = ((df["is_question"] == 1) & (df["sentiment"] <= 0.1)).astype(int)
    df["severity"] = np.where(df["is_complaint"] == 1, df[text_col].astype(str).map(estimate_severity), 0)
    return df


# ---------------------------
# Post features
# ---------------------------

def add_post_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()

    # Identify the best timestamp column available
    time_col_candidates = ["post_creation_time", "post_facebook_creation_time", "post_created_at"]
    time_col = next((c for c in time_col_candidates if c in df.columns), None)
    if not time_col:
        raise ValueError("No usable post timestamp column found.")

    df["week_start"] = to_week_start(df[time_col])

    # Standardize bank
    bank_col_candidates = ["page_name", "post_tagged_bank", "post_tagged_banks"]
    bank_col = next((c for c in bank_col_candidates if c in df.columns), None)
    df["bank"] = df[bank_col].map(standardize_bank) if bank_col else "Unknown"

    # Weighted engagement (methodology default weights)
    # w_r=1, w_c=3, w_s=5, w_sv=4 (saves not available in provided CSVs)
    reactions = df.get("post_reactions_total", 0).fillna(0)
    comments = df.get("post_total_comment_count", 0).fillna(0)
    shares = df.get("post_share_count", 0).fillna(0)
    df["weighted_engagement"] = 1.0 * reactions + 3.0 * comments + 5.0 * shares

    # Exposure denominator preference order: impressions -> reach -> engagement proxy
    denom = None
    for c in df.columns:
        cl = c.lower()
        if "impression" in cl or cl == "impressions":
            denom = df[c].astype(float)
            df["exposure_denom_used"] = c
            break
    if denom is None:
        for c in df.columns:
            cl = c.lower()
            if "reach" in cl:
                denom = df[c].astype(float)
                df["exposure_denom_used"] = c
                break
    if denom is None:
        denom = (reactions + comments + shares).astype(float)
        df["exposure_denom_used"] = "engagement_proxy"

    denom = denom.fillna(0.0)
    df["exposure"] = np.where(denom > 0, denom, np.nan)

    # "ER" becomes weighted_engagement / exposure if exposure exists, else raw weighted engagement
    df["engagement_rate"] = df["weighted_engagement"] / df["exposure"]

    # Rolling z-score per bank to make posts comparable across pages
    df["engagement_rate_z"] = df.groupby("bank")["engagement_rate"].transform(
        lambda s: (s - s.mean()) / (s.std(ddof=0) if s.std(ddof=0) > 0 else 1.0)
    )

    # Convert z to 0–100 using normal CDF (a stable mapping even with few points)
    df["zER_norm"] = df["engagement_rate_z"].map(lambda z: float(100.0 * 0.5 * (1.0 + math.erf(z / math.sqrt(2.0)))))
    df["zER_norm"] = df["zER_norm"].fillna(50.0)

    # Advocacy proxy: shares per 1k exposure
    df["shares_per_1k_exposure"] = (shares / (df["exposure"] / 1000.0)).replace([np.inf, -np.inf], np.nan)

    return df


# ---------------------------
# Normalization helpers
# ---------------------------

def percentile_norm(s: pd.Series) -> pd.Series:
    """Map a series to 0–100 using rank percentiles. If constant, returns 50."""
    if s.isna().all():
        return pd.Series([50.0] * len(s), index=s.index)
    s2 = s.copy()
    # If constant, neutralize
    if s2.nunique(dropna=True) <= 1:
        return pd.Series([50.0] * len(s2), index=s2.index)
    return s2.rank(pct=True) * 100.0


def norm_by_group(df: pd.DataFrame, col: str, group_cols: List[str], new_col: str) -> pd.DataFrame:
    df[new_col] = df.groupby(group_cols)[col].transform(percentile_norm)
    return df


# ---------------------------
# BES / PES computation
# ---------------------------

def compute_weekly_scores(
    posts: pd.DataFrame,
    comments: pd.DataFrame,
    level: str,
) -> pd.DataFrame:
    """
    Compute weekly BES/PES at the given taxonomy level:
      level in {"theme","category","subcategory"}
    Returns a dataframe grouped by [week_start, bank, tax_level_value].
    """

    if level not in {"theme", "category", "subcategory"}:
        raise ValueError("level must be one of: theme, category, subcategory")

    post_tax_col = f"post_{level}"
    com_tax_col = f"comment_{level}"

    # Post-level weekly aggregates
    p = posts.copy()
    # For posts, we care about zER, shares, exposure
    post_grp = (p.groupby(["week_start", "bank", post_tax_col])
                  .agg(
                      posts=("post_id", "count") if "post_id" in p.columns else ("post_facebook_post_id", "count"),
                      exposure=("exposure", "sum"),
                      weighted_engagement=("weighted_engagement", "sum"),
                      zER_norm=("zER_norm", "mean"),
                      shares=("post_share_count", "sum"),
                      shares_per_1k_exposure=("shares_per_1k_exposure", "mean"),
                      reactions=("post_reactions_total", "sum"),
                      post_comments=("post_total_comment_count", "sum"),
                  )
                  .reset_index()
               )
    post_grp = post_grp.rename(columns={post_tax_col: "tax_value"})

    # Comment-level weekly aggregates
    c = comments.copy()
    com_grp = (c.groupby(["week_start", "bank", com_tax_col])
                 .agg(
                     comments=("comment_id", "count") if "comment_id" in c.columns else (c.columns[0], "count"),
                     sentiment_mean=("sentiment", "mean"),
                     sentiment_sum=("sentiment", "sum"),
                     is_question=("is_question", "sum"),
                     is_confusion=("is_confusion", "sum"),
                     is_complaint=("is_complaint", "sum"),
                     is_feature_request=("is_feature_request", "sum"),
                     is_resolution=("is_resolution", "sum"),
                     is_praise=("is_praise", "sum"),
                     severity_sum=("severity", "sum"),
                     severity_mean=("severity", "mean"),
                 )
                 .reset_index()
              )
    com_grp = com_grp.rename(columns={com_tax_col: "tax_value"})

    # Merge and fill
    df = pd.merge(post_grp, com_grp, on=["week_start", "bank", "tax_value"], how="outer")
    for col in ["posts", "comments", "exposure", "weighted_engagement", "zER_norm", "shares", "shares_per_1k_exposure",
                "reactions", "post_comments", "sentiment_mean", "sentiment_sum", "is_question", "is_confusion",
                "is_complaint", "is_feature_request", "is_resolution", "is_praise", "severity_sum", "severity_mean"]:
        if col in df.columns:
            df[col] = df[col].fillna(0.0)

    # ---- Brand Experience components ----
    # BSS: scale sentiment [-1,1] -> [0,100]
    df["BSS_norm"] = ((df["sentiment_mean"].clip(-1, 1) + 1.0) / 2.0) * 100.0

    # Confusion rate
    df["confusion_rate"] = np.where(df["comments"] > 0, df["is_confusion"] / df["comments"], 0.0)

    # Advocacy: prefer shares per 1k exposure (may be NaN if exposure missing)
    # If shares_per_1k_exposure is missing or zero, use shares per post as proxy
    df["advocacy_raw"] = df["shares_per_1k_exposure"].replace([np.inf, -np.inf], np.nan)
    df.loc[df["advocacy_raw"].isna(), "advocacy_raw"] = np.where(df["posts"] > 0, df["shares"] / df["posts"], 0.0)

    # zER_norm already 0-100 (normal CDF mapping)
    df["zER_component"] = df["zER_norm"].fillna(50.0)

    # Helpfulness: not measurable in provided data (needs brand replies).
    # Keep as neutral 50, but you can plug in response metrics later.
    df["helpfulness_component"] = 50.0

    # Normalize Advocacy and Confusion into 0-100 within each bank×tax slice over time
    df = norm_by_group(df, "advocacy_raw", ["bank", "tax_value"], "advocacy_norm")
    df = norm_by_group(df, "confusion_rate", ["bank", "tax_value"], "confusion_norm")

    # BES formula (0–100)
    df["BES"] = (
        0.35 * df["BSS_norm"] +
        0.20 * df["advocacy_norm"] +
        0.15 * df["zER_component"] +
        0.15 * df["helpfulness_component"] +
        0.15 * (100.0 - df["confusion_norm"])
    ).clip(0, 100)

    # ---- Product Experience components ----
    # Issue rate: issues per 1k exposure, fallback to issues per 100 comments if exposure is missing
    df["issue_mentions"] = df["is_complaint"]  # includes "not working", "issue", etc.
    df["issue_rate_per_1k_exposure"] = np.where(df["exposure"] > 0, df["issue_mentions"] / (df["exposure"] / 1000.0), np.nan)
    df["issue_rate_per_100_comments"] = np.where(df["comments"] > 0, df["issue_mentions"] / (df["comments"] / 100.0), np.nan)
    df["issue_rate_raw"] = df["issue_rate_per_1k_exposure"]
    df.loc[df["issue_rate_raw"].isna(), "issue_rate_raw"] = df["issue_rate_per_100_comments"]

    # Severity-weighted issue score (average severity across complaints)
    df["SWI_raw"] = np.where(df["issue_mentions"] > 0, df["severity_sum"] / df["issue_mentions"].replace(0, np.nan), np.nan)

    # Resolution rate proxy
    df["resolution_rate"] = np.where(df["issue_mentions"] > 0, df["is_resolution"] / df["issue_mentions"], 0.0)

    # Praise rate
    df["praise_rate"] = np.where(df["comments"] > 0, df["is_praise"] / df["comments"], 0.0)

    # Product confusion (reuse confusion_rate)
    df["product_confusion_rate"] = df["confusion_rate"]

    # Normalize product metrics within bank×tax slice
    df = norm_by_group(df, "issue_rate_raw", ["bank", "tax_value"], "issue_rate_norm")
    df = norm_by_group(df, "SWI_raw", ["bank", "tax_value"], "SWI_norm")
    df = norm_by_group(df, "resolution_rate", ["bank", "tax_value"], "resolution_norm")
    df = norm_by_group(df, "praise_rate", ["bank", "tax_value"], "praise_norm")
    df = norm_by_group(df, "product_confusion_rate", ["bank", "tax_value"], "pconfusion_norm")

    # PES formula (0–100)
    df["PES"] = (
        0.30 * (100.0 - df["issue_rate_norm"]) +
        0.20 * (100.0 - df["SWI_norm"]) +
        0.15 * df["resolution_norm"] +
        0.15 * df["praise_norm"] +
        0.20 * (100.0 - df["pconfusion_norm"])
    ).clip(0, 100)

    # Sort for readability
    df = df.sort_values(["week_start", "bank", "tax_value"]).reset_index(drop=True)
    df.insert(2, "taxonomy_level", level)

    return df


def make_wide_dashboard(df_weekly: pd.DataFrame, level: str) -> pd.DataFrame:
    """
    Wide dashboard: one row per week×bank, columns are taxonomy slices.
    Produces BES/PES columns per tax_value.
    """
    key_cols = ["week_start", "bank"]
    df = df_weekly.copy()

    # Create safe column keys
    df["tax_slug"] = df["tax_value"].map(slugify)
    df["BES_col"] = "BES__" + level + "__" + df["tax_slug"]
    df["PES_col"] = "PES__" + level + "__" + df["tax_slug"]

    bes = df.pivot_table(index=key_cols, columns="BES_col", values="BES", aggfunc="mean")
    pes = df.pivot_table(index=key_cols, columns="PES_col", values="PES", aggfunc="mean")

    wide = pd.concat([bes, pes], axis=1).reset_index()

    # Optional: include volume columns aggregated across all taxonomy values that week
    vol = (df.groupby(key_cols)
             .agg(
                 posts=("posts", "sum"),
                 comments=("comments", "sum"),
                 exposure=("exposure", "sum"),
                 shares=("shares", "sum"),
                 weighted_engagement=("weighted_engagement", "sum"),
             )
             .reset_index())
    wide = pd.merge(wide, vol, on=key_cols, how="left")

    # Stable column ordering: keys, volumes, then metrics
    metric_cols = [c for c in wide.columns if c not in key_cols + ["posts", "comments", "exposure", "shares", "weighted_engagement"]]
    wide = wide[key_cols + ["posts", "comments", "exposure", "shares", "weighted_engagement"] + sorted(metric_cols)]
    return wide


# ---------------------------
# Main pipeline
# ---------------------------

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--posts", required=True, help="Path to denormalized_posts_wide.csv")
    ap.add_argument("--comments", required=True, help="Path to denormalized_comments_wide.csv")
    ap.add_argument("--taxonomy", required=True, help="Path to Prime_Bank_taxonomy.json")
    ap.add_argument("--method_doc", default=None, help="Optional path to Brand and Product Experience.docx (reference)")
    ap.add_argument("--outdir", required=True, help="Output directory")
    args = ap.parse_args()

    os.makedirs(args.outdir, exist_ok=True)

    print("[1/4] Loading inputs...")
    posts = pd.read_csv(args.posts)
    comments = pd.read_csv(args.comments)
    taxons = load_taxonomy(args.taxonomy)

    # --- STEP 1: Apply taxonomy ---
    print("[1/4] Applying taxonomy...")

    # Posts: use caption + (optional) media items text if present
    posts = apply_taxonomy(posts, text_cols=["post_caption"], taxons=taxons, prefix="post")

    # Comments: use comment text + parent post caption as context
    comments = apply_taxonomy(
        comments,
        text_cols=["comment_comment_text", "post_caption"],
        taxons=taxons,
        prefix="comment",
    )

    posts_out = os.path.join(args.outdir, "posts_with_taxonomy.csv")
    comments_out = os.path.join(args.outdir, "comments_with_taxonomy.csv")
    posts.to_csv(posts_out, index=False, encoding="utf-8-sig")
    comments.to_csv(comments_out, index=False, encoding="utf-8-sig")
    print(f"  wrote: {posts_out}")
    print(f"  wrote: {comments_out}")

    # --- STEP 2: Create BES/PES features ---
    print("[2/4] Engineering features...")

    posts_feat = add_post_features(posts)

    # Comments timestamp and bank
    com_time_candidates = ["comment_commented_at", "comment_created_at", "comment_updated_at"]
    com_time_col = next((c for c in com_time_candidates if c in comments.columns), None)
    if not com_time_col:
        raise ValueError("No usable comment timestamp column found.")
    comments_feat = comments.copy()
    comments_feat["week_start"] = to_week_start(comments_feat[com_time_col])

    # bank from page_name (carried via denormalization) or comment_tagged_bank
    bank_col_candidates = ["page_name", "comment_tagged_bank", "comment_comment_tagged_banks", "post_tagged_bank"]
    bank_col = next((c for c in bank_col_candidates if c in comments_feat.columns), None)
    comments_feat["bank"] = comments_feat[bank_col].map(standardize_bank) if bank_col else "Unknown"

    comments_feat = add_comment_features(comments_feat, text_col="comment_comment_text")

    posts_feat_out = os.path.join(args.outdir, "posts_with_features.csv")
    comments_feat_out = os.path.join(args.outdir, "comments_with_features.csv")
    posts_feat.to_csv(posts_feat_out, index=False, encoding="utf-8-sig")
    comments_feat.to_csv(comments_feat_out, index=False, encoding="utf-8-sig")
    print(f"  wrote: {posts_feat_out}")
    print(f"  wrote: {comments_feat_out}")

    # --- STEP 3: Aggregated BES/PES tables ---
    print("[3/4] Computing weekly BES/PES tables...")

    # Prepare taxonomy-level aliases for convenience (posts already have post_theme/category/subcategory)
    for level in ["theme", "category", "subcategory"]:
        posts_feat[f"post_{level}"] = posts_feat.get(f"post_{level}", posts_feat.get(f"post_{level}", "Uncategorized"))
        comments_feat[f"comment_{level}"] = comments_feat.get(f"comment_{level}", comments_feat.get(f"comment_{level}", "Uncategorized"))

    weekly_theme = compute_weekly_scores(posts_feat, comments_feat, level="theme")
    weekly_cat = compute_weekly_scores(posts_feat, comments_feat, level="category")
    weekly_sub = compute_weekly_scores(posts_feat, comments_feat, level="subcategory")

    theme_out = os.path.join(args.outdir, "weekly_bes_pes_theme.csv")
    cat_out = os.path.join(args.outdir, "weekly_bes_pes_category.csv")
    sub_out = os.path.join(args.outdir, "weekly_bes_pes_subcategory.csv")
    weekly_theme.to_csv(theme_out, index=False, encoding="utf-8-sig")
    weekly_cat.to_csv(cat_out, index=False, encoding="utf-8-sig")
    weekly_sub.to_csv(sub_out, index=False, encoding="utf-8-sig")
    print(f"  wrote: {theme_out}")
    print(f"  wrote: {cat_out}")
    print(f"  wrote: {sub_out}")

    # --- STEP 4: Wide dashboards ---
    print("[4/4] Creating wide dashboards (pivoted)...")

    wide_theme = make_wide_dashboard(weekly_theme, level="theme")
    wide_cat = make_wide_dashboard(weekly_cat, level="category")
    wide_sub = make_wide_dashboard(weekly_sub, level="subcategory")

    wide_theme_out = os.path.join(args.outdir, "wide_dashboard_theme.csv")
    wide_cat_out = os.path.join(args.outdir, "wide_dashboard_category.csv")
    wide_sub_out = os.path.join(args.outdir, "wide_dashboard_subcategory.csv")

    wide_theme.to_csv(wide_theme_out, index=False, encoding="utf-8-sig")
    wide_cat.to_csv(wide_cat_out, index=False, encoding="utf-8-sig")
    wide_sub.to_csv(wide_sub_out, index=False, encoding="utf-8-sig")

    print(f"  wrote: {wide_theme_out}")
    print(f"  wrote: {wide_cat_out}")
    print(f"  wrote: {wide_sub_out}")

    # Convenience: export an Excel workbook with all key outputs
    xlsx_path = os.path.join(args.outdir, "BES_PES_outputs.xlsx")
    with pd.ExcelWriter(xlsx_path, engine="openpyxl") as xl:
        weekly_theme.to_excel(xl, sheet_name="weekly_theme", index=False)
        weekly_cat.to_excel(xl, sheet_name="weekly_category", index=False)
        weekly_sub.to_excel(xl, sheet_name="weekly_subcategory", index=False)
        wide_theme.to_excel(xl, sheet_name="wide_theme", index=False)
        wide_cat.to_excel(xl, sheet_name="wide_category", index=False)
        wide_sub.to_excel(xl, sheet_name="wide_subcategory", index=False)
    print(f"  wrote: {xlsx_path}")

    print("Done.")


if __name__ == "__main__":
    main()
