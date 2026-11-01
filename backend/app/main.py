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

# A literal "*" in allow_origins is not usable together with
# allow_credentials: Starlette then sends `Access-Control-Allow-Origin: *`
# alongside `Access-Control-Allow-Credentials: true`, and browsers reject
# that pair, so every cross-origin request fails. Matching on a regex makes
# Starlette echo the caller's origin instead, which is valid.
_origins = settings.cors_origin_list
if "*" in _origins:
    log.warning(
        "CORS_ORIGINS is '*' — every origin is accepted. Set it to the "
        "frontend's exact origin before this is public."
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origin_regex=".*",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_origins,
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
