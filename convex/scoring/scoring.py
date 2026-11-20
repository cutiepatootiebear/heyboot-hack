"""Hey Boot option scoring (Python prototype; scoring.ts is the port).

score = w1*(1 - price/budget) + w2*discount_pct + w3*preference_match + w4*in_stock

Pure function, no network. Rules:
- price is the price AFTER a *verified* military discount. An unverified
  discount (no Senso source) counts as 0 and is not applied.
- Hard rejects (with a reason): out of stock, over budget, wrong size/width.
- Returns the top 2 ranked options + every rejected row with its reason.
"""
from __future__ import annotations

import csv
import os
import re
import sys
from typing import Dict, List, Optional

WEIGHTS = {"price": 0.40, "discount": 1.00, "fit": 0.45, "stock": 0.15}

WIDTH_WORDS = {"wide": "wide", "2e": "wide", "4e": "extra wide", "extra wide": "extra wide",
               "narrow": "narrow", "regular": "regular", "medium": "regular", "d": "regular"}


def _parse_size(item: str) -> Optional[str]:
    # Size is the number right before the width word / after "Men's"/"Women's".
    m = re.search(r"(?:men's|women's|size)\s+(\d{1,2}(?:\.5)?)", item, re.I)
    return m.group(1) if m else None


def _parse_width(item: str) -> Optional[str]:
    low = item.lower()
    for word in sorted(WIDTH_WORDS, key=len, reverse=True):
        if re.search(rf"\b{re.escape(word)}\b", low):
            return WIDTH_WORDS[word]
    return None


def _to_bool(v) -> bool:
    return str(v).strip().lower() in ("1", "true", "yes", "y")


def preference_match(item: str, prefs: Dict[str, str]) -> float:
    """Share of remembered preferences (brand, size, width) the item satisfies.
    Only preferences that apply to the item are counted (a lock has no size)."""
    checks = []
    if prefs.get("brand"):
        checks.append(re.search(rf"\b{re.escape(prefs['brand'])}\b", item, re.I) is not None)
    size = _parse_size(item)
    if prefs.get("size") and size is not None:
        checks.append(size == str(prefs["size"]))
    width = _parse_width(item)
    if prefs.get("width") and width is not None:
        checks.append(width == WIDTH_WORDS.get(prefs["width"].lower(), prefs["width"].lower()))
    return sum(checks) / len(checks) if checks else 0.5  # neutral when nothing applies


def score_options(rows: List[Dict], prefs: Dict[str, str], budget: float,
                  verified_discount_stores: Optional[set] = None, top_n: int = 2) -> Dict:
    """rows: catalog dicts (item, store, price, mil_discount_pct, url, captured_at, in_stock).
    verified_discount_stores: stores whose discount Senso confirmed with a source."""
    verified = {s.lower() for s in (verified_discount_stores or set())}
    ranked, rejected = [], []

    for r in rows:
        item, store = r["item"], r["store"]
        list_price = float(r["price"])
        raw_disc = float(r.get("mil_discount_pct") or 0)
        disc_pct = raw_disc / 100 if raw_disc > 1 else raw_disc  # accept 10 or 0.10
        disc_ok = disc_pct > 0 and store.lower() in verified
        applied = disc_pct if disc_ok else 0.0
        price = round(list_price * (1 - applied), 2)
        in_stock = _to_bool(r.get("in_stock", True))

        base = {"item": item, "store": store, "url": r.get("url"), "captured_at": r.get("captured_at"),
                "list_price": list_price, "price": price, "discount_applied_pct": round(applied * 100, 1),
                "discount_note": ("verified" if disc_ok else
                                  "military discount: not found" if disc_pct == 0 else
                                  "military discount: not verified, not applied")}

        size, width = _parse_size(item), _parse_width(item)
        reason = None
        if not in_stock:
            reason = "out of stock"
        elif price > budget:
            reason = f"over budget (${price:.2f} > ${budget:.2f})"
        elif prefs.get("size") and size is not None and size != str(prefs["size"]):
            reason = f"wrong size ({size}, need {prefs['size']})"
        elif prefs.get("width") and width is not None and \
                width != WIDTH_WORDS.get(prefs["width"].lower(), prefs["width"].lower()):
            reason = f"wrong width ({width}, need {prefs['width']})"
        if reason:
            rejected.append({**base, "reason": reason})
            continue

        terms = {
            "price": WEIGHTS["price"] * max(0.0, 1 - price / budget),
            "discount": WEIGHTS["discount"] * applied,
            "fit": WEIGHTS["fit"] * preference_match(item, prefs),
            "stock": WEIGHTS["stock"] * 1.0,
        }
        terms = {k: round(v, 2) for k, v in terms.items()}
        total = round(sum(terms.values()), 2)
        ranked.append({**base, "score": total, "terms": terms,
                       "display": f"{total:.2f} (price {terms['price']:.2f}, discount {terms['discount']:.2f}, "
                                  f"fit {terms['fit']:.2f}, stock {terms['stock']:.2f})"})

    ranked.sort(key=lambda o: (-o["score"], o["price"]))
    for o in ranked:
        o["reason"] = _why(o)
    for o in ranked[top_n:]:
        rejected.append({**o, "reason": f"lower score ({o['score']:.2f}) than top {top_n}"})
    return {"weights": WEIGHTS, "budget": budget, "options": ranked[:top_n], "rejected": rejected}


def _why(o: Dict) -> str:
    bits = [f"${o['price']:.2f} at {o['store']}"]
    if o["discount_applied_pct"]:
        bits.append(f"{o['discount_applied_pct']:g}% verified military discount")
    else:
        bits.append(o["discount_note"])
    if o["terms"]["fit"] >= WEIGHTS["fit"]:
        bits.append("matches brand, size and width")
    return "; ".join(bits)



# ---------------------------------------------------------------------------
# GPC mode (Government Purchase Card / unit buyer)
#
# Hard rejects, in order: out of stock, over budget, Section 889 banned vendor,
# Berry Amendment (only when the caller says it applies: DFARS 225.7002-2(a)
# exempts buys of $200,000 or less, except recruit athletic footwear), then the
# mandatory-source gate (FAR Part 8: if any eligible option comes from a
# mandatory source such as AbilityOne, every non-mandatory option is rejected).
# Survivors: score = 0.60*(1 - price/budget) + 0.40*spec_match
# ---------------------------------------------------------------------------
GPC_WEIGHTS = {"price": 0.60, "spec": 0.40}

# Section 889 covered vendors (FAR 52.204-25) and common affiliates.
SECTION_889_VENDORS = ("huawei", "zte", "hytera", "hikvision", "dahua")


def _tags(r: Dict) -> List[str]:
    return [t.strip().lower() for t in re.split(r"[;,|]", r.get("spec_tags") or "") if t.strip()]


def spec_match(r: Dict, required: List[str]) -> float:
    """Share of required specs (e.g. "rugged", "cold-weather") found in spec_tags or the item name."""
    if not required:
        return 1.0
    tags, name = _tags(r), r["item"].lower()
    hits = [req for req in required if req.lower() in tags or req.lower() in name]
    return len(hits) / len(required)


def _is_889(r: Dict) -> Optional[str]:
    if _to_bool(r.get("vendor_banned_889", False)):
        return r["store"]
    text = f"{r['item']} {r['store']}".lower()
    return next((v for v in SECTION_889_VENDORS if re.search(rf"\b{v}\b", text)), None)


def score_gpc(rows: List[Dict], required_specs: List[str], budget: float,
              berry_applies: bool = False, top_n: int = 2) -> Dict:
    """rows: catalog dicts plus optional GPC columns: mandatory_source (name or blank),
    vendor_banned_889 (bool), berry_covered (bool: textile/food item), country_of_origin, spec_tags."""
    eligible, rejected = [], []
    for r in rows:
        price = float(r["price"])
        base = {"item": r["item"], "store": r["store"], "url": r.get("url"),
                "captured_at": r.get("captured_at"), "price": price,
                "mandatory_source": (r.get("mandatory_source") or "").strip() or None,
                "country_of_origin": r.get("country_of_origin") or None}
        banned = _is_889(r)
        reason = rule = None
        if not _to_bool(r.get("in_stock", True)):
            reason = "out of stock"
        elif price > budget:
            reason = f"over budget (${price:.2f} > ${budget:.2f})"
        elif banned:
            reason, rule = f"Section 889 covered vendor ({banned})", "FAR 52.204-25"
        elif berry_applies and _to_bool(r.get("berry_covered", False)) and \
                (r.get("country_of_origin") or "").strip().upper() not in ("US", "USA"):
            reason, rule = (f"Berry Amendment: covered item not US-made "
                            f"({r.get('country_of_origin') or 'origin unknown'})"), "DFARS 252.225-7012"
        elif required_specs and spec_match(r, required_specs) == 0:
            reason = "does not meet stated requirement (" + ", ".join(required_specs) + ")"
        if reason:
            rejected.append({**base, "reason": reason, "rule": rule})
        else:
            eligible.append((r, base))

    # Mandatory-source gate (FAR 8.002 priority). It only triggers when a mandatory
    # source fully meets the requirement; otherwise buyers may go to other sources.
    if any(b["mandatory_source"] and spec_match(r, required_specs) == 1 for r, b in eligible):
        keep = []
        for r, b in eligible:
            if b["mandatory_source"]:
                keep.append((r, b))
            else:
                rejected.append({**b, "rule": "FAR 8.002",
                                 "reason": "mandatory source available; non-mandatory vendor not allowed"})
        eligible = keep

    ranked = []
    for r, b in eligible:
        sm = spec_match(r, required_specs)
        terms = {"price": round(GPC_WEIGHTS["price"] * max(0.0, 1 - b["price"] / budget), 2),
                 "spec": round(GPC_WEIGHTS["spec"] * sm, 2)}
        total = round(sum(terms.values()), 2)
        missing = [q for q in required_specs if q.lower() not in _tags(r) and q.lower() not in r["item"].lower()]
        why = [f"${b['price']:.2f} at {b['store']}"]
        if b["mandatory_source"]:
            why.append(f"mandatory source ({b['mandatory_source']})")
        why.append("meets all specs" if not missing else "missing spec: " + ", ".join(missing))
        ranked.append({**b, "score": total, "terms": terms, "reason": "; ".join(why), "rule": None,
                       "display": f"{total:.2f} (price {terms['price']:.2f}, spec {terms['spec']:.2f})"})
    ranked.sort(key=lambda o: (-o["score"], o["price"]))
    for o in ranked[top_n:]:
        rejected.append({**o, "reason": f"lower score ({o['score']:.2f}) than top {top_n}"})
    return {"mode": "gpc", "weights": GPC_WEIGHTS, "budget": budget, "required_specs": required_specs,
            "berry_applies": berry_applies, "options": ranked[:top_n], "rejected": rejected}

if __name__ == "__main__":
    import json
    path = sys.argv[1] if len(sys.argv) > 1 else "convex/scoring/fixture_catalog.csv"
    with open(path) as f:
        rows = list(csv.DictReader(f))
    shoes = [r for r in rows if "lock" not in r["item"].lower()]
    out = score_options(shoes, {"brand": "Brooks", "size": "10.5", "width": "wide"}, budget=150,
                        verified_discount_stores={"Brooks Running", "Nike"})
    print(json.dumps(out, indent=2))

    gpc_path = os.path.join(os.path.dirname(__file__), "fixture_gpc.csv")
    with open(gpc_path) as f:
        g = score_gpc(list(csv.DictReader(f)), ["cold-weather"], budget=1500, berry_applies=True)
    print(json.dumps(g, indent=2))
