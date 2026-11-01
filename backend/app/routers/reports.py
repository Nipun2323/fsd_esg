from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.auth import ensure_company_access, get_current_user
from app.database import get_db
from app.models import Company, EsgDataset, Report, User
from app.schemas import Framework, ReportOut, SectionKey, SectionSaveIn
from app.services.ai_service import SECTION_TITLES, generate_section
from app.services.pdf_service import build_report_pdf

router = APIRouter(prefix="/api/reports", tags=["reports"])

_ORDER: list[str] = list(SECTION_TITLES)


def _blank_section(key: str) -> dict:
    return {
        "key": key, "title": SECTION_TITLES[key], "body": "",
        "edited": False, "generatedAt": None, "groundedIn": [], "usedAi": False,
    }


def _blank_sections() -> list[dict]:
    return [_blank_section(k) for k in _ORDER]


def _reconcile(report: Report) -> bool:
    """
    Bring a stored report up to the current section list.

    A report saved before a section was added would otherwise never gain
    it, and generating that section would silently do nothing. Returns
    True when the report changed.
    """
    existing = {s["key"]: dict(s) for s in (report.sections or [])}
    rebuilt = []
    for key in _ORDER:
        sec = existing.get(key) or _blank_section(key)
        sec["title"] = SECTION_TITLES[key]
        rebuilt.append(sec)
    if rebuilt != list(report.sections or []):
        report.sections = rebuilt
        return True
    return False


def _values(db: Session, company_id: int, year: int) -> tuple[dict, dict | None]:
    rows = db.scalars(
        select(EsgDataset).where(
            EsgDataset.company_id == company_id, EsgDataset.year.in_([year, year - 1])
        )
    ).all()
    by_year = {r.year: r.values for r in rows}
    return by_year.get(year, {}), by_year.get(year - 1)


def _company_ctx(company: Company, year: int) -> dict:
    return {
        "name": company.name,
        "sector": company.industry,
        "employees": company.employees,
        "year": year,
    }


@router.get("", response_model=ReportOut)
def get_or_create(
    companyId: int = Query(...),
    year: int = Query(...),
    framework: Framework = Query(default="BRSR"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ReportOut:
    ensure_company_access(user, companyId)
    if db.get(Company, companyId) is None:
        raise HTTPException(status_code=404, detail="Company not found")

    report = db.scalar(
        select(Report).where(
            Report.company_id == companyId,
            Report.year == year,
            Report.framework == framework,
        )
    )
    if report is None:
        report = Report(
            company_id=companyId, year=year, framework=framework, sections=_blank_sections()
        )
        db.add(report)
        db.commit()
        db.refresh(report)
    elif _reconcile(report):
        db.commit()
        db.refresh(report)
    return _out(report)


def _out(r: Report) -> ReportOut:
    return ReportOut(
        id=r.id, companyId=r.company_id, year=r.year, framework=r.framework,
        status=r.status, sections=r.sections, createdAt=r.created_at, updatedAt=r.updated_at,
    )


@router.post("/{report_id}/sections/{section}/generate", response_model=ReportOut)
def generate(
    report_id: int,
    section: SectionKey,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ReportOut:
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    ensure_company_access(user, report.company_id)

    _reconcile(report)
    company = db.scalar(
        select(Company).options(selectinload(Company.rating)).where(Company.id == report.company_id)
    )
    values, previous = _values(db, report.company_id, report.year)

    result = generate_section(
        section, _company_ctx(company, report.year), values, previous, report.framework
    )

    sections = [dict(s) for s in report.sections]
    for s in sections:
        if s["key"] == section:
            s.update({
                "body": result["body"],
                "groundedIn": result["groundedIn"],
                "usedAi": result["used_ai"],
                "generatedAt": datetime.now(timezone.utc).isoformat(),
                "edited": False,
            })
    report.sections = sections
    db.commit()
    db.refresh(report)
    return _out(report)


@router.put("/{report_id}/sections/{section}", response_model=ReportOut)
def save_section(
    report_id: int,
    section: SectionKey,
    payload: SectionSaveIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ReportOut:
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    ensure_company_access(user, report.company_id)

    sections = [dict(s) for s in report.sections]
    for s in sections:
        if s["key"] == section:
            s["body"] = payload.body
            s["edited"] = True
    report.sections = sections
    db.commit()
    db.refresh(report)
    return _out(report)


@router.post("/{report_id}/export")
def export_pdf(
    report_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    report = db.get(Report, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    ensure_company_access(user, report.company_id)

    company = db.scalar(
        select(Company).options(selectinload(Company.rating)).where(Company.id == report.company_id)
    )
    values, _ = _values(db, report.company_id, report.year)

    # Multi-year series for the emissions chart.
    history = []
    for ds in db.scalars(
        select(EsgDataset)
        .where(EsgDataset.company_id == report.company_id)
        .order_by(EsgDataset.year)
    ).all():
        from app.services.calculator import calculate

        g = {c["key"]: c["value"] for c in calculate(ds.values)}
        if g.get("scope1") is None and g.get("scope2") is None:
            continue
        history.append({
            "year": ds.year,
            "scope1": round(g.get("scope1") or 0, 1),
            "scope2": round(g.get("scope2") or 0, 1),
        })

    rating = None
    if company.rating:
        r = company.rating
        rating = {
            f"{p}_{f}": getattr(r, f"{p}_{f}")
            for p in ("environment", "social", "governance", "total")
            for f in ("score", "grade", "level", "percentile")
        }
        rating["total_grade"] = r.total_grade
        rating["total_percentile"] = r.total_percentile

    pdf = build_report_pdf(
        company={
            "name": company.name,
            "industry": company.industry,
            "ticker": company.ticker,
        },
        year=report.year,
        framework=report.framework,
        sections=report.sections,
        values=values,
        rating=rating,
        history=history,
    )
    slug = "".join(ch if ch.isalnum() else "-" for ch in company.name.lower()).strip("-")
    filename = f"{slug}-{report.year}-{report.framework.lower()}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
