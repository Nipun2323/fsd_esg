"""
Deterministic stand-ins used when no Gemini key is configured.

These are templates over the company's real figures — they cannot
invent a number. Every response that comes from here is flagged
`used_ai: false` so the UI can say so rather than passing it off as a
model answer.
"""

from app.catalogue import METRICS_BY_KEY
from app.services import compliance
from app.services.calculator import (
    calculate,
    find_gaps,
    format_value,
    overall_score,
    score_pillars,
)


def _pct_change(cur: float, prev: float | None) -> str | None:
    if prev is None or prev == 0:
        return None
    d = ((cur - prev) / prev) * 100
    if abs(d) < 0.5:
        return "unchanged year on year"
    return f"{'up' if d > 0 else 'down'} {abs(d):.1f}% year on year"


def compose(
    section: str, company: dict, values: dict, previous: dict | None, framework: str
) -> dict:
    calc = calculate(values, previous)
    by = {c["key"]: c for c in calc}
    grounded: list[str] = []

    def say(key: str) -> str | None:
        m = by.get(key)
        if not m:
            return None
        grounded.append(key)
        amount = (
            format_value(m["value"], m["unit"])
            if m["unit"] == "%"
            else f"{format_value(m['value'], m['unit'])} {m['unit']}"
        )
        change = _pct_change(m["value"], m.get("previous"))
        return f"{amount}{f' ({change})' if change else ''}"

    standard = "SEBI's BRSR format" if framework == "BRSR" else "the ESRS under CSRD"
    name = company.get("name", "The company")
    lines: list[str] = []

    if section == "executive_summary":
        sector = company.get("sector")
        emp = company.get("employees")
        lines.append(
            f"{name} is a "
            + (f"{sector.lower()} business " if sector else "business ")
            + (f"employing {emp:,} people. " if emp else "")
            + f"This report covers FY {company.get('year')} and is structured against {standard}."
        )
        if (v := say("totalCo2")):
            lines.append(
                f"Total greenhouse gas emissions for the year were {v}, combining Scope 1 "
                "fuel combustion with Scope 2 purchased electricity."
            )
        if (v := say("renewableShare")):
            lines.append(f"Renewable sources supplied {v} of electricity consumed.")
        if (v := say("genderDiversity")):
            lines.append(f"Women made up {v} of the workforce.")
        scores = score_pillars(values, previous)
        lines.append(
            "Internal readiness scores stand at "
            + ", ".join(f"{s['label']} {s['value']}" for s in scores)
            + f", an overall {overall_score(scores)} out of 100. These are this platform's "
            "own completeness-and-performance indicators, not a third-party ESG rating."
        )
        high = [g for g in find_gaps(values) if g["severity"] == "high"]
        if high:
            lines.append(
                f"{len(high)} high-priority data points remain unreported and are flagged "
                "in the compliance view."
            )

    elif section == "environmental":
        s1, s2 = say("scope1"), say("scope2")
        if s1 or s2:
            lines.append(
                f"Scope 1 emissions were {s1 or 'not reported'} and Scope 2 "
                f"{s2 or 'not reported'}. Scope 2 is calculated on a location-based method "
                "using the CEA grid factor for India; the factor and its vintage are "
                "recorded in Settings so the figure can be reproduced."
            )
        en, ren = say("totalEnergy"), say("renewableShare")
        if en:
            lines.append(
                f"Total energy consumed was {en}"
                + (f", of which {ren} came from renewable sources" if ren else "")
                + "."
            )
        w, wr = say("waterIntensity"), say("waterRecycledShare")
        if w:
            lines.append(
                f"Water intensity was {w}"
                + (f", with {wr} of withdrawal recycled or reused" if wr else "")
                + "."
            )
        if (wd := say("wasteDivertedShare")):
            lines.append(f"{wd} of waste generated was diverted from disposal.")
        lines.append(
            "These figures support Principle 6 essential indicators in Section C of the BRSR."
            if framework == "BRSR"
            else "These figures support ESRS E1, E3 and E5, subject to those topics being "
            "material under your double-materiality assessment."
        )

    elif section == "social":
        if (d := say("genderDiversity")):
            lines.append(f"Women represented {d} of total headcount.")
        if (t := say("trainingPerEmployee")):
            lines.append(f"The business delivered {t} of training per employee across the year.")
        if (l := say("ltifr")):
            lines.append(
                f"The lost-time injury frequency rate was {l}, expressed per one million "
                "hours worked."
            )
        if isinstance(values.get("attrition_pct"), (int, float)):
            grounded.append("attrition_pct")
            lines.append(f"Voluntary attrition stood at {values['attrition_pct']}%.")
        lines.append(
            "These disclosures map to Principles 3, 5 and 8 of the NGRBC as reflected in "
            "Section C."
            if framework == "BRSR"
            else "These disclosures map to ESRS S1 own workforce, with value-chain workers "
            "covered under S2 where material."
        )

    elif section == "governance":
        bi, bd = say("boardIndependence"), say("boardDiversity")
        if bi:
            lines.append(
                f"Independent directors made up {bi} of the board"
                + (f", and women {bd}" if bd else "")
                + "."
            )
        held, absent = [], []
        for k in (
            "anti_corruption_policy",
            "whistleblower_policy",
            "grievance_mechanism",
            "board_esg_oversight",
        ):
            label = METRICS_BY_KEY[k]["label"]
            if values.get(k) == 1:
                held.append(label)
                grounded.append(k)
            elif values.get(k) == 0:
                absent.append(label)
                grounded.append(k)
        if held:
            lines.append(f"The following are in force: {', '.join(held)}.")
        if absent:
            lines.append(
                f"Not yet in place: {', '.join(absent)}. Each is a named expectation under "
                "both frameworks and should be prioritised."
            )
        if isinstance(values.get("corruption_cases"), (int, float)):
            grounded.append("corruption_cases")
            lines.append(
                f"{int(values['corruption_cases'])} confirmed corruption incidents were "
                "recorded during the period."
            )
        lines.append(
            "Governance content sits in Section B management and process disclosures and "
            "under Principle 1 in Section C."
            if framework == "BRSR"
            else "Governance content sits in ESRS 2 general disclosures and ESRS G1 "
            "business conduct."
        )

    else:  # recommendations
        recs: list[str] = []
        high = [g for g in find_gaps(values) if g["severity"] == "high"]
        if high:
            recs.append(
                f"Close the {len(high)} high-priority data gaps first — "
                + ", ".join(g["label"].lower() for g in high[:3])
                + ". Without them the mandatory disclosures cannot be completed."
            )
        if (r := by.get("renewableShare")) and r["value"] < 30:
            grounded.append("renewableShare")
            recs.append(
                f"Renewable share is {r['value']:.1f}%. A rooftop solar or open-access power "
                "purchase agreement is the usual next step at this scale and moves Scope 2 "
                "directly."
            )
        if (w := by.get("wasteDivertedShare")) and w["value"] < 60:
            grounded.append("wasteDivertedShare")
            recs.append(
                f"Waste diversion is {w['value']:.1f}%. Segregation at source is the cheapest "
                "lever before any processing investment."
            )
        if (l := by.get("ltifr")) and l["value"] > 2:
            grounded.append("ltifr")
            recs.append(
                f"An LTIFR of {l['value']:.2f} is high enough to warrant a documented "
                "root-cause review of each incident."
            )
        if values.get("whistleblower_policy") == 0:
            recs.append(
                "Adopt a whistleblower mechanism. It is low cost, and both frameworks ask "
                "about it directly."
            )
        if not recs:
            recs.append(
                "No material gaps were detected in the reported set. Focus the coming year "
                "on assurance readiness and value-chain data."
            )
        return {
            "body": "\n\n".join(f"{i}. {r}" for i, r in enumerate(recs, 1)),
            "groundedIn": sorted(set(grounded)),
        }

    return {"body": "\n\n".join(lines), "groundedIn": sorted(set(grounded))}


def answer(question: str, company: dict, values: dict, previous: dict | None) -> dict:
    """Keyword-routed response over the company's real figures."""
    calc = calculate(values, previous)
    by = {c["key"]: c for c in calc}
    q = question.lower()
    citations: list[str] = []
    year = company.get("year")
    name = company.get("name", "this company")

    def hit(*kw: str) -> bool:
        return any(k in q for k in kw)

    if hit("gap", "missing", "incomplete", "what do i still"):
        gaps = find_gaps(values)
        high = [g for g in gaps if g["severity"] == "high"]
        citations = [g["metricKey"] for g in gaps[:6]]
        if not gaps:
            body = f"Nothing is missing for FY {year} — every metric in the catalogue has a value."
        else:
            listed = "\n".join(
                f"• **{g['label']}** ({g['severity']}) — feeds {', '.join(g['blocks'])}"
                for g in gaps[:6]
            )
            more = f"\n\n…and {len(gaps) - 6} more. The Compliance page lists all of them." if len(gaps) > 6 else ""
            body = (
                f"{len(gaps)} metrics are unreported for FY {year}, {len(high)} of them "
                f"high priority.\n\n{listed}{more}"
            )

    elif hit("brsr", "sebi", "ngrbc", "principle"):
        s = compliance.summarise(compliance.evaluate(values, "BRSR"), "BRSR")
        body = (
            f"For BRSR you have **{s['coverage']}% metric coverage** across the "
            f"{s['mandatoryTracked']} mandatory disclosures this platform tracks numerically: "
            f"{s['complete']} complete, {s['partial']} partial, {s['missing']} not started.\n\n"
            f"Read that carefully — BRSR has {s['mandatoryTotal']} mandatory disclosures in "
            f"total, so {s['mandatoryTotal'] - s['mandatoryTracked']} have no numeric metric "
            "behind them and still need writing up.\n\nBRSR has three sections: A general "
            "disclosures, B management and process, C principle-wise performance against the "
            "nine NGRBC principles."
        )

    elif hit("csrd", "esrs", "europe"):
        s = compliance.summarise(compliance.evaluate(values, "CSRD"), "CSRD")
        body = (
            f"For CSRD you have **{s['coverage']}% metric coverage** across the ESRS "
            f"datapoints tracked here, and {s['narrative']} standards have no numeric metric "
            "mapped at all.\n\nThe first set of ESRS is 12 standards: ESRS 1 and 2 are "
            "cross-cutting, then E1–E5, S1–S4 and G1. Only ESRS 2 applies unconditionally — "
            "which topical standards apply is decided by your own double-materiality "
            "assessment, which this platform does not perform."
        )

    elif hit("emission", "co2", "carbon", "scope", "ghg"):
        t = by.get("totalCo2")
        if t:
            citations = ["totalCo2", "scope1", "scope2"]
            s1, s2 = by.get("scope1"), by.get("scope2")
            ch = _pct_change(t["value"], t.get("previous"))
            body = (
                f"Total emissions for FY {year} were **{format_value(t['value'], t['unit'])} "
                f"tCO₂e**{f' — {ch}' if ch else ''}.\n\n"
                f"• Scope 1 (diesel + petrol): {format_value(s1['value'], s1['unit']) if s1 else '—'} tCO₂e\n"
                f"• Scope 2 (grid electricity): {format_value(s2['value'], s2['unit']) if s2 else '—'} tCO₂e\n\n"
                "Scope 2 uses the location-based method with the CEA grid factor of "
                "0.727 kg CO₂e/kWh (FY 2023-24). Scope 3 is not calculated here."
            )
        else:
            body = (
                f"I can't compute emissions for FY {year} — electricity and fuel figures "
                "haven't been entered or extracted from an uploaded report yet."
            )

    elif hit("water"):
        w, r = by.get("waterIntensity"), by.get("waterRecycledShare")
        citations = [k for k in ("waterIntensity", "waterRecycledShare") if k in by]
        body = (
            f"Water intensity is **{format_value(w['value'], w['unit'])} kL per employee**"
            + (f", with {r['value']:.1f}% of withdrawal recycled or reused" if r else "")
            + ". This feeds BRSR Principle 6 and ESRS E3."
            if w
            else f"No water data has been entered for FY {year}."
        )

    elif hit("waste", "circular"):
        wd = by.get("wasteDivertedShare")
        citations = ["wasteDivertedShare"] if wd else []
        body = (
            f"**{wd['value']:.1f}%** of waste was diverted from disposal in FY {year}. "
            "This supports BRSR Principle 6 and ESRS E5 resource use and circular economy."
            if wd
            else f"No waste data has been entered for FY {year}."
        )

    elif hit("diversity", "women", "gender"):
        d, b = by.get("genderDiversity"), by.get("boardDiversity")
        citations = [k for k in ("genderDiversity", "boardDiversity") if k in by]
        body = (
            f"Women are **{d['value']:.1f}%** of the workforce"
            + (f" and {b['value']:.1f}% of the board" if b else "")
            + f" in FY {year}. Gender diversity is one of the nine BRSR Core attributes "
            "and sits under ESRS S1."
            if d
            else f"Headcount breakdown hasn't been entered for FY {year}."
        )

    elif hit("safety", "injur", "ltifr", "accident"):
        l = by.get("ltifr")
        citations = ["ltifr"] if l else []
        body = (
            f"LTIFR for FY {year} is **{l['value']:.2f}** per million hours worked"
            + (f" (previously {l['previous']:.2f})" if l.get("previous") is not None else "")
            + ". Employee wellbeing and safety is a BRSR Core attribute and an ESRS S1 disclosure."
            if l
            else "Injury and hours-worked figures are needed before I can give you a rate."
        )

    elif hit("score", "performance", "overall", "how are we doing"):
        sc = score_pillars(values, previous)
        body = (
            f"Internal readiness for FY {year}: **{overall_score(sc)}/100** overall.\n\n"
            + "\n".join(
                f"• {s['label']}: {s['value']}"
                + (f" (was {s['previous']})" if s.get("previous") is not None else "")
                for s in sc
            )
            + "\n\nThis blends how complete your data is with how the numbers compare against "
            "internal targets. It is not a rating from any agency and no regulator recognises it."
        )

    elif hit("help", "what can you"):
        body = (
            "I answer from this company's own saved numbers — I don't invent figures. Try:\n\n"
            '• "What\'s our carbon footprint?"\n'
            '• "What data are we missing?"\n'
            '• "How ready are we for BRSR?"\n'
            '• "Explain the CSRD requirements"'
        )

    else:
        body = (
            f"I work from {name}'s FY {year} data, so I can answer on emissions, energy, "
            "water, waste, diversity, safety, governance, and readiness against BRSR or "
            "CSRD.\n\nI don't have anything on that specific question. Ask "
            '"what can you help with?" for the list.'
        )

    return {"content": body, "citations": sorted(set(citations))}
