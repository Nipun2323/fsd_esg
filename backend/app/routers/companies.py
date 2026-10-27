from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.auth import ensure_company_access, get_current_user
from app.database import get_db
from app.models import Company, EsgDataset, User
from app.schemas import (
    CompanyCreate,
    CompanyOut,
    CompanySummary,
    DashboardOut,
    DatasetIn,
    DatasetOut,
    Framework,
    RatingOut,
)
from app.services import compliance
from app.services.calculator import calculate, find_gaps, overall_score, score_pillars

router = APIRouter(prefix="/api/companies", tags=["companies"])


def _years(db: Session, company_id: int) -> list[int]:
    return sorted(
        db.scalars(select(EsgDataset.year).where(EsgDataset.company_id == company_id)).all()
    )


def _to_out(db: Session, c: Company) -> CompanyOut:
    out = CompanyOut.model_validate(c)
    out.years = _years(db, c.id)
    out.rating = RatingOut.model_validate(c.rating) if c.rating else None
    return out


@router.get("/search", response_model=list[CompanySummary])
def search(
    q: str = Query(default="", max_length=120),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[CompanySummary]:
    """
    Name or ticker search. The database stays idle until something is
    typed — with 700+ companies, listing them all is neither useful nor
    cheap, and nothing is computed here beyond the lookup itself.
    """
    term = q.strip()
    if not term:
        return []

    like = f"%{term}%"
    stmt = (
        select(Company)
        .options(selectinload(Company.rating))
        .where(or_(Company.name.ilike(like), Company.ticker.ilike(like)))
        # Exact ticker first, then names that start with the term.
        .order_by(
            (func.lower(Company.ticker) == term.lower()).desc(),
            Company.name.ilike(f"{term}%").desc(),
            Company.name,
        )
        .limit(limit)
    )
    rows = db.scalars(stmt).all()
    return [
        CompanySummary(
            id=c.id,
            name=c.name,
            ticker=c.ticker,
            industry=c.industry,
            total_grade=c.rating.total_grade if c.rating else None,
        )
        for c in rows
    ]


@router.get("/resolve", response_model=CompanyOut)
def resolve(
    name: str = Query(min_length=1, max_length=255),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> CompanyOut:
    """Find one company by name or ticker — what the chatbot uses."""
    term = name.strip()
    company = db.scalar(
        select(Company)
        .options(selectinload(Company.rating))
        .where(or_(func.lower(Company.name) == term.lower(), func.lower(Company.ticker) == term.lower()))
    )
    if company is None:
        company = db.scalar(
            select(Company)
            .options(selectinload(Company.rating))
            .where(Company.name.ilike(f"%{term}%"))
            .order_by(func.length(Company.name))
        )
    if company is None:
        raise HTTPException(status_code=404, detail=f"No company matching '{term}'")
    return _to_out(db, company)


@router.post("", response_model=CompanyOut, status_code=201)
def create(
    payload: CompanyCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> CompanyOut:
    company = Company(**payload.model_dump())
    db.add(company)
    db.commit()
    db.refresh(company)
    return _to_out(db, company)


@router.get("/{company_id}", response_model=CompanyOut)
def get_company(
    company_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CompanyOut:
    company = db.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    ensure_company_access(user, company_id)
    return _to_out(db, company)


# ---------------- activity data ----------------

@router.get("/{company_id}/data", response_model=DatasetOut)
def get_data(
    company_id: int,
    year: int = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DatasetOut:
    ensure_company_access(user, company_id)
    ds = db.scalar(
        select(EsgDataset).where(
            EsgDataset.company_id == company_id, EsgDataset.year == year
        )
    )
    if ds is None:
        return DatasetOut(companyId=company_id, year=year, values={})
    return DatasetOut(companyId=company_id, year=year, values=ds.values, source=ds.source)


@router.put("/{company_id}/data", response_model=DatasetOut)
def save_data(
    company_id: int,
    payload: DatasetIn,
    year: int = Query(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DatasetOut:
    ensure_company_access(user, company_id)
    if db.get(Company, company_id) is None:
        raise HTTPException(status_code=404, detail="Company not found")

    # A metric that was not reported is dropped, never stored as 0.
    # An unmeasured figure and a measured zero are different claims, and
    # the whole gap-detection layer depends on the distinction.
    clean = {
        k: float(v)
        for k, v in payload.values.items()
        if isinstance(v, (int, float)) and not isinstance(v, bool)
    }

    ds = db.scalar(
        select(EsgDataset).where(
            EsgDataset.company_id == company_id, EsgDataset.year == year
        )
    )
    if ds is None:
        ds = EsgDataset(company_id=company_id, year=year, values=clean, source="manual")
        db.add(ds)
    else:
        ds.values = clean
        ds.source = "manual"
    db.commit()
    return DatasetOut(companyId=company_id, year=year, values=clean, source=ds.source)


# ---------------- dashboard ----------------

@router.get("/{company_id}/dashboard", response_model=DashboardOut)
def dashboard(
    company_id: int,
    year: int = Query(...),
    framework: Framework = Query(default="BRSR"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DashboardOut:
    """
    Everything one screen needs, in one call.

    Computed on demand for the company asked for — nothing is
    precomputed and nothing runs for companies nobody has opened.
    """
    company = db.scalar(
        select(Company).options(selectinload(Company.rating)).where(Company.id == company_id)
    )
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")
    ensure_company_access(user, company_id)

    rows = db.scalars(
        select(EsgDataset)
        .where(EsgDataset.company_id == company_id)
        .order_by(EsgDataset.year)
    ).all()
    by_year = {r.year: r.values for r in rows}
    values = by_year.get(year, {})
    previous = by_year.get(year - 1)

    disclosures = compliance.evaluate(values, framework)
    scores = score_pillars(values, previous)

    history = []
    for y in sorted(by_year):
        calc = calculate(by_year[y])
        g = {c["key"]: c["value"] for c in calc}
        history.append({
            "year": y,
            "scope1": round(g.get("scope1", 0), 1),
            "scope2": round(g.get("scope2", 0), 1),
            "intensity": round(g.get("intensityPerEmployee", 0)),
            "renewable": round((by_year[y].get("renewable_kwh") or 0) / 1000),
            "grid": round((by_year[y].get("electricity_kwh") or 0) / 1000),
        })

    # The imported rating, shaped for the same pillar chart the activity
    # scores use. Percentile is what makes the three comparable — the raw
    # scores sit on different scales.
    rating_pillars = []
    r = company.rating
    if r:
        for pillar, label, score, grade, level, pct in (
            ("E", "Environmental", r.environment_score, r.environment_grade,
             r.environment_level, r.environment_percentile),
            ("S", "Social", r.social_score, r.social_grade,
             r.social_level, r.social_percentile),
            ("G", "Governance", r.governance_score, r.governance_grade,
             r.governance_level, r.governance_percentile),
        ):
            if score is None:
                continue
            rating_pillars.append({
                "pillar": pillar, "label": label, "score": score,
                "grade": grade, "level": level, "percentile": pct,
            })

    benchmark = None
    if company.industry and r and r.total_score is not None:
        peer_avg = db.scalar(
            select(func.avg(type(r).total_score))
            .select_from(type(r))
            .join(Company, Company.id == type(r).company_id)
            .where(Company.industry == company.industry)
        )
        peer_n = db.scalar(
            select(func.count()).select_from(Company).where(Company.industry == company.industry)
        )
        if peer_avg is not None:
            benchmark = {
                "industry": company.industry,
                "peers": int(peer_n or 0),
                "companyScore": r.total_score,
                "industryAverage": round(float(peer_avg), 1),
            }

    return DashboardOut(
        company=_to_out(db, company),
        year=year,
        framework=framework,
        hasActivityData=bool(values),
        metrics=calculate(values, previous),
        scores=scores,
        overall=overall_score(scores),
        gaps=find_gaps(values),
        compliance=compliance.summarise(disclosures, framework),
        disclosures=disclosures,
        history=history,
        ratingPillars=rating_pillars,
        industryBenchmark=benchmark,
    )
