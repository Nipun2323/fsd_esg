"""
All model calls live here. This is `ai_service.py` from the outline.

Three jobs:
  1. extract_metrics  — pull ESG figures out of an uploaded report
  2. generate_section — write one section of a BRSR/CSRD report
  3. chat             — answer a question about a company's own data

Every one degrades to a deterministic fallback when no API key is set,
and says so via the `used_ai` flag it returns. Nothing invents a figure:
the prompts pass the real numbers and forbid inventing others, and the
fallbacks are templates over the same numbers.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.catalogue import METRICS, METRICS_BY_KEY
from app.config import settings
from app.services import compliance
from app.services.calculator import (
    calculate,
    find_gaps,
    format_value,
    overall_score,
    score_pillars,
)

log = logging.getLogger(__name__)

_client = None


def _get_client():
    """Lazily build the Gemini client. Returns None when no key is configured."""
    global _client
    if not settings.ai_enabled:
        return None
    if _client is None:
        from google import genai

        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


def ai_status() -> dict:
    return {
        "enabled": settings.ai_enabled,
        "model": settings.gemini_model if settings.ai_enabled else None,
        "provider": "google-gemini",
        "note": (
            "Live model responses."
            if settings.ai_enabled
            else "No GEMINI_API_KEY set — responses are deterministic templates "
            "built from your saved figures. Get a free key at "
            "https://aistudio.google.com/app/apikey"
        ),
    }


def _generate(prompt: str, *, system: str | None = None, json_mode: bool = False) -> str | None:
    """One call to Gemini. Returns None on any failure, so callers fall back."""
    client = _get_client()
    if client is None:
        return None
    try:
        from google.genai import types

        cfg = types.GenerateContentConfig(
            system_instruction=system,
            temperature=0.2,
            response_mime_type="application/json" if json_mode else "text/plain",
        )
        resp = client.models.generate_content(
            model=settings.gemini_model, contents=prompt, config=cfg
        )
        return (resp.text or "").strip() or None
    except Exception as exc:  # noqa: BLE001 — any failure must fall back, not 500
        log.warning("Gemini call failed, falling back to template: %s", exc)
        return None


# ---------------------------------------------------------------------
# 1. Metric extraction from an uploaded report
# ---------------------------------------------------------------------

_EXTRACT_SYSTEM = """You extract ESG figures from a company's own report.

Rules you must not break:
- Report ONLY values that appear in the document. Never estimate, infer
  or carry over a figure from general knowledge.
- If a metric is absent, omit its key entirely. Never write 0 for a
  figure that was not reported — an unmeasured value and a measured zero
  are different claims.
- Units matter. Convert to the unit named for each key. If a document
  gives a figure in a unit you cannot convert with certainty, omit it.
- Return strictly valid JSON, no commentary."""


def _metric_spec() -> str:
    lines = []
    for m in METRICS:
        kind = "1 for yes, 0 for no" if m["kind"] == "boolean" else m["unit"]
        lines.append(f'  "{m["key"]}": {kind}  // {m["label"]}')
    return "\n".join(lines)


def extract_metrics(document_text: str, company_name: str, year: int | None) -> dict:
    """
    Returns {values, note, used_ai}. `values` holds only metrics actually
    found; absent metrics are omitted rather than zeroed.
    """
    text = document_text.strip()
    if not text:
        return {"values": {}, "note": "The document contained no readable text.", "used_ai": False}

    # Cap the prompt — reports can run to hundreds of pages.
    excerpt = text[:120_000]

    prompt = f"""Extract ESG figures for {company_name}{f" for financial year {year}" if year else ""}.

Return JSON of this exact shape:
{{
  "values": {{ "<metric_key>": <number>, ... }},
  "note": "<one sentence on coverage and anything ambiguous>"
}}

Allowed metric keys and their required units:
{_metric_spec()}

Document:
---
{excerpt}
---"""

    raw = _generate(prompt, system=_EXTRACT_SYSTEM, json_mode=True)
    if raw:
        parsed = _parse_extraction(raw)
        if parsed is not None:
            return {**parsed, "used_ai": True}

    fallback = _regex_extract(text)
    return {
        "values": fallback,
        "note": (
            f"Pattern matching found {len(fallback)} metric(s). "
            "This is the no-API-key fallback and is far less capable than the model — "
            "set GEMINI_API_KEY for proper extraction, and review every figure."
        ),
        "used_ai": False,
    }


def _parse_extraction(raw: str) -> dict | None:
    try:
        blob = json.loads(_strip_fences(raw))
    except json.JSONDecodeError:
        return None
    if not isinstance(blob, dict):
        return None

    values: dict[str, float] = {}
    for key, val in (blob.get("values") or {}).items():
        if key not in METRICS_BY_KEY:
            continue
        try:
            num = float(val)
        except (TypeError, ValueError):
            continue
        if num != num:  # NaN
            continue
        if METRICS_BY_KEY[key]["kind"] == "boolean":
            num = 1.0 if num >= 0.5 else 0.0
        values[key] = num

    note = blob.get("note")
    return {
        "values": values,
        "note": str(note)[:600] if note else f"Extracted {len(values)} metric(s).",
    }


def _strip_fences(s: str) -> str:
    s = s.strip()
    if s.startswith("```"):
        s = re.sub(r"^```[a-zA-Z]*\s*", "", s)
        s = re.sub(r"\s*```$", "", s)
    return s.strip()


# Last-resort extraction when no model is available. Deliberately narrow:
# it only matches a label followed by a number, and it is labelled as
# low-confidence everywhere it surfaces.
_PATTERNS: list[tuple[str, str]] = [
    ("renewable_kwh", r"renewable[^.\n]{0,70}?([\d,]+(?:\.\d+)?)\s*(?:kwh|mwh)"),
    ("electricity_kwh", r"(?:grid )?electricity[^.\n]{0,70}?([\d,]+(?:\.\d+)?)\s*(?:kwh|mwh)"),
    ("diesel_litres", r"diesel[^.\n]{0,70}?([\d,]+(?:\.\d+)?)\s*(?:l\b|litre|liter)"),
    ("petrol_litres", r"petrol[^.\n]{0,70}?([\d,]+(?:\.\d+)?)\s*(?:l\b|litre|liter)"),
    ("water_recycled_kl", r"water\s+(?:recycled|reused)[^.\n]{0,70}?([\d,]+(?:\.\d+)?)\s*(?:kl|kilolit|m3|m³)"),
    ("water_kl", r"water\s+withdraw[^.\n]{0,70}?([\d,]+(?:\.\d+)?)\s*(?:kl|kilolit|m3|m³)"),
    ("hazardous_waste_t", r"hazardous\s+waste[^.\n]{0,70}?([\d,]+(?:\.\d+)?)\s*(?:t\b|tonne|ton)"),
    ("waste_recycled_t", r"waste\s+diverted[^.\n]{0,70}?([\d,]+(?:\.\d+)?)\s*(?:t\b|tonne|ton)"),
    ("waste_total_t", r"total\s+waste[^.\n]{0,70}?([\d,]+(?:\.\d+)?)\s*(?:t\b|tonne|ton)"),
    ("employees_female", r"female\s+employees[^.\n]{0,40}?([\d,]+)"),
    ("employees_total", r"total\s+employees[^.\n]{0,40}?([\d,]+)"),
    ("hours_worked", r"total\s+hours\s+worked[^.\n]{0,40}?([\d,]+)"),
    ("training_hours", r"training\s+hours[^.\n]{0,70}?([\d,]+(?:\.\d+)?)"),
    ("ltifr", r"lost[- ]time\s+injur\w*[^.\n]{0,40}?([\d,]+)"),
    ("attrition_pct", r"attrition[^.\n]{0,40}?([\d,]+(?:\.\d+)?)\s*(?:%|per cent|percent)"),
    ("board_independent", r"([\d,]+)\s+are\s+independent\s+directors"),
    ("board_female", r"([\d,]+)\s+are\s+women"),
    ("board_size", r"board\s+compris\w*[^.\n]{0,20}?([\d,]+)\s*(?:members|directors)"),
    ("corruption_cases", r"(?:were\s+)?(no|[\d,]+)\s+confirmed\s+corruption"),
]

# Yes/no governance statements the fallback can recognise.
_BOOL_PATTERNS: list[tuple[str, str]] = [
    ("anti_corruption_policy", r"anti[- ]corruption\s+policy\s+is\s+in\s+force"),
    ("whistleblower_policy", r"whistleblower\s+mechanism\s+is\s+in\s+place"),
    ("grievance_mechanism", r"grievance\s+mechanism\s+(?:is\s+in\s+place|operates)"),
    ("board_esg_oversight", r"board[- ]level\s+esg\s+oversight"),
]


def _regex_extract(text: str) -> dict[str, float]:
    low = text.lower()
    out: dict[str, float] = {}
    for key, pattern in _PATTERNS:
        m = re.search(pattern, low, re.IGNORECASE)
        if not m:
            continue
        raw = m.group(1).replace(",", "")
        if raw == "no":          # "no confirmed corruption incidents"
            out[key] = 0.0
            continue
        try:
            out[key] = float(raw)
        except ValueError:
            continue
    for key, pattern in _BOOL_PATTERNS:
        if re.search(pattern, low, re.IGNORECASE):
            out[key] = 1.0
    return out


# ---------------------------------------------------------------------
# 2. Report narrative
# ---------------------------------------------------------------------

SECTION_TITLES = {
    "executive_summary": "Executive summary",
    "environmental": "Environmental performance",
    "social": "Social performance",
    "governance": "Governance",
    "recommendations": "Priorities for the coming year",
}

_REPORT_SYSTEM = """You write ESG report sections for a small or medium business.

Rules you must not break:
- Use ONLY the figures supplied. Never invent, estimate or round a
  number into a different one.
- If a figure is not supplied, do not mention it, and never imply the
  company reported it.
- Plain professional prose. No marketing language, no claims about
  performance the numbers do not support.
- 140 words maximum. No headings, no bullet symbols other than plain
  hyphens, no markdown emphasis."""


def generate_section(
    section: str,
    company: dict,
    values: dict,
    previous: dict | None,
    framework: str,
) -> dict:
    """Returns {body, groundedIn, used_ai}."""
    calc = calculate(values, previous)
    by_key = {c["key"]: c for c in calc}
    grounded = sorted(by_key)

    facts = _fact_sheet(company, calc, values, framework)
    standard = "SEBI's BRSR format" if framework == "BRSR" else "the ESRS under CSRD"

    guidance = {
        "executive_summary": "Summarise the year: who the company is, the headline "
        "environmental and social figures, and what changed.",
        "environmental": "Cover emissions, energy, water and waste. State the "
        "calculation basis for Scope 2.",
        "social": "Cover workforce composition, training and safety.",
        "governance": "Cover board composition and which policies are and are not "
        "in force.",
        "recommendations": "Give numbered, specific actions justified by the figures. "
        "No generic advice.",
    }[section]

    prompt = f"""Write the "{SECTION_TITLES[section]}" section of an ESG report
structured against {standard}.

{guidance}

Figures available (use only these):
{facts}"""

    body = _generate(prompt, system=_REPORT_SYSTEM)
    if body:
        return {"body": body.strip(), "groundedIn": grounded, "used_ai": True}

    from app.services.fallback_narrative import compose

    return {
        **compose(section, company, values, previous, framework),
        "used_ai": False,
    }


def _fact_sheet(company: dict, calc: list[dict], values: dict, framework: str) -> str:
    lines = [
        f"Company: {company.get('name')}",
        f"Sector: {company.get('sector') or 'not recorded'}",
        f"Employees: {company.get('employees') or 'not recorded'}",
        f"Framework: {framework}",
    ]
    for c in calc:
        prev = f" (prior year {c['previous']})" if "previous" in c else ""
        lines.append(f"- {c['label']}: {format_value(c['value'], c['unit'])} {c['unit']}{prev}")

    for key in (
        "anti_corruption_policy",
        "whistleblower_policy",
        "grievance_mechanism",
        "board_esg_oversight",
    ):
        if key in (values or {}):
            label = METRICS_BY_KEY[key]["label"]
            lines.append(f"- {label}: {'yes' if values[key] == 1 else 'no'}")

    gaps = find_gaps(values)
    if gaps:
        lines.append(
            f"- Not reported ({len(gaps)} metrics): "
            + ", ".join(g["label"] for g in gaps[:8])
        )
    return "\n".join(lines)


# ---------------------------------------------------------------------
# 3. Chatbot
# ---------------------------------------------------------------------

_CHAT_SYSTEM = """You are an ESG reporting assistant for a small business.

Rules you must not break:
- Answer ONLY from the company context supplied below. It is the single
  source of truth for this company's figures.
- If the context does not contain a figure, say plainly that it has not
  been entered. Never estimate one, and never fill a gap from general
  knowledge about the company or its industry.
- General knowledge about what BRSR or CSRD require is fine, but never
  present it as this company's data.
- Be brief and concrete. Lead with the number. Use **bold** for key
  figures and "• " for bullets.
- Never claim a readiness percentage means a report is ready to file."""


def chat(
    question: str,
    company: dict,
    values: dict,
    previous: dict | None,
    history: list[dict] | None = None,
) -> dict:
    """Returns {content, citations, used_ai}."""
    context = _chat_context(company, values, previous)

    convo = ""
    for turn in (history or [])[-6:]:
        who = "User" if turn.get("role") == "user" else "Assistant"
        convo += f"{who}: {turn.get('content', '')}\n"

    prompt = f"""Company context:
{context}

{f"Conversation so far:{chr(10)}{convo}" if convo else ""}
User: {question}"""

    body = _generate(prompt, system=_CHAT_SYSTEM)
    if body:
        return {
            "content": body.strip(),
            "citations": _citations_for(question, values),
            "used_ai": True,
        }

    from app.services.fallback_narrative import answer

    return {**answer(question, company, values, previous), "used_ai": False}


def _chat_context(company: dict, values: dict, previous: dict | None) -> str:
    calc = calculate(values, previous)
    scores = score_pillars(values, previous)
    gaps = find_gaps(values)

    lines = [
        f"Name: {company.get('name')}",
        f"Sector: {company.get('sector') or 'not recorded'}",
        f"Employees: {company.get('employees') or 'not recorded'}",
        f"Financial year: {company.get('year')}",
    ]

    rating = company.get("rating") or {}
    if rating:
        if rating.get("esg_score") is not None:
            lines.append(
                f"Third-party ESG risk score: {rating['esg_score']} "
                "(lower is better in this dataset's convention)"
            )
        if rating.get("controversies"):
            flags = ", ".join(f"{k}: {v}" for k, v in rating["controversies"].items() if v)
            if flags:
                lines.append(f"Controversy flags: {flags}")
        if rating.get("decarb_target_year"):
            lines.append(f"Decarbonisation target year: {rating['decarb_target_year']}")

    if calc:
        lines.append("Calculated metrics:")
        for c in calc:
            prev = f" (prior year {c['previous']})" if "previous" in c else ""
            lines.append(f"  - {c['label']}: {format_value(c['value'], c['unit'])} {c['unit']}{prev}")
    else:
        lines.append(
            "No activity data has been entered or extracted for this company yet, "
            "so no emissions, water or waste figures exist."
        )

    lines.append(
        "Internal readiness (our own completeness-and-performance indicator, "
        "not a third-party rating): "
        + ", ".join(f"{s['label']} {s['value']}" for s in scores)
        + f", overall {overall_score(scores)}/100"
    )

    for fw in ("BRSR", "CSRD"):
        s = compliance.summarise(compliance.evaluate(values, fw), fw)
        lines.append(
            f"{fw}: {s['coverage']}% metric coverage across {s['mandatoryTracked']} of "
            f"{s['mandatoryTotal']} mandatory disclosures that have numeric metrics; "
            f"{s['narrative']} disclosures need narrative input."
        )

    if gaps:
        high = [g for g in gaps if g["severity"] == "high"]
        lines.append(
            f"Unreported metrics: {len(gaps)} ({len(high)} high priority) — "
            + ", ".join(g["label"] for g in gaps[:10])
        )

    lines.append(
        "Scope 2 uses the location-based method with the CEA grid factor "
        "0.727 kg CO2e/kWh (FY 2023-24). Scope 3 is not calculated."
    )
    return "\n".join(lines)


_TOPIC_KEYS: list[tuple[tuple[str, ...], tuple[str, ...]]] = [
    (("emission", "co2", "carbon", "scope", "ghg"), ("totalCo2", "scope1", "scope2")),
    (("water",), ("waterIntensity", "waterRecycledShare")),
    (("waste", "circular"), ("wasteDivertedShare",)),
    (("diversity", "women", "gender"), ("genderDiversity", "boardDiversity")),
    (("safety", "injur", "ltifr", "accident"), ("ltifr",)),
    (("energy", "renewable"), ("totalEnergy", "renewableShare")),
]


def _citations_for(question: str, values: dict) -> list[str]:
    q = question.lower()
    calc_keys = {c["key"] for c in calculate(values)}
    for words, keys in _TOPIC_KEYS:
        if any(w in q for w in words):
            return [k for k in keys if k in calc_keys]
    return []
