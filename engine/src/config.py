"""Application configuration — loaded from environment variables."""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Engine configuration.

    All values are read from environment variables (or .env file).
    """

    port: int = 8000
    host: str = "0.0.0.0"  # noqa: S104
    log_level: str = "info"
    engine_hmac_secret: str = ""
    sentry_dsn: str = ""

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
