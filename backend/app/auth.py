"""Password hashing, JWT issue/verify, and the current-user dependency."""

from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

# bcrypt truncates at 72 bytes and raises on longer input in 5.x.
_MAX_PW_BYTES = 72


def hash_password(password: str) -> str:
    pw = password.encode("utf-8")[:_MAX_PW_BYTES]
    return bcrypt.hashpw(pw, bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8")[:_MAX_PW_BYTES], hashed.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_access_token(user: User) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user.id),
        "username": user.username,
        "is_admin": user.is_admin,
        "company_id": user.company_id,
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expire_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)


_CREDENTIALS_ERROR = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Not authenticated",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    token: str | None = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    if not token:
        raise _CREDENTIALS_ERROR
    try:
        payload = jwt.decode(
            token, settings.secret_key, algorithms=[settings.jwt_algorithm]
        )
        user_id = int(payload["sub"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise _CREDENTIALS_ERROR from None

    user = db.get(User, user_id)
    if user is None:
        raise _CREDENTIALS_ERROR
    return user


def get_current_user_optional(
    token: str | None = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User | None:
    if not token:
        return None
    try:
        return get_current_user(token, db)
    except HTTPException:
        return None


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def ensure_company_access(user: User, company_id: int) -> None:
    """Admin sees everything; a company login sees only its own company."""
    if user.is_admin:
        return
    if user.company_id != company_id:
        raise HTTPException(
            status_code=403, detail="You do not have access to this company"
        )


def seed_default_admin(db: Session) -> None:
    """
    Guarantees a way in on a fresh database.

    The default credentials are deliberately weak and are intended for
    local development only. Change DEFAULT_ADMIN_PASSWORD before this is
    reachable from anywhere but localhost.
    """
    existing = db.scalar(select(User).where(User.username == settings.default_admin_username))
    if existing:
        return
    db.add(
        User(
            username=settings.default_admin_username,
            password_hash=hash_password(settings.default_admin_password),
            is_admin=True,
        )
    )
    db.commit()
