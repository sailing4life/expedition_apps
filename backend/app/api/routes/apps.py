from typing import Any

from fastapi import APIRouter, HTTPException, Request, UploadFile
from starlette.datastructures import UploadFile as StarletteUploadFile

from app.models.apps import ToolAppDetail, ToolAppSummary, ToolRunRequest, ToolRunResponse
from app.processors.base import UploadedInputFile
from app.services.app_registry import get_app, list_apps


router = APIRouter(tags=["apps"])


async def build_processor_payload(request: Request) -> dict[str, Any]:
    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" not in content_type:
        payload = ToolRunRequest.model_validate(await request.json())
        return payload.values

    form = await request.form()
    values: dict[str, Any] = {}

    for key, value in form.multi_items():
        if isinstance(value, (UploadFile, StarletteUploadFile)):
            data = await value.read()
            upload = UploadedInputFile(
                field_name=key,
                filename=value.filename or "upload.bin",
                content_type=value.content_type,
                data=data,
            )
            if key in values:
                existing = values[key]
                if isinstance(existing, list):
                    existing.append(upload)
                else:
                    values[key] = [existing, upload]
            else:
                values[key] = upload
            continue

        if key in values:
            existing = values[key]
            if isinstance(existing, list):
                existing.append(value)
            else:
                values[key] = [existing, value]
        else:
            values[key] = value

    return values


@router.get("/apps", response_model=list[ToolAppSummary])
def get_apps() -> list[ToolAppSummary]:
    return [
        ToolAppSummary(
            slug=app.slug,
            title=app.title,
            summary=app.summary,
            status=app.status,
            tags=app.tags,
        )
        for app in list_apps()
    ]


@router.get("/apps/{slug}", response_model=ToolAppDetail)
def get_app_detail(slug: str) -> ToolAppDetail:
    registered = get_app(slug)
    if registered is None:
        raise HTTPException(status_code=404, detail="App not found")
    return registered.detail


@router.post("/apps/{slug}/run", response_model=ToolRunResponse)
async def run_app(slug: str, request: Request) -> ToolRunResponse:
    registered = get_app(slug)
    if registered is None:
        raise HTTPException(status_code=404, detail="App not found")

    try:
        result = registered.processor(await build_processor_payload(request))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return ToolRunResponse(
        app_slug=registered.detail.slug,
        app_title=registered.detail.title,
        status="success",
        message=str(result["message"]),
        summary=str(result["summary"]),
        outputs=result["outputs"],
    )
