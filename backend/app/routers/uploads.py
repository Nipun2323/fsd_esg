from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import ensure_company_access, get_current_user
from app.config import settings
from app.database import get_db
from app.models import Company, EsgDataset, Upload, User
from app.schemas import UploadOut
from app.services.ai_service import extract_metrics
from app.services.extract import extract_text

router = APIRouter(prefix="/api/uploads", tags=["uploads"])


@router.post("", response_model=UploadOut, status_code=201)
async def upload_report(
    company_id: int = Form(...),
    year: int = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UploadOut:
    """
    Take a company's own report, pull the ESG figures out of it, and
    merge them into that company's dataset for the year.

    Extraction never invents a value: a metric the document does not
    state is omitted, not zeroed.
    """
    ensure_company_access(user, company_id)
    company = db.get(Company, company_id)
    if company is None:
        raise HTTPException(status_code=404, detail="Company not found")

    data = await file.read()
    limit = settings.max_upload_mb * 1024 * 1024
    if len(data) > limit:
        raise HTTPException(
            status_code=413,
            detail=f"File is {len(data) / 1e6:.1f} MB; the limit is {settings.max_upload_mb} MB",
        )
    if not data:
        raise HTTPException(status_code=400, detail="That file is empty")

    record = Upload(
        company_id=company_id,
        filename=file.filename or "upload",
        content_type=file.content_type,
        size_bytes=len(data),
        year=year,
        status="pending",
    )
    db.add(record)
    db.flush()

    text, err = extract_text(data, record.filename, file.content_type)
    if err or not text.strip():
        record.status = "failed"
        record.extraction_note = err or "No readable text found in the document."
        db.commit()
        db.refresh(record)
        raise HTTPException(status_code=422, detail=record.extraction_note)

    result = extract_metrics(text, company.name, year)
    values = result["values"]

    record.status = "parsed"
    record.extracted = values
    record.extraction_note = result["note"]
    record.used_ai = result["used_ai"]

    if values:
        ds = db.scalar(
            select(EsgDataset).where(
                EsgDataset.company_id == company_id, EsgDataset.year == year
            )
        )
        if ds is None:
            db.add(
                EsgDataset(company_id=company_id, year=year, values=values, source="upload")
            )
        else:
            # Extracted figures fill gaps and refresh what they cover;
            # anything the document is silent on is left alone.
            ds.values = {**ds.values, **values}
            ds.source = "upload"
            ds.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(record)
    return UploadOut.model_validate(record)


@router.get("/company/{company_id}", response_model=list[UploadOut])
def list_uploads(
    company_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[UploadOut]:
    ensure_company_access(user, company_id)
    rows = db.scalars(
        select(Upload)
        .where(Upload.company_id == company_id)
        .order_by(Upload.created_at.desc())
        .limit(50)
    ).all()
    return [UploadOut.model_validate(r) for r in rows]
