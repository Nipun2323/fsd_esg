"""
Maps entered metrics onto the disclosure structure of BRSR and CSRD.

Mirrors `frontend/src/lib/compliance.ts`. The percentage it reports is
deliberately narrow: coverage of the mandatory disclosures that have a
numeric metric behind them, with the denominator carried alongside it.
Disclosures with no mapped metric are counted and surfaced rather than
filtered out — silently excluding them is how a half-finished report
shows 100%.
"""

from app.catalogue import ESRS_STANDARDS, METRICS, NGRBC_PRINCIPLES


def _answered(values: dict, key: str) -> bool:
    v = (values or {}).get(key)
    return isinstance(v, (int, float)) and not isinstance(v, bool) and v == v


def _status(requires: list[str], missing: list[str]) -> str:
    if not requires:
        return "narrative"
    if not missing:
        return "complete"
    if len(missing) == len(requires):
        return "missing"
    return "partial"


def _brsr_blocks() -> list[dict]:
    blocks = [
        {
            "id": "BRSR-A",
            "code": "Section A",
            "title": "General disclosures",
            "group": "Section A",
            "mandatory": True,
            "note": "Entity details, products and services, operations, employees, "
            "holding and subsidiary structure, CSR details.",
        },
        {
            "id": "BRSR-B",
            "code": "Section B",
            "title": "Management and process disclosures",
            "group": "Section B",
            "mandatory": True,
            "note": "Policy and management processes covering each of the nine NGRBC "
            "principles, plus governance and oversight.",
        },
    ]
    for p in NGRBC_PRINCIPLES:
        blocks.append({
            "id": f"BRSR-{p['code']}-E",
            "code": f"{p['code']} · Essential",
            "title": p["short"],
            "group": "Section C",
            "mandatory": True,
            "note": p["statement"],
            "pillar": p["pillar"],
        })
        blocks.append({
            "id": f"BRSR-{p['code']}-L",
            "code": f"{p['code']} · Leadership",
            "title": f"{p['short']} — leadership indicators",
            "group": "Section C",
            "mandatory": False,
            "note": "Voluntary indicators for entities choosing to go beyond the "
            "essential tier.",
            "pillar": p["pillar"],
        })
    return blocks


def evaluate(values: dict, framework: str) -> list[dict]:
    out = []
    if framework == "BRSR":
        for b in _brsr_blocks():
            requires = [m["key"] for m in METRICS if b["id"] in m["mapsTo"]]
            missing = [k for k in requires if not _answered(values, k)]
            out.append({
                "id": b["id"],
                "code": b["code"],
                "title": b["title"],
                "framework": "BRSR",
                "group": b["group"],
                "pillar": b.get("pillar"),
                "status": _status(requires, missing),
                "requires": requires,
                "missing": missing,
                "mandatory": b["mandatory"],
                "note": b["note"],
            })
        return out

    for std in ESRS_STANDARDS:
        requires = [m["key"] for m in METRICS if std["code"] in m["mapsTo"]]
        missing = [k for k in requires if not _answered(values, k)]
        out.append({
            "id": std["code"],
            "code": std["code"],
            "title": std["title"],
            "framework": "CSRD",
            "group": std["group"],
            "pillar": std["pillar"],
            "status": _status(requires, missing),
            "requires": requires,
            "missing": missing,
            "mandatory": std["alwaysApplies"],
            "note": (
                "Applies regardless of the materiality assessment."
                if std["alwaysApplies"]
                else "Applies only if your double-materiality assessment finds this "
                "topic material."
            ),
        })
    return out


def summarise(disclosures: list[dict], framework: str) -> dict:
    tracked = [d for d in disclosures if d["status"] != "narrative"]
    mandatory_all = [d for d in disclosures if d["mandatory"]]
    mandatory_tracked = [d for d in mandatory_all if d["status"] != "narrative"]

    earned = sum(
        (len(d["requires"]) - len(d["missing"])) / len(d["requires"]) for d in mandatory_tracked
    )

    return {
        "framework": framework,
        "complete": sum(1 for d in tracked if d["status"] == "complete"),
        "partial": sum(1 for d in tracked if d["status"] == "partial"),
        "missing": sum(1 for d in tracked if d["status"] == "missing"),
        "narrative": sum(1 for d in disclosures if d["status"] == "narrative"),
        "tracked": len(tracked),
        "total": len(disclosures),
        "mandatoryTracked": len(mandatory_tracked),
        "mandatoryTotal": len(mandatory_all),
        "coverage": round(earned / len(mandatory_tracked) * 100) if mandatory_tracked else 0,
    }
