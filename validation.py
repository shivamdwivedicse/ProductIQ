"""
validation.py — independent, rule-based validation layer.
This deliberately does NOT trust the LLM's own confidence scores;
it cross-checks the actual output values against real-world patterns.
"""
import re

SCHEMA_FIELDS = [
    "product_name", "category", "brand", "description", "key_specifications",
    "materials", "dimensions", "weight", "certifications", "use_cases",
    "compatible_with", "power_requirements",
]

UNIT_PATTERNS = {
    "dimensions": re.compile(r"\d+(\.\d+)?\s*(mm|cm|m|in|inch|ft|feet|x|×)", re.I),
    "weight": re.compile(r"\d+(\.\d+)?\s*(kg|g|lb|lbs|oz|ton)", re.I),
    "power_requirements": re.compile(r"\d+(\.\d+)?\s*(v|volt|w|watt|kw|hz|phase)", re.I),
}

KNOWN_CERTS = [
    "ISO 9001", "ISO 14001", "CE", "RoHS", "UL", "ATEX", "IP65", "IP67",
    "ANSI", "ASME", "API", "FCC", "OSHA", "NEMA", "FDA",
]


def validate_record(data: dict, meta: dict) -> dict:
    flags = {}

    for field in ["dimensions", "weight", "power_requirements"]:
        val = str(data.get(field, "")).strip()
        if val and val.lower() != "unknown":
            if not UNIT_PATTERNS[field].search(val):
                flags[field] = {"level": "warning", "msg": "No recognizable unit found — verify manually."}
            else:
                flags.setdefault(field, {"level": "ok", "msg": "Unit format looks valid."})

    certs = data.get("certifications", [])
    if isinstance(certs, list):
        for c in certs:
            if not any(k.lower() in str(c).lower() for k in KNOWN_CERTS):
                flags.setdefault("certifications", {
                    "level": "warning",
                    "msg": f"'{c}' is not a recognized standard certification — double-check.",
                })

    cat = str(data.get("category", "")).lower()
    desc = str(data.get("description", "")).lower()
    if cat and cat != "unknown" and desc and desc != "unknown":
        cat_words = [w for w in re.split(r"\W+", cat) if len(w) > 3]
        if cat_words and not any(w in desc for w in cat_words):
            flags["category"] = {"level": "warning", "msg": "Category doesn't clearly match description — review."}

    for field, m in (meta or {}).items():
        conf = m.get("confidence", 100)
        if conf < 50 and field not in flags:
            flags[field] = {"level": "warning", "msg": f"Low model confidence ({conf}%) — treat as unverified."}

    return flags


def compute_quality_score(data: dict, meta: dict, flags: dict) -> int:
    total_fields = len(SCHEMA_FIELDS)
    filled = 0
    for f in SCHEMA_FIELDS:
        v = data.get(f, "unknown")
        s = str(v).strip().lower() if not isinstance(v, (list, dict)) else v
        if isinstance(s, str):
            if s and s not in ("unknown", "", "[]", "{}"):
                filled += 1
        else:
            if s:
                filled += 1
    completeness = (filled / total_fields) * 100

    confs = [m.get("confidence", 50) for m in (meta or {}).values()] or [50]
    avg_conf = sum(confs) / len(confs)

    penalty = sum(5 for f in flags.values() if f["level"] == "warning")

    score = 0.5 * completeness + 0.5 * avg_conf - penalty
    return max(0, min(100, round(score)))