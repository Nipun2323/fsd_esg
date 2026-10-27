from functools import lru_cache
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
    # Override in .env for anything other than local development.
    secret_key: str = "dev-only-change-me"
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
    gemini_model: str = "gemini-2.5-flash"

    # --- misc -----------------------------------------------------------
    cors_origins: str = "http://localhost:5173,http://localhost:4173"
    max_upload_mb: int = 20

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def ai_enabled(self) -> bool:
        return bool(self.gemini_api_key and self.gemini_api_key.strip())


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
