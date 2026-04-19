from __future__ import annotations

import logging
import secrets
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


logger = logging.getLogger(__name__)

BACKEND_DIR = Path(__file__).resolve().parents[1]

DEFAULT_DEV_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:4173",
    "http://127.0.0.1:4173",
    "http://localhost:8000",
    "http://127.0.0.1:8000",
]
WEAK_SECRET_KEY_VALUES = {
    "123",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    app_env: str = Field(default="development", validation_alias="VIDQUERY_ENV")
    google_api_key: str = Field(default="", validation_alias="GOOGLE_API_KEY")
    secret_key: str = Field(default="", validation_alias="SECRET_KEY")
    cors_origins: str = Field(default="", validation_alias="CORS_ORIGINS")
    algorithm: str = Field(default="HS256", validation_alias="ALGORITHM")
    access_token_expire_hours: int = Field(
        default=72,
        validation_alias="ACCESS_TOKEN_EXPIRE_HOURS",
    )
    session_cookie_name: str = Field(
        default="vq_access_token",
        validation_alias="SESSION_COOKIE_NAME",
    )

    @field_validator("app_env")
    @classmethod
    def normalize_app_env(cls, value: str) -> str:
        return value.strip().lower() or "development"

    @field_validator("google_api_key", "secret_key", "cors_origins", "algorithm")
    @classmethod
    def strip_string_settings(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def resolve_secret_key(self) -> "Settings":
        if self.secret_key and self.secret_key not in WEAK_SECRET_KEY_VALUES:
            return self

        if self.is_production:
            raise RuntimeError(
                "SECRET_KEY must be set to a strong value when VIDQUERY_ENV=production."
            )

        logger.warning(
            "Using an ephemeral development SECRET_KEY. "
            "Set SECRET_KEY in backend/.env to keep sessions stable across restarts."
        )
        self.secret_key = secrets.token_urlsafe(32)
        return self

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def cookie_secure(self) -> bool:
        return self.is_production

    @property
    def cookie_max_age_seconds(self) -> int:
        return self.access_token_expire_hours * 60 * 60

    @property
    def allowed_cors_origins(self) -> list[str]:
        if not self.cors_origins:
            return DEFAULT_DEV_CORS_ORIGINS.copy()

        parsed_origins = [
            origin.strip().rstrip("/")
            for origin in self.cors_origins.split(",")
            if origin.strip()
        ]
        return parsed_origins or DEFAULT_DEV_CORS_ORIGINS.copy()

    @property
    def google_api_key_configured(self) -> bool:
        return bool(self.google_api_key)

    def require_google_api_key(self) -> str:
        if not self.google_api_key:
            raise RuntimeError(
                "GOOGLE_API_KEY is not configured. Set GOOGLE_API_KEY in backend/.env."
            )
        return self.google_api_key


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
