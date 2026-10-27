import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import seed_default_admin
from app.config import settings
from app.database import Base, SessionLocal, engine
from app.routers import auth, chat, companies, meta, reports, uploads
from app.services.ai_service import ai_status

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("esg")

app = FastAPI(
    title="Verdant ESG API",
    version="1.0.0",
    description=(
        "Backend for ESG reporting against India's BRSR and the EU's CSRD/ESRS. "
        "Interactive docs at /docs."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth.router, companies.router, uploads.router, reports.router, chat.router, meta.router):
    app.include_router(r)


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(engine)
    db = SessionLocal()
    try:
        seed_default_admin(db)
    finally:
        db.close()

    status = ai_status()
    log.info("Database: %s", settings.database_url.split("://")[0])
    if status["enabled"]:
        log.info("AI: Gemini (%s)", status["model"])
    else:
        log.warning(
            "AI: no GEMINI_API_KEY — AI endpoints return deterministic templates. "
            "Free key: https://aistudio.google.com/app/apikey"
        )


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "database": settings.database_url.split("://")[0],
        "ai": ai_status(),
    }
