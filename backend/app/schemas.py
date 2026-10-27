from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

Framework = Literal["BRSR", "CSRD"]
SectionKey = Literal[
    "executive_summary", "environmental", "social", "governance", "recommendations"
]


# ---------------- auth ----------------

class SignupIn(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=5, max_length=128)
    email: EmailStr | None = None
    company_name: str | None = Field(default=None, max_length=255)
    ticker: str | None = Field(default=None, max_length=32)
    industry: str | None = Field(default=None, max_length=160)


class LoginIn(BaseModel):
    username: str
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    email: str | None
    is_admin: bool
    company_id: int | None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


# ---------------- companies ----------------

class RatingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    environment_score: float | None
    environment_grade: str | None
    environment_level: str | None
    environment_percentile: float | None
    social_score: float | None
    social_grade: str | None
    social_level: str | None
    social_percentile: float | None
    governance_score: float | None
    governance_grade: str | None
    governance_level: str | None
    governance_percentile: float | None
    total_score: float | None
    total_grade: str | None
    total_level: str | None
    total_percentile: float | None
    last_processing_date: str | None


class CompanySummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    ticker: str | None
    industry: str | None
    total_grade: str | None = None


class CompanyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    ticker: str | None
    industry: str | None
    exchange: str | None
    currency: str
    logo_url: str | None
    web_url: str | None
    employees: int | None
    country: str | None
    years: list[int] = []
    rating: RatingOut | None = None


class CompanyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    ticker: str | None = None
    industry: str | None = None
    employees: int | None = Field(default=None, ge=0)
    country: str | None = None
    currency: str = "USD"


# ---------------- datasets ----------------

class DatasetOut(BaseModel):
    companyId: int
    year: int
    values: dict[str, float | None]
    source: str = "manual"


class DatasetIn(BaseModel):
    companyId: int
    year: int
    values: dict[str, float | None]


# ---------------- dashboard ----------------

class DashboardOut(BaseModel):
    company: CompanyOut
    year: int
    framework: Framework
    hasActivityData: bool
    metrics: list[dict[str, Any]]
    scores: list[dict[str, Any]]
    overall: int
    gaps: list[dict[str, Any]]
    compliance: dict[str, Any]
    disclosures: list[dict[str, Any]]
    history: list[dict[str, Any]]
    ratingPillars: list[dict[str, Any]]
    industryBenchmark: dict[str, Any] | None = None


# ---------------- reports ----------------

class ReportSectionOut(BaseModel):
    key: str
    title: str
    body: str
    edited: bool = False
    generatedAt: str | None = None
    groundedIn: list[str] = []
    usedAi: bool = False


class ReportOut(BaseModel):
    id: int
    companyId: int
    year: int
    framework: Framework
    status: str
    sections: list[ReportSectionOut]
    createdAt: datetime
    updatedAt: datetime


class SectionSaveIn(BaseModel):
    body: str


# ---------------- uploads ----------------

class UploadOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    companyId: int = Field(validation_alias="company_id")
    filename: str
    sizeBytes: int = Field(validation_alias="size_bytes")
    year: int | None
    status: str
    extracted: dict[str, Any]
    extractionNote: str | None = Field(validation_alias="extraction_note")
    usedAi: bool = Field(validation_alias="used_ai")
    createdAt: datetime = Field(validation_alias="created_at")


# ---------------- chat ----------------

class ChatMessageIn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatIn(BaseModel):
    companyId: int | None = None
    companyName: str | None = None
    year: int | None = None
    messages: list[ChatMessageIn]


class ChatOut(BaseModel):
    id: str
    role: Literal["assistant"] = "assistant"
    content: str
    createdAt: str
    citations: list[str] = []
    usedAi: bool = False
    companyId: int | None = None
    companyName: str | None = None
