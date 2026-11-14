"""Application Configuration for TimeSafe Feature Pipeline."""
import os
from typing import List


class Settings:
    PROJECT_NAME: str = os.getenv("PROJECT_NAME", "TimeSafe Feature Pipeline")
    VERSION: str = "0.1.0"
    API_V1_STR: str = "/api"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DEBUG: bool = os.getenv("DEBUG", "True").lower() in ("true", "1")

    # Database
    DATABASE_URL: str = os.getenv("DATABASE_URL", "")

    # Storage paths
    BASE_DIR: str = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    DATA_DIR: str = os.path.join(BASE_DIR, "data")
    RAW_DATA_DIR: str = os.path.join(DATA_DIR, "raw")
    QUARANTINE_DATA_DIR: str = os.path.join(DATA_DIR, "quarantine")
    OUTPUT_DATA_DIR: str = os.path.join(DATA_DIR, "output")
    REPORTS_DIR: str = os.path.join(BASE_DIR, "reports")

    # CORS
    CORS_ORIGINS: List[str] = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000",
        ).split(",")
        if origin.strip()
    ]


settings = Settings()

