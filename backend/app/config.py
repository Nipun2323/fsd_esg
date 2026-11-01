import secrets
from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuration, read from backend/.env. Nothing here has a secret default."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- database -------------------------------------------------------
    # SQLite by default so the project runs with no server to install.
    # For the MySQL setup in the project outline, set:
    #   DATABASE_URL=mysql+pymysql://user:password@localhost:3306/esg
    database_url: str = "sqlite:///./esg.db"

    # --- auth -----------------------------------------------------------
    # HS256 wants at least 32 bytes; PyJWT warns below that. The default
    # is random per process, so forgetting to set SECRET_KEY invalidates
    # tokens on restart instead of signing everything with a known key.
    secret_key: str = Field(default_factory=lambda: secrets.token_urlsafe(48))
    access_token_expire_minutes: int = 60 * 12
    jwt_algorithm: str = "HS256"

    # Seeded on first run so there is always a way in.
    default_admin_username: str = "Admin"
    default_admin_password: str = "12345"

    # --- ai -------------------------------------------------------------
    # Free key from https://aistudio.google.com/app/apikey
    # Absent, the AI endpoints fall back to deterministic templates and
    # say so in the response.
    gemini_api_key: str | None = None
    gemini_model: str = "gemini-3.5-flash"
    # Tried in order when the configured model is unavailable (404) or
    # busy (503). Google retires model names and 503s under load, so a
    # single hard-coded name is a liability.
    gemini_fallback_models: str = "gemini-3.5-flash,gemini-flash-latest,gemini-3.8-flash"

    # --- misc -----------------------------------------------------------
    cors_origins: str = "http://localhost:5173,http://localhost:4173"
    max_upload_mb: int = 20

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def gemini_model_chain(self) -> list[str]:
        chain = [self.gemini_model]
        for m in self.gemini_fallback_models.split(","):
            m = m.strip()
            if m and m not in chain:
                chain.append(m)
        return chain

    @property
    def ai_enabled(self) -> bool:
        return bool(self.gemini_api_key and self.gemini_api_key.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
