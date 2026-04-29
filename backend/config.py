from functools import lru_cache
from typing import Literal

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
	"""Application settings loaded from environment variables."""

	model_config = SettingsConfigDict(
		env_file=".env",
		env_file_encoding="utf-8",
		case_sensitive=False,
		extra="ignore",
	)

	app_name: str = "Farsight Analytics"
	environment: Literal["development", "staging", "production", "test"] = "development"
	debug: bool = False

	# Riot API
	riot_api_key: SecretStr
	riot_region: str = "americas"
	riot_platform: str = "na1"

	# Data stores
	database_url: str
	redis_url: str = "redis://redis:6379/0"

	# Celery defaults to Redis if explicit values are not provided
	celery_broker_url: str | None = None
	celery_result_backend: str | None = None

	# API options
	api_v1_prefix: str = "/api/v1"
	frontend_origin: str = "http://localhost:3000"

	@field_validator("database_url")
	@classmethod
	def validate_database_url(cls, value: str) -> str:
		if not value.startswith(("postgresql://", "postgresql+asyncpg://")):
			raise ValueError("DATABASE_URL must be a PostgreSQL URL")
		return value

	@field_validator("debug", mode="before")
	@classmethod
	def normalize_debug_flag(cls, value: object) -> object:
		if isinstance(value, str):
			normalized = value.strip().lower()
			if normalized in {"release", "prod", "production"}:
				return False
			if normalized in {"dev", "development"}:
				return True
		return value

	@property
	def sync_database_url(self) -> str:
		"""Sync DB URL for tools/drivers that do not support asyncpg dialect."""
		return self.database_url.replace("+asyncpg", "")

	@property
	def effective_celery_broker_url(self) -> str:
		return self.celery_broker_url or self.redis_url

	@property
	def effective_celery_result_backend(self) -> str:
		return self.celery_result_backend or self.redis_url


@lru_cache(maxsize=1)
def get_settings() -> Settings:
	"""Return cached settings instance so env is parsed once per process."""
	return Settings()


settings = get_settings()


if __name__ == "__main__":
	# Quick local check to verify env variables are loading correctly.
	print("Settings loaded successfully")
	print(f"app_name={settings.app_name}")
	print(f"environment={settings.environment}")
	print(f"debug={settings.debug}")
	print(f"riot_api_key_set={bool(settings.riot_api_key.get_secret_value())}")
	print(f"riot_region={settings.riot_region}")
	print(f"riot_platform={settings.riot_platform}")
	print(f"database_url={settings.database_url}")
	print(f"redis_url={settings.redis_url}")
	print(f"celery_broker_url={settings.effective_celery_broker_url}")
	print(f"celery_result_backend={settings.effective_celery_result_backend}")
	print(f"api_v1_prefix={settings.api_v1_prefix}")
	print(f"frontend_origin={settings.frontend_origin}")
