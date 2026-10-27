import re
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.auth import get_current_user
from app.database import get_db
from app.models import ChatTurn, Company, EsgDataset, User
from app.schemas import ChatIn, ChatOut
from app.services.ai_service import chat as ai_chat

router = APIRouter(prefix="/api/assistant", tags=["assistant"])

# Words that look like company names but are not, so a question like
# "What is CSRD?" doesn't go hunting for a company called "What".
_STOPWORDS = {
    "what", "how", "why", "when", "which", "who", "the", "our", "my", "is", "are",
    "show", "tell", "give", "report", "dashboard", "esg", "brsr", "csrd", "data",
    "emissions", "carbon", "scope", "generate", "about", "for", "and", "with",
}


def _find_company(db: Session, text: str) -> Company | None:
    """
    Resolve a company from the user's own words.

    Nothing is computed until this succeeds — the database stays idle
    for questions that name no company.
    """
    cleaned = text.strip()
    if not cleaned:
        return None

    # 1. An explicit ticker in caps, e.g. "how is DIS doing"
    for token in re.findall(r"\b[A-Z]{2,5}\b", cleaned):
        if token.lower() in _STOPWORDS:
            continue
        hit = db.scalar(
            select(Company)
            .options(selectinload(Company.rating))
            .where(func.lower(Company.ticker) == token.lower())
        )
        if hit:
            return hit

    # 2. The longest candidate phrase that matches a known name.
    words = [w for w in re.findall(r"[A-Za-z0-9&.'-]+", cleaned)]
    for size in range(min(5, len(words)), 0, -1):
        for start in range(len(words) - size + 1):
            phrase = " ".join(words[start : start + size])
            if len(phrase) < 3 or phrase.lower() in _STOPWORDS:
                continue
            if size == 1 and phrase.lower() in _STOPWORDS:
                continue
            hit = db.scalar(
                select(Company)
                .options(selectinload(Company.rating))
                .where(
                    or_(
                        func.lower(Company.name) == phrase.lower(),
                        Company.name.ilike(f"{phrase}%"),
                    )
                )
                .order_by(func.length(Company.name))
            )
            if hit:
                return hit

    # 3. Substring match, so "Disney" finds "Walt Disney Co". Kept last and
    #    held to 4+ characters so short words don't drag in a stray match.
    for size in range(min(4, len(words)), 0, -1):
        for start in range(len(words) - size + 1):
            phrase = " ".join(words[start : start + size])
            if len(phrase) < 4 or phrase.lower() in _STOPWORDS:
                continue
            hit = db.scalar(
                select(Company)
                .options(selectinload(Company.rating))
                .where(Company.name.ilike(f"%{phrase}%"))
                .order_by(func.length(Company.name))
            )
            if hit:
                return hit
    return None


def _latest_values(db: Session, company_id: int, year: int | None) -> tuple[dict, dict | None, int | None]:
    rows = db.scalars(
        select(EsgDataset)
        .where(EsgDataset.company_id == company_id)
        .order_by(EsgDataset.year)
    ).all()
    by_year = {r.year: r.values for r in rows}
    if not by_year:
        return {}, None, year
    target = year if year in by_year else max(by_year)
    return by_year[target], by_year.get(target - 1), target


@router.post("/chat", response_model=ChatOut)
def chat(
    payload: ChatIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ChatOut:
    question = next(
        (m.content for m in reversed(payload.messages) if m.role == "user"), ""
    ).strip()
    if not question:
        raise HTTPException(status_code=400, detail="No question supplied")

    company: Company | None = None
    if payload.companyId:
        company = db.scalar(
            select(Company)
            .options(selectinload(Company.rating))
            .where(Company.id == payload.companyId)
        )
    if company is None and payload.companyName:
        company = _find_company(db, payload.companyName)
    if company is None:
        company = _find_company(db, question)
    # A company login defaults to its own company.
    if company is None and user.company_id:
        company = db.scalar(
            select(Company)
            .options(selectinload(Company.rating))
            .where(Company.id == user.company_id)
        )

    now = datetime.now(timezone.utc)

    if company is None:
        return ChatOut(
            id=str(uuid.uuid4()),
            content=(
                "Name a company and I'll pull up its data — for example "
                '"Show me Walt Disney Co" or "How is DIS doing on governance?".\n\n'
                "Until a company is named I don't query the database, so there is "
                "nothing for me to answer from."
            ),
            createdAt=now.isoformat(),
            usedAi=False,
        )

    values, previous, year = _latest_values(db, company.id, payload.year)

    rating = {}
    if company.rating:
        r = company.rating
        rating = {
            "environment": {"score": r.environment_score, "grade": r.environment_grade,
                            "percentile": r.environment_percentile},
            "social": {"score": r.social_score, "grade": r.social_grade,
                       "percentile": r.social_percentile},
            "governance": {"score": r.governance_score, "grade": r.governance_grade,
                           "percentile": r.governance_percentile},
            "total": {"score": r.total_score, "grade": r.total_grade,
                      "percentile": r.total_percentile},
        }

    ctx = {
        "name": company.name,
        "sector": company.industry,
        "employees": company.employees,
        "year": year,
        "rating": rating,
    }

    history = [
        {"role": m.role, "content": m.content} for m in payload.messages[:-1][-6:]
    ]
    result = ai_chat(question, ctx, values, previous, history)

    db.add(ChatTurn(company_id=company.id, user_id=user.id, role="user", content=question))
    db.add(
        ChatTurn(
            company_id=company.id,
            user_id=user.id,
            role="assistant",
            content=result["content"],
            citations=result.get("citations", []),
            used_ai=result["used_ai"],
        )
    )
    db.commit()

    return ChatOut(
        id=str(uuid.uuid4()),
        content=result["content"],
        createdAt=now.isoformat(),
        citations=result.get("citations", []),
        usedAi=result["used_ai"],
        companyId=company.id,
        companyName=company.name,
    )
