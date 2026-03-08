from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.apps import router as apps_router
from app.core.config import get_settings


settings = get_settings()

app = FastAPI(
    title="Expedition Apps API",
    version="0.1.0",
    summary="Backend for migrated expedition marine processing tools.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(apps_router, prefix="/api")


@app.get("/health")
def healthcheck() -> dict[str, str]:
    return {"status": "ok"}

