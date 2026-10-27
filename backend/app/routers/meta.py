from fastapi import APIRouter

from app.catalogue import (
    BRSR_CORE_ATTRIBUTES,
    EMISSION_FACTORS,
    ESRS_STANDARDS,
    METRICS,
    NGRBC_PRINCIPLES,
)
from app.services.ai_service import ai_status

router = APIRouter(prefix="/api/meta", tags=["meta"])


@router.get("/metrics")
def metrics() -> dict:
    """The canonical metric catalogue. The frontend mirrors these keys."""
    return {"metrics": METRICS, "factors": EMISSION_FACTORS}


@router.get("/frameworks")
def frameworks() -> dict:
    return {
        "brsr": {"principles": NGRBC_PRINCIPLES, "coreAttributes": BRSR_CORE_ATTRIBUTES},
        "csrd": {"standards": ESRS_STANDARDS},
    }


@router.get("/ai")
def ai() -> dict:
    return ai_status()
