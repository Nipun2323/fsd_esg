"""
ESG calculations. This is `calculator.py` from the project outline.

Mirrors `frontend/src/lib/calculator.ts` exactly — same formulas, same
metric keys, same rounding — so a figure computed here matches what the
frontend shows when it runs on demo data.

Pure functions, no database access.
"""

from app.catalogue import CALCULATED_LABELS, DEFAULT_FACTORS, METRICS

Number = float | int | None


def _num(v) -> float | None:
    """A value counts only if it is a real number. None, '' and NaN do not."""
    if isinstance(v, bool) or v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v) if v == v else None  # NaN check
    return None


def _ratio(a: float | None, b: float | None) -> float | None:
    if a is None or b is None or b == 0:
        return None
    return (a / b) * 100


def _round(n: float) -> float:
    return round(n * 100) / 100


def _derive(values: dict, f: dict[str, float]) -> dict[str, float | None]:
    electricity = _num(values.get("electricity_kwh"))
    renewable = _num(values.get("renewable_kwh"))
    diesel = _num(values.get("diesel_litres"))
    petrol = _num(values.get("petrol_litres"))
    employees = _num(values.get("employees_total"))
    water = _num(values.get("water_kl"))

    # Scope 2 — purchased electricity, location-based method.
    scope2 = None if electricity is None else (electricity * f["grid_electricity_in"]) / 1000

    # Scope 1 — fuel burned on site or in owned vehicles.
    scope1 = (
        None
        if diesel is None and petrol is None
        else ((diesel or 0) * f["diesel"] + (petrol or 0) * f["petrol"]) / 1000
    )

    total_co2 = None if scope1 is None and scope2 is None else (scope1 or 0) + (scope2 or 0)
    total_energy = (
        None if electricity is None and renewable is None else (electricity or 0) + (renewable or 0)
    )
    training = _num(values.get("training_hours"))
    injuries = _num(values.get("ltifr"))
    hours = _num(values.get("hours_worked"))

    return {
        "scope1": scope1,
        "scope2": scope2,
        "totalCo2": total_co2,
        "totalEnergy": total_energy,
        "renewableShare": _ratio(renewable, total_energy),
        "intensityPerEmployee": (
            None
            if total_co2 is None or not employees
            else (total_co2 * 1000) / employees
        ),
        "waterIntensity": None if water is None or not employees else water / employees,
        "waterRecycledShare": _ratio(_num(values.get("water_recycled_kl")), water),
        "wasteDivertedShare": _ratio(
            _num(values.get("waste_recycled_t")), _num(values.get("waste_total_t"))
        ),
        "genderDiversity": _ratio(_num(values.get("employees_female")), employees),
        "trainingPerEmployee": None if training is None or not employees else training / employees,
        # Injuries per one million hours worked — the conventional LTIFR base.
        "ltifr": None if injuries is None or not hours else (injuries * 1_000_000) / hours,
        "boardIndependence": _ratio(
            _num(values.get("board_independent")), _num(values.get("board_size"))
        ),
        "boardDiversity": _ratio(_num(values.get("board_female")), _num(values.get("board_size"))),
    }


_ROWS: list[tuple[str, str, str, str, bool | None, str | None]] = [
    ("totalCo2", "Total GHG emissions", "E", "tCO₂e", True, "Scope 1 + Scope 2 (location-based)"),
    ("scope1", "Scope 1 emissions", "E", "tCO₂e", True, "Diesel and petrol combusted"),
    ("scope2", "Scope 2 emissions", "E", "tCO₂e", True, "Grid electricity × CEA factor"),
    ("intensityPerEmployee", "Emissions intensity", "E", "kgCO₂e/employee", True, None),
    ("totalEnergy", "Total energy consumed", "E", "kWh", True, None),
    ("renewableShare", "Renewable energy share", "E", "%", False, None),
    ("waterIntensity", "Water intensity", "E", "kL/employee", True, None),
    ("waterRecycledShare", "Water recycled", "E", "%", False, None),
    ("wasteDivertedShare", "Waste diverted from disposal", "E", "%", False, None),
    ("genderDiversity", "Gender diversity", "S", "%", False, None),
    ("trainingPerEmployee", "Training per employee", "S", "hours", False, None),
    ("ltifr", "LTIFR", "S", "per 1M hours", True, "Lost-time injuries per million hours worked"),
    ("boardIndependence", "Board independence", "G", "%", False, None),
    ("boardDiversity", "Board gender diversity", "G", "%", False, None),
]


def calculate(
    values: dict, previous: dict | None = None, factors: dict | None = None
) -> list[dict]:
    """Derived metrics for one year, with the prior year attached where known."""
    f = {**DEFAULT_FACTORS, **(factors or {})}
    cur = _derive(values or {}, f)
    prev = _derive(previous, f) if previous else None

    out = []
    for key, label, pillar, unit, lower_is_better, basis in _ROWS:
        if cur[key] is None:
            continue
        row = {
            "key": key,
            "label": label,
            "pillar": pillar,
            "value": _round(cur[key]),
            "unit": unit,
            "lowerIsBetter": lower_is_better,
        }
        if prev and prev[key] is not None:
            row["previous"] = _round(prev[key])
        if basis:
            row["basis"] = basis
        out.append(row)
    return out


def _clamp01(n: float) -> float:
    return max(0.0, min(1.0, n))


def _pct(n: float | None, target: float = 100) -> float:
    return 0.0 if n is None else _clamp01(n / target)


def _avg(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else 0.0


def score_pillars(values: dict, previous: dict | None = None) -> list[dict]:
    """
    A COMPLETENESS-AND-PERFORMANCE heuristic of our own.

    Not a rating from any agency, and not something BRSR or CSRD defines.
    Labelled as such everywhere it is shown.
    """

    def score(src: dict) -> dict[str, int]:
        calc = {c["key"]: c["value"] for c in calculate(src)}
        out = {}
        for pillar in ("E", "S", "G"):
            defs = [m for m in METRICS if m["pillar"] == pillar]
            answered = sum(1 for m in defs if _num((src or {}).get(m["key"])) is not None)
            completeness = answered / len(defs) if defs else 0.0

            if pillar == "E":
                performance = _avg([
                    _pct(calc.get("renewableShare")),
                    _pct(calc.get("wasteDivertedShare")),
                    _pct(calc.get("waterRecycledShare")),
                ])
            elif pillar == "S":
                performance = _avg([
                    _pct(calc.get("genderDiversity"), 50),
                    _clamp01((calc.get("trainingPerEmployee") or 0) / 24),
                    0.5 if calc.get("ltifr") is None else _clamp01(1 - calc["ltifr"] / 10),
                ])
            else:
                policies = [
                    (src or {}).get(k)
                    for k in (
                        "anti_corruption_policy",
                        "whistleblower_policy",
                        "grievance_mechanism",
                        "board_esg_oversight",
                    )
                ]
                held = sum(1 for p in policies if p == 1)
                performance = _avg([
                    held / len(policies),
                    _pct(calc.get("boardIndependence"), 50),
                    _pct(calc.get("boardDiversity"), 33),
                ])

            out[pillar] = round((completeness * 0.4 + performance * 0.6) * 100)
        return out

    cur = score(values)
    prev = score(previous) if previous else None
    rows = []
    for p in ("E", "S", "G"):
        row = {
            "pillar": p,
            "label": {"E": "Environmental", "S": "Social", "G": "Governance"}[p],
            "value": cur[p],
        }
        if prev:
            row["previous"] = prev[p]
        rows.append(row)
    return rows


def overall_score(scores: list[dict]) -> int:
    return round(sum(s["value"] for s in scores) / len(scores)) if scores else 0


_HIGH_PRIORITY = {
    "electricity_kwh",
    "employees_total",
    "water_kl",
    "waste_total_t",
    "board_size",
    "anti_corruption_policy",
}


def find_gaps(values: dict) -> list[dict]:
    """Deterministic gap detection — it cannot hallucinate a missing field."""
    gaps = []
    for m in METRICS:
        if _num((values or {}).get(m["key"])) is not None:
            continue
        if m["key"] in _HIGH_PRIORITY:
            severity = "high"
        elif any(d.endswith("-E") or d == "ESRS 2" for d in m["mapsTo"]):
            severity = "medium"
        else:
            severity = "low"
        gaps.append({
            "metricKey": m["key"],
            "label": m["label"],
            "pillar": m["pillar"],
            "severity": severity,
            "blocks": m["mapsTo"],
            "message": f"{m['label']} has not been entered. It feeds {', '.join(m['mapsTo'])}.",
        })
    return gaps


def format_value(value: float, unit: str) -> str:
    if unit == "%":
        return f"{value:.1f}%"
    if abs(value) >= 1_000_000:
        return f"{value / 1_000_000:.2f}M"
    if abs(value) >= 10_000:
        return f"{value:,.0f}"
    return f"{value:,.2f}".rstrip("0").rstrip(".")


def metric_label(key: str) -> str:
    from app.catalogue import METRICS_BY_KEY

    if key in METRICS_BY_KEY:
        return METRICS_BY_KEY[key]["label"]
    return CALCULATED_LABELS.get(key, key)
