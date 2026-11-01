"""
Builds the downloadable report. This is `pdf_service.py` from the outline.

Produces a laid-out 8-10 page document: cover, contents, performance
tables, charts, the drafted narrative, compliance readiness and a basis
of reporting. Charts are drawn as vector graphics, and there is no
photography — nothing here depends on image licensing.
"""

from __future__ import annotations

import io
from datetime import datetime, timezone

from reportlab.graphics.shapes import Drawing, Line, Rect, String
from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    NextPageTemplate,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

from app.catalogue import METRICS_BY_KEY
from app.services.calculator import calculate, find_gaps, format_value, overall_score, score_pillars
from app.services.compliance import evaluate, summarise

# Same tokens the web app uses, so a printed page and a screen agree.
BRAND = colors.HexColor("#1baf7a")
BRAND_DARK = colors.HexColor("#0f7d57")
E_COLOR = colors.HexColor("#1baf7a")
S_COLOR = colors.HexColor("#2a78d6")
G_COLOR = colors.HexColor("#eb6834")
INK = colors.HexColor("#111111")
BODY = colors.HexColor("#2e2e2c")
MUTED = colors.HexColor("#6b6a66")
HAIRLINE = colors.HexColor("#dcdbd4")
WASH = colors.HexColor("#f2f7f4")
PAPER = colors.HexColor("#f7f7f5")
GOOD = colors.HexColor("#0ca30c")
WARN = colors.HexColor("#c98500")
CRIT = colors.HexColor("#d03b3b")

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm
CONTENT_W = PAGE_W - 2 * MARGIN


def _register_fonts() -> tuple[str, str, str]:
    """
    Pick a font family that actually has the glyphs this report uses.

    The base-14 Helvetica has no U+2082, so "tCO₂e" renders as a blank
    box — which is the single most repeated string in the document.
    Vera ships inside ReportLab, so it is present in a slim container
    with no system fonts as well as on a developer machine — the same
    font everywhere means the PDF looks identical in both. DejaVu is
    accepted only if its whole family is installed.
    """
    import os

    import reportlab

    bundled = os.path.join(os.path.dirname(reportlab.__file__), "fonts")
    families = [
        ("Vera", os.path.join(bundled, "Vera.ttf"),
         os.path.join(bundled, "VeraBd.ttf"),
         os.path.join(bundled, "VeraIt.ttf")),
        ("DejaVuSans", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf"),
    ]
    for name, reg, bold, italic in families:
        if not all(os.path.exists(p) for p in (reg, bold, italic)):
            continue
        try:
            pdfmetrics.registerFont(TTFont(name, reg))
            pdfmetrics.registerFont(TTFont(f"{name}-Bold", bold))
            pdfmetrics.registerFont(TTFont(f"{name}-Oblique", italic))
            pdfmetrics.registerFontFamily(
                name, normal=name, bold=f"{name}-Bold", italic=f"{name}-Oblique"
            )
            return name, f"{name}-Bold", f"{name}-Oblique"
        except Exception:  # noqa: BLE001 — try the next family
            continue
    # Nothing Unicode-capable: _esc strips the glyphs Helvetica cannot draw.
    return "Helvetica", "Helvetica-Bold", "Helvetica-Oblique"


FONT, FONT_B, FONT_I = _register_fonts()



def _styles() -> dict:
    base = getSampleStyleSheet()
    mk = lambda **kw: ParagraphStyle(**kw)  # noqa: E731
    return {
        "cover_title": mk(name="ct", fontName=FONT_B, fontSize=34, leading=38,
                          textColor=INK, spaceAfter=6),
        "cover_sub": mk(name="cs", fontName=FONT, fontSize=13, leading=18,
                        textColor=MUTED),
        "eyebrow": mk(name="eb", fontName=FONT_B, fontSize=8, leading=12,
                      textColor=BRAND_DARK, spaceAfter=4),
        "h1": mk(name="h1", fontName=FONT_B, fontSize=20, leading=24,
                 textColor=INK, spaceAfter=10),
        "h2": mk(name="h2", fontName=FONT_B, fontSize=12.5, leading=16,
                 textColor=INK, spaceBefore=14, spaceAfter=6),
        "body": mk(name="bd", fontName=FONT, fontSize=9.6, leading=14.6,
                   textColor=BODY, alignment=TA_JUSTIFY, spaceAfter=8),
        "lead": mk(name="ld", fontName=FONT, fontSize=11.5, leading=17,
                   textColor=BODY, spaceAfter=10),
        "quote": mk(name="qt", fontName=FONT_I, fontSize=13, leading=19,
                    textColor=BRAND_DARK, leftIndent=10, spaceBefore=4, spaceAfter=10),
        "small": mk(name="sm", fontName=FONT, fontSize=7.8, leading=11.4,
                    textColor=MUTED, spaceAfter=5),
        "tile_val": mk(name="tv", fontName=FONT_B, fontSize=19, leading=22,
                       textColor=INK),
        "tile_lbl": mk(name="tl", fontName=FONT, fontSize=7.6, leading=10,
                       textColor=MUTED),
        "tile_note": mk(name="tn", fontName=FONT, fontSize=7.4, leading=10,
                        textColor=MUTED),
        "toc_num": mk(name="tnum", fontName=FONT_B, fontSize=9.5,
                      textColor=BRAND_DARK, alignment=TA_RIGHT),
        "toc_item": mk(name="ti", fontName=FONT, fontSize=10, leading=15,
                       textColor=INK),
        "cell": mk(name="cl", fontName=FONT, fontSize=8.2, leading=11.6,
                   textColor=BODY),
        "cell_b": mk(name="clb", fontName=FONT_B, fontSize=8.2, leading=11.6,
                     textColor=INK),
        "cell_h": mk(name="clh", fontName=FONT_B, fontSize=7.6, leading=10,
                     textColor=colors.white),
    }


# Characters no font in the fallback chain is guaranteed to carry.
# Subscripts become real <sub> markup, which renders in any font and is
# typographically correct; the rest get an ASCII stand-in. Doing this
# centrally is what stops "tCO₂e" — the most repeated string in the
# document — rendering as a blank box.
_SUBSCRIPTS = {"\u2080": "0", "\u2081": "1", "\u2082": "2", "\u2083": "3",
               "\u2084": "4"}
_SUPERSCRIPTS = {"\u00b2": "2", "\u00b3": "3"}
_PLAIN = {"\u2192": "-&gt;", "\u2190": "&lt;-"}


def _esc(t: str) -> str:
    """Escape for Paragraph markup, substituting characters the font lacks."""
    t = (t or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    for ch, digit in _SUBSCRIPTS.items():
        t = t.replace(ch, f"<sub>{digit}</sub>")
    for ch, digit in _SUPERSCRIPTS.items():
        t = t.replace(ch, f"<super>{digit}</super>")
    for ch, repl in _PLAIN.items():
        t = t.replace(ch, repl)
    return t


def _flat(t: str) -> str:
    """Plain text for canvas and chart labels, where markup is not parsed."""
    t = t or ""
    for ch, digit in {**_SUBSCRIPTS, **_SUPERSCRIPTS}.items():
        t = t.replace(ch, digit)
    for ch, repl in {"\u2192": "->", "\u2190": "<-"}.items():
        t = t.replace(ch, repl)
    return t


# ---------------------------------------------------------------------
# page furniture
# ---------------------------------------------------------------------

def _make_painter(company_name: str, year: int, framework: str):
    label = f"{company_name} · ESG Report FY {year} · {framework}"

    def cover(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(PAPER)
        canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
        # A band of E/S/G colour rather than a photograph: no imagery to
        # license, and nothing that could show a person.
        canvas.setFillColor(BRAND)
        canvas.rect(0, PAGE_H - 14 * mm, PAGE_W, 14 * mm, stroke=0, fill=1)
        y = 54 * mm
        for i, col in enumerate((E_COLOR, S_COLOR, G_COLOR)):
            canvas.setFillColor(col)
            canvas.rect(MARGIN + i * (CONTENT_W / 3), y, CONTENT_W / 3, 2.4 * mm,
                        stroke=0, fill=1)
        canvas.restoreState()

    def interior(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(colors.white)
        canvas.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)
        canvas.setStrokeColor(BRAND)
        canvas.setLineWidth(2)
        canvas.line(MARGIN, PAGE_H - 12 * mm, MARGIN + 16 * mm, PAGE_H - 12 * mm)
        canvas.setFont(FONT, 7.2)
        canvas.setFillColor(MUTED)
        canvas.drawString(MARGIN + 20 * mm, PAGE_H - 12.8 * mm, _flat(label))
        canvas.setStrokeColor(HAIRLINE)
        canvas.setLineWidth(0.4)
        canvas.line(MARGIN, 14 * mm, PAGE_W - MARGIN, 14 * mm)
        canvas.setFont(FONT_B, 8)
        canvas.setFillColor(BRAND_DARK)
        canvas.drawRightString(PAGE_W - MARGIN, 9.5 * mm, str(canvas.getPageNumber()))
        canvas.restoreState()

    return cover, interior


# ---------------------------------------------------------------------
# vector charts
# ---------------------------------------------------------------------

def _bar_chart(rows: list[tuple[str, float]], *, width: float, height: float,
               color, unit: str = "") -> Drawing:
    """Horizontal bars with direct value labels. No axis furniture to misread."""
    d = Drawing(width, height)
    if not rows:
        return d
    peak = max((v for _, v in rows), default=0) or 1
    label_w = width * 0.34
    track_w = width - label_w - 42
    row_h = height / len(rows)
    bar_h = min(9, row_h * 0.5)

    for i, (name, value) in enumerate(rows):
        y = height - (i + 1) * row_h + (row_h - bar_h) / 2
        d.add(String(0, y + 1, _flat(name)[:34], fontName=FONT, fontSize=7.6,
                     fillColor=BODY))
        d.add(Rect(label_w, y, track_w, bar_h, fillColor=colors.HexColor("#eeeeea"),
                   strokeColor=None))
        w = max(1.0, track_w * (value / peak))
        d.add(Rect(label_w, y, w, bar_h, fillColor=color, strokeColor=None))
        shown = f"{value:,.1f}".rstrip("0").rstrip(".")
        d.add(String(label_w + track_w + 5, y + 1, _flat(f"{shown}{unit}"),
                     fontName=FONT_B, fontSize=7.6, fillColor=INK))
    return d


def _trend_chart(points: list[dict], *, width: float, height: float) -> Drawing:
    """Stacked Scope 1 / Scope 2 columns with the total labelled above each."""
    d = Drawing(width, height)
    if not points:
        return d
    pad_b, pad_t = 20, 16
    plot_h = height - pad_b - pad_t
    peak = max((p["scope1"] + p["scope2"]) for p in points) or 1
    slot = width / len(points)
    bar_w = min(42, slot * 0.46)

    d.add(Line(0, pad_b, width, pad_b, strokeColor=HAIRLINE, strokeWidth=0.6))
    for i, p in enumerate(points):
        cx = slot * i + slot / 2
        x = cx - bar_w / 2
        h1 = plot_h * (p["scope1"] / peak)
        h2 = plot_h * (p["scope2"] / peak)
        d.add(Rect(x, pad_b, bar_w, h1, fillColor=S_COLOR, strokeColor=None))
        d.add(Rect(x, pad_b + h1, bar_w, h2, fillColor=E_COLOR, strokeColor=None))
        total = p["scope1"] + p["scope2"]
        d.add(String(cx, pad_b + h1 + h2 + 4, f"{total:,.0f}", textAnchor="middle",
                     fontName=FONT_B, fontSize=7.6, fillColor=INK))
        d.add(String(cx, 8, f"FY {p['year']}", textAnchor="middle",
                     fontName=FONT, fontSize=7.4, fillColor=MUTED))

    for j, (lbl, col) in enumerate((("Scope 1", S_COLOR), ("Scope 2", E_COLOR))):
        lx = width - 96 + j * 50
        d.add(Rect(lx, height - 9, 6, 6, fillColor=col, strokeColor=None))
        d.add(String(lx + 9, height - 8.5, lbl, fontName=FONT, fontSize=7.2,
                     fillColor=BODY))
    return d


# ---------------------------------------------------------------------
# building blocks
# ---------------------------------------------------------------------

def _kpi_strip(tiles: list[tuple[str, str, str]], st: dict) -> Table:
    cells = []
    for label, value, note in tiles:
        cells.append([
            Paragraph(_esc(label).upper(), st["tile_lbl"]),
            Paragraph(_esc(value), st["tile_val"]),
            Paragraph(_esc(note), st["tile_note"]),
        ])
    inner = [Table([[c] for c in col], colWidths=[CONTENT_W / len(cells) - 6]) for col in cells]
    for t in inner:
        t.setStyle(TableStyle([
            ("LEFTPADDING", (0, 0), (-1, -1), 8), ("RIGHTPADDING", (0, 0), (-1, -1), 8),
            ("TOPPADDING", (0, 0), (-1, 0), 9), ("BOTTOMPADDING", (0, -1), (-1, -1), 9),
            ("BACKGROUND", (0, 0), (-1, -1), WASH),
            ("LINEABOVE", (0, 0), (-1, 0), 2, BRAND),
        ]))
    outer = Table([inner], colWidths=[CONTENT_W / len(inner)] * len(inner))
    outer.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0), ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 0), ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return outer


def _figure(number: int, caption: str, st: dict) -> Paragraph:
    return Paragraph(f"<b>Fig. {number}.</b> {_esc(caption)}", st["eyebrow"])


def _data_table(header: list[str], rows: list[list], widths: list[float], st: dict) -> Table:
    data = [[Paragraph(_esc(h), st["cell_h"]) for h in header]]
    for r in rows:
        data.append([
            c if hasattr(c, "wrap") else Paragraph(_esc(str(c)), st["cell"]) for c in r
        ])
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), BRAND_DARK),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LEFTPADDING", (0, 0), (-1, -1), 7), ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("LINEBELOW", (0, 0), (-1, -1), 0.4, HAIRLINE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#fafaf8")]),
    ]))
    return t


def _section_head(eyebrow: str, title: str, st: dict) -> list:
    return [Paragraph(_esc(eyebrow).upper(), st["eyebrow"]),
            Paragraph(_esc(title), st["h1"])]


def _prose(body: str, st: dict) -> list:
    out = []
    for para in (body or "").split("\n\n"):
        para = para.strip()
        if para:
            out.append(Paragraph(_esc(para).replace("\n", "<br/>"), st["body"]))
    return out


# ---------------------------------------------------------------------
# the report
# ---------------------------------------------------------------------

def build_report_pdf(
    *, company: dict, year: int, framework: str, sections: list[dict], values: dict,
    rating: dict | None = None, history: list[dict] | None = None,
) -> bytes:
    st = _styles()
    values = values or {}
    history = history or []
    calc = calculate(values)
    by = {c["key"]: c for c in calc}
    scores = score_pillars(values)
    gaps = find_gaps(values)
    disclosures = evaluate(values, framework)
    summary = summarise(disclosures, framework)
    name = company.get("name", "Company")
    sec = {s["key"]: s for s in sections}

    buf = io.BytesIO()
    doc = BaseDocTemplate(
        buf, pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN, topMargin=22 * mm, bottomMargin=20 * mm,
        title=f"{name} ESG Report FY {year}", author="Verdant ESG",
        subject=f"{framework} aligned ESG report",
    )
    cover_paint, interior_paint = _make_painter(name, year, framework)
    frame = Frame(MARGIN, 20 * mm, CONTENT_W, PAGE_H - 42 * mm, id="body")
    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[frame], onPage=cover_paint),
        PageTemplate(id="interior", frames=[frame], onPage=interior_paint),
    ])

    S: list = []

    # ---------- 1. cover ----------
    S.append(Spacer(1, 46 * mm))
    S.append(Paragraph("ENVIRONMENTAL · SOCIAL · GOVERNANCE", st["eyebrow"]))
    S.append(Paragraph(_esc(name), st["cover_title"]))
    S.append(Paragraph(f"ESG Report · Financial Year {year}", st["cover_sub"]))
    S.append(Spacer(1, 4 * mm))
    meta = " · ".join(
        x for x in (company.get("ticker"), company.get("industry"),
                    f"Prepared against {framework}") if x
    )
    S.append(Paragraph(_esc(meta), st["cover_sub"]))
    S.append(Spacer(1, 60 * mm))
    S.append(Paragraph(
        f"Generated {datetime.now(timezone.utc).strftime('%d %B %Y')} · "
        "Decision support, not assurance", st["small"]))
    S.append(NextPageTemplate("interior"))
    S.append(PageBreak())

    # ---------- 2. contents + at a glance ----------
    S += _section_head("Contents", "What is in this report", st)
    toc = [
        ("01", "Executive summary", "The year in brief"),
        ("02", "Our approach", "Frameworks, boundary and basis"),
        ("03", "Environmental performance", "Emissions, energy, water, waste"),
        ("04", "Social performance", "Workforce, training, safety"),
        ("05", "Governance", "Board composition and policies"),
        ("06", "Compliance readiness", f"{framework} disclosure coverage"),
        ("07", "Priorities", "Where to act next"),
        ("08", "Basis of reporting", "Methodology and limitations"),
    ]
    rows = [[Paragraph(f'<font color="#0f7d57"><b>{n}</b></font>', st["cell_b"]),
             Paragraph(f"<b>{_esc(t)}</b>", st["cell_b"]),
             Paragraph(_esc(d), st["cell"])] for n, t, d in toc]
    tt = Table(rows, colWidths=[14 * mm, 58 * mm, CONTENT_W - 72 * mm])
    tt.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, HAIRLINE),
    ]))
    S.append(tt)

    S.append(Spacer(1, 10 * mm))
    S.append(Paragraph("THE YEAR AT A GLANCE", st["eyebrow"]))
    S.append(Spacer(1, 2 * mm))

    def tile(key: str, label: str, note: str = "") -> tuple[str, str, str]:
        m = by.get(key)
        if not m:
            return (label, "—", "not reported")
        v = format_value(m["value"], m["unit"])
        unit = "" if m["unit"] == "%" else f" {m['unit']}"
        extra = note
        if "previous" in m and m["previous"]:
            d = (m["value"] - m["previous"]) / abs(m["previous"]) * 100
            extra = f"{abs(d):.1f}% {'up' if d > 0 else 'down'} on FY {year - 1}"
        return (label, f"{v}{unit}", extra)

    S.append(_kpi_strip([
        tile("totalCo2", "Total GHG emissions"),
        tile("renewableShare", "Renewable share"),
        tile("genderDiversity", "Gender diversity"),
        ("Metric coverage", f"{summary['coverage']}%",
         f"{summary['mandatoryTracked']} of {summary['mandatoryTotal']} mandatory"),
    ], st))

    S.append(Spacer(1, 8 * mm))
    S.append(Paragraph(
        "Figures are drawn from the company's own records for the year stated. "
        "They have not been externally assured. Scope 3 value-chain emissions are "
        "not calculated, and no double-materiality assessment has been performed.",
        st["small"]))
    S.append(PageBreak())

    # ---------- 3. executive summary ----------
    S += _section_head("01 · Executive summary", "The year in brief", st)
    if rating and rating.get("total_grade"):
        S.append(Paragraph(
            f"“Rated {rating['total_grade']} overall by third-party assessment, "
            f"placing {_esc(name)} in the "
            f"{rating.get('total_percentile', 0):.0f}th percentile of the rated universe.”",
            st["quote"]))
    S += _prose(sec.get("executive_summary", {}).get("body", ""), st)

    pillar_rows = [(s["label"], float(s["value"])) for s in scores]
    S.append(Spacer(1, 4 * mm))
    S.append(_figure(1, "Internal readiness by pillar (0–100). This platform's own "
                        "completeness-and-performance indicator, not a third-party rating.", st))
    S.append(_bar_chart(pillar_rows, width=CONTENT_W, height=46, color=BRAND))
    S.append(Spacer(1, 2 * mm))
    S.append(Paragraph(
        f"Overall {overall_score(scores)} out of 100. The indicator blends how complete "
        "the reported data is with how the figures compare against internal targets. "
        "No regulator recognises it.", st["small"]))
    S.append(PageBreak())

    # ---------- 4. approach ----------
    S += _section_head("02 · Our approach", "Frameworks, boundary and basis", st)
    S += _prose(sec.get("approach", {}).get("body", ""), st)

    if rating:
        S.append(Spacer(1, 3 * mm))
        S.append(_figure(2, "Third-party ESG assessment", st))
        rrows = []
        for pillar in ("environment", "social", "governance", "total"):
            score = rating.get(f"{pillar}_score")
            if score is None:
                continue
            rrows.append([
                pillar.title(),
                f"{score:,.0f}",
                rating.get(f"{pillar}_grade") or "—",
                rating.get(f"{pillar}_level") or "—",
                f"{rating.get(f'{pillar}_percentile', 0):.0f}th",
            ])
        if rrows:
            S.append(_data_table(
                ["Pillar", "Score", "Grade", "Level", "Percentile"], rrows,
                [CONTENT_W * 0.3, CONTENT_W * 0.16, CONTENT_W * 0.16,
                 CONTENT_W * 0.2, CONTENT_W * 0.18], st))
            S.append(Spacer(1, 2 * mm))
            S.append(Paragraph(
                "Percentile is this company's rank within the imported rating universe. "
                "The three pillar scores sit on different scales, so the percentile is "
                "what makes them comparable.", st["small"]))
    S.append(PageBreak())

    # ---------- 5. environmental ----------
    S += _section_head("03 · Environmental", "Emissions, energy, water and waste", st)
    S += _prose(sec.get("environmental", {}).get("body", ""), st)

    if len(history) > 1:
        S.append(Spacer(1, 3 * mm))
        S.append(_figure(3, "Greenhouse gas emissions by scope (tCO₂e)", st))
        S.append(_trend_chart(history[-5:], width=CONTENT_W, height=108))

    env = [c for c in calc if c["pillar"] == "E"]
    if env:
        S.append(Spacer(1, 5 * mm))
        S.append(_figure(4 if len(history) > 1 else 3, "Environmental metrics", st))
        S.append(_data_table(
            ["Metric", "FY " + str(year), "Unit", "Prior year", "Basis"],
            [[m["label"], format_value(m["value"], m["unit"]), m["unit"],
              format_value(m["previous"], m["unit"]) if "previous" in m else "—",
              m.get("basis", "—")] for m in env],
            [CONTENT_W * 0.25, CONTENT_W * 0.13, CONTENT_W * 0.19,
             CONTENT_W * 0.13, CONTENT_W * 0.30], st))
    S.append(PageBreak())

    # ---------- 6. social ----------
    S += _section_head("04 · Social", "Workforce, training and safety", st)
    S += _prose(sec.get("social", {}).get("body", ""), st)
    soc = [c for c in calc if c["pillar"] == "S"]
    if soc:
        S.append(Spacer(1, 4 * mm))
        S.append(_figure(5, "Social metrics", st))
        S.append(_data_table(
            ["Metric", "FY " + str(year), "Unit", "Prior year"],
            [[m["label"], format_value(m["value"], m["unit"]), m["unit"],
              format_value(m["previous"], m["unit"]) if "previous" in m else "—"]
             for m in soc],
            [CONTENT_W * 0.42, CONTENT_W * 0.2, CONTENT_W * 0.18, CONTENT_W * 0.2], st))

    # ---------- 7. governance ----------
    S.append(PageBreak())
    S += _section_head("05 · Governance", "Board composition and business conduct", st)
    S += _prose(sec.get("governance", {}).get("body", ""), st)

    policy_rows = []
    for key in ("anti_corruption_policy", "whistleblower_policy", "grievance_mechanism",
                "board_esg_oversight"):
        raw = values.get(key)
        state, col = ("In force", GOOD) if raw == 1 else \
                     ("Not in place", CRIT) if raw == 0 else ("Not reported", MUTED)
        policy_rows.append([
            METRICS_BY_KEY[key]["label"],
            Paragraph(f'<font color="#{col.hexval()[2:]}"><b>{state}</b></font>', st["cell_b"]),
            ", ".join(METRICS_BY_KEY[key]["mapsTo"]),
        ])
    S.append(Spacer(1, 4 * mm))
    S.append(_figure(6, "Policy and oversight status", st))
    S.append(_data_table(["Policy", "Status", "Feeds disclosure"], policy_rows,
                         [CONTENT_W * 0.38, CONTENT_W * 0.2, CONTENT_W * 0.42], st))
    S.append(PageBreak())

    # ---------- 8. compliance readiness ----------
    S += _section_head("06 · Compliance readiness", f"{framework} disclosure coverage", st)
    S.append(Paragraph(
        f"Of the {summary['mandatoryTotal']} mandatory {framework} disclosures, "
        f"{summary['mandatoryTracked']} have a numeric metric behind them and are "
        f"{summary['coverage']}% covered by the data on record. The remaining "
        f"{summary['narrative']} disclosures in the framework require narrative, policy "
        "or process statements that no figure can satisfy, and are listed below as "
        "needing narrative. A coverage figure of 100% would not mean the report is "
        "finished.", st["body"]))

    by_group: dict[str, dict[str, int]] = {}
    for d in disclosures:
        g = by_group.setdefault(d["group"], {"complete": 0, "partial": 0,
                                             "missing": 0, "narrative": 0})
        g[d["status"]] += 1
    S.append(Spacer(1, 3 * mm))
    S.append(_figure(7, "Disclosure status by section", st))
    S.append(_data_table(
        ["Section", "Complete", "Partial", "Not started", "Needs narrative"],
        [[g, str(v["complete"]), str(v["partial"]), str(v["missing"]), str(v["narrative"])]
         for g, v in by_group.items()],
        [CONTENT_W * 0.3, CONTENT_W * 0.175, CONTENT_W * 0.15,
         CONTENT_W * 0.19, CONTENT_W * 0.185], st))

    outstanding = [d for d in disclosures if d["status"] in ("partial", "missing")]
    if outstanding:
        S.append(Spacer(1, 5 * mm))
        S.append(_figure(8, "Disclosures with data still outstanding", st))
        S.append(_data_table(
            ["Disclosure", "Status", "Metrics still needed"],
            [[f"{d['code']} — {d['title']}",
              "Partial" if d["status"] == "partial" else "Not started",
              ", ".join(METRICS_BY_KEY[k]["label"] for k in d["missing"][:4])
              + (" …" if len(d["missing"]) > 4 else "")]
             for d in outstanding[:12]],
            [CONTENT_W * 0.34, CONTENT_W * 0.14, CONTENT_W * 0.52], st))
    S.append(PageBreak())

    # ---------- 9. priorities ----------
    S += _section_head("07 · Priorities", "Where to act next", st)
    S += _prose(sec.get("recommendations", {}).get("body", ""), st)

    high = [g for g in gaps if g["severity"] == "high"]
    if high:
        S.append(Spacer(1, 4 * mm))
        S.append(_figure(9, "High-priority data gaps", st))
        S.append(_data_table(
            ["Metric", "Pillar", "Blocks"],
            [[g["label"], g["pillar"], ", ".join(g["blocks"])] for g in high],
            [CONTENT_W * 0.34, CONTENT_W * 0.12, CONTENT_W * 0.54], st))
    S.append(PageBreak())

    # ---------- 10. basis of reporting ----------
    S += _section_head("08 · Basis of reporting", "Methodology and limitations", st)
    S.append(Paragraph("Calculation basis", st["h2"]))
    S.append(_data_table(
        ["Item", "Treatment"],
        [["Scope 1", "Diesel and petrol combusted on site and in owned vehicles, "
                     "converted with DEFRA/BEIS factors."],
         ["Scope 2", "Purchased electricity on a location-based method, using the CEA "
                     "grid factor of 0.727 kg CO₂e/kWh (weighted average, FY 2023-24)."],
         ["Scope 3", "Not calculated. For many businesses of this size, value-chain "
                     "emissions are the majority of the footprint."],
         ["LTIFR", "Lost-time injuries per one million hours worked."],
         ["Unreported metrics", "Recorded as absent, never as zero. An unmeasured "
                                "figure and a measured zero are different claims."]],
        [CONTENT_W * 0.24, CONTENT_W * 0.76], st))

    S.append(Paragraph("Limitations", st["h2"]))
    for line in (
        "This report has not been externally assured. Nothing in it constitutes an "
        "audit opinion or a conformity assessment.",
        "Readiness and coverage percentages count only disclosures backed by a numeric "
        "metric. Both BRSR and the ESRS additionally require narrative, policy and "
        "process disclosures.",
        "No double-materiality assessment has been performed, which is what determines "
        "whether an ESRS topical standard applies at all.",
        "Framework details were checked against public sources, but scope thresholds "
        "and assurance timelines under both regimes have been amended more than once. "
        "Verify against the current SEBI circular or ESRS text before relying on a date.",
    ):
        S.append(Paragraph(f"— {line}", st["body"]))

    drafted = [s for s in sections if s.get("body")]
    ai_used = sum(1 for s in drafted if s.get("usedAi"))
    S.append(Paragraph("How this report was produced", st["h2"]))
    if not drafted:
        how = "No narrative sections have been drafted for this report yet. "
    elif ai_used == len(drafted):
        how = (
            f"All {len(drafted)} narrative sections were drafted by a language model "
            "from those figures and reviewed before publication. "
        )
    elif ai_used:
        how = (
            f"{ai_used} of {len(drafted)} narrative sections were drafted by a language "
            f"model from those figures and reviewed before publication; the other "
            f"{len(drafted) - ai_used} were produced by a deterministic template. "
        )
    else:
        how = (
            "The narrative sections were produced by a deterministic template over the "
            "same figures rather than by a language model. "
        )
    S.append(Paragraph(
        f"Figures were computed from the data on record for FY {year}. " + how
        + "In either case the text is constrained to the figures supplied and cannot "
          "introduce a number that is not in the underlying data.", st["body"]))

    S.append(Spacer(1, 6 * mm))
    S.append(Paragraph(
        f"{_esc(name)} · ESG Report FY {year} · Prepared against {framework} · "
        f"Generated {datetime.now(timezone.utc).strftime('%d %B %Y')}", st["small"]))

    doc.build(S)
    return buf.getvalue()
