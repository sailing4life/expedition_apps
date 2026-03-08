from functools import lru_cache
import os

from pydantic import BaseModel


class Settings(BaseModel):
    cors_origins: list[str]


@lru_cache
def get_settings() -> Settings:
    default_origins = ",".join(
        [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:3001",
            "http://127.0.0.1:3001",
        ]
    )
    raw_origins = os.getenv("CORS_ORIGINS", default_origins)
    origins = [origin.strip() for origin in raw_origins.split(",") if origin.strip()]
    return Settings(cors_origins=origins or default_origins.split(","))
