from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import create_access_token, get_current_user, hash_password, verify_password
from app.database import get_db
from app.models import Company, User
from app.schemas import LoginIn, SignupIn, TokenOut, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/signup", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupIn, db: Session = Depends(get_db)) -> TokenOut:
    if db.scalar(select(User).where(User.username == payload.username)):
        raise HTTPException(status_code=409, detail="That username is already taken")
    if payload.email and db.scalar(select(User).where(User.email == payload.email)):
        raise HTTPException(status_code=409, detail="That email is already registered")

    company = None
    if payload.company_name:
        name = payload.company_name.strip()
        # Attach to the imported company if we already know it, rather
        # than creating a duplicate under a slightly different name.
        if payload.ticker:
            company = db.scalar(
                select(Company).where(Company.ticker == payload.ticker.strip().upper())
            )
        if company is None:
            company = db.scalar(select(Company).where(Company.name == name))
        if company is None:
            company = Company(
                name=name,
                ticker=(payload.ticker or "").strip().upper() or None,
                industry=payload.industry,
            )
            db.add(company)
            db.flush()

    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=hash_password(payload.password),
        is_admin=False,
        company_id=company.id if company else None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return TokenOut(access_token=create_access_token(user), user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)) -> TokenOut:
    user = db.scalar(select(User).where(User.username == payload.username))
    # Same message either way, so the response can't be used to enumerate users.
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    return TokenOut(access_token=create_access_token(user), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(user)
