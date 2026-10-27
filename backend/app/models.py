from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    """A login. Either the seeded admin, or a company that signed up."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, index=True)
    email: Mapped[str | None] = mapped_column(String(200), unique=True, nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)

    # The company this login represents. Null for the admin, who sees all.
    company_id: Mapped[int | None] = mapped_column(
        ForeignKey("companies.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    company: Mapped["Company | None"] = relationship(back_populates="users")


class Company(Base):
    """One row per company in the imported ratings dataset."""

    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), index=True)
    ticker: Mapped[str | None] = mapped_column(String(32), index=True, nullable=True)
    industry: Mapped[str | None] = mapped_column(String(160), index=True, nullable=True)
    exchange: Mapped[str | None] = mapped_column(String(160), nullable=True)
    currency: Mapped[str] = mapped_column(String(8), default="USD")
    logo_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    web_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    cik: Mapped[str | None] = mapped_column(String(32), nullable=True)
    # Not present in the ratings dataset; filled from an uploaded report.
    employees: Mapped[int | None] = mapped_column(Integer, nullable=True)
    country: Mapped[str | None] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    rating: Mapped["CompanyRating | None"] = relationship(
        back_populates="company", uselist=False, cascade="all, delete-orphan"
    )
    datasets: Mapped[list["EsgDataset"]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )
    reports: Mapped[list["Report"]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )
    uploads: Mapped[list["Upload"]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )
    users: Mapped[list["User"]] = relationship(back_populates="company")

    __table_args__ = (Index("ix_companies_name_ticker", "name", "ticker"),)


class CompanyRating(Base):
    """
    Third-party ESG rating as supplied in the import file.

    Assessment data, not activity data: it carries no kWh, water or
    waste figures, so nothing here feeds the emissions calculator.
    Those come from an uploaded report instead.

    Scores are higher-is-better in this dataset. The three pillar
    scores use different ranges, so `*_percentile` holds each company's
    rank within the imported set, which is what makes them comparable.
    """

    __tablename__ = "company_ratings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), unique=True, index=True
    )

    environment_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    environment_grade: Mapped[str | None] = mapped_column(String(8), nullable=True)
    environment_level: Mapped[str | None] = mapped_column(String(16), nullable=True)
    environment_percentile: Mapped[float | None] = mapped_column(Float, nullable=True)

    social_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    social_grade: Mapped[str | None] = mapped_column(String(8), nullable=True)
    social_level: Mapped[str | None] = mapped_column(String(16), nullable=True)
    social_percentile: Mapped[float | None] = mapped_column(Float, nullable=True)

    governance_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    governance_grade: Mapped[str | None] = mapped_column(String(8), nullable=True)
    governance_level: Mapped[str | None] = mapped_column(String(16), nullable=True)
    governance_percentile: Mapped[float | None] = mapped_column(Float, nullable=True)

    total_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_grade: Mapped[str | None] = mapped_column(String(8), index=True, nullable=True)
    total_level: Mapped[str | None] = mapped_column(String(16), nullable=True)
    total_percentile: Mapped[float | None] = mapped_column(Float, nullable=True)

    last_processing_date: Mapped[str | None] = mapped_column(String(32), nullable=True)

    company: Mapped["Company"] = relationship(back_populates="rating")


class EsgDataset(Base):
    """
    Activity data for one company and financial year.

    `values` holds metric_key -> number, using the keys in the shared
    metric catalogue. A metric that was never reported is ABSENT from
    the dict; it is never stored as 0. An unmeasured figure and a
    measured zero are different claims.
    """

    __tablename__ = "esg_datasets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    year: Mapped[int] = mapped_column(Integer, index=True)
    values: Mapped[dict] = mapped_column(JSON, default=dict)
    source: Mapped[str] = mapped_column(String(32), default="manual")  # manual | upload | csv
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    company: Mapped["Company"] = relationship(back_populates="datasets")

    __table_args__ = (UniqueConstraint("company_id", "year", name="uq_dataset_company_year"),)


class Upload(Base):
    """A report file a company uploaded, and what was extracted from it."""

    __tablename__ = "uploads"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str | None] = mapped_column(String(120), nullable=True)
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    year: Mapped[int | None] = mapped_column(Integer, nullable=True)

    status: Mapped[str] = mapped_column(String(24), default="pending")  # pending|parsed|failed
    # Metrics the extractor found, plus its own notes about confidence.
    extracted: Mapped[dict] = mapped_column(JSON, default=dict)
    extraction_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    # True when a real model did the extraction, False for the fallback.
    used_ai: Mapped[bool] = mapped_column(Boolean, default=False)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)

    company: Mapped["Company"] = relationship(back_populates="uploads")


class Report(Base):
    """A generated BRSR or CSRD report for one company and year."""

    __tablename__ = "reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), index=True
    )
    year: Mapped[int] = mapped_column(Integer)
    framework: Mapped[str] = mapped_column(String(8))  # BRSR | CSRD
    status: Mapped[str] = mapped_column(String(16), default="draft")

    # [{key, title, body, edited, generatedAt, groundedIn, usedAi}]
    sections: Mapped[list] = mapped_column(JSON, default=list)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_now, onupdate=_now)

    company: Mapped["Company"] = relationship(back_populates="reports")

    __table_args__ = (
        UniqueConstraint("company_id", "year", "framework", name="uq_report_company_year_fw"),
    )


class ChatTurn(Base):
    """Assistant history, kept per company so answers stay in context."""

    __tablename__ = "chat_turns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int | None] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), index=True, nullable=True
    )
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    role: Mapped[str] = mapped_column(String(16))  # user | assistant
    content: Mapped[str] = mapped_column(Text)
    citations: Mapped[list] = mapped_column(JSON, default=list)
    used_ai: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_now)
