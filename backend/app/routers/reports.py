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


def _blank_sections() -> list[dict]:
    return [
        {
            "key": k, "title": SECTION_TITLES[k], "body": "",
            "edited": False, "generatedAt": None, "groundedIn": [], "usedAi": False,
        }
        for k in _ORDER
    ]


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

    company = db.get(Company, report.company_id)
    values, _ = _values(db, report.company_id, report.year)

    pdf = build_report_pdf(
        company={"name": company.name, "industry": company.industry},
        year=report.year,
        framework=report.framework,
        sections=report.sections,
        values=values,
    )
    slug = "".join(ch if ch.isalnum() else "-" for ch in company.name.lower()).strip("-")
    filename = f"{slug}-{report.year}-{report.framework.lower()}.pdf"
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
