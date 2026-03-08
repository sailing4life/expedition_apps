from __future__ import annotations

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from typing import Any

from app.models.apps import ToolAppDetail


ProcessorFn = Callable[[dict[str, Any]], Mapping[str, Any]]


@dataclass(frozen=True)
class UploadedInputFile:
    field_name: str
    filename: str
    content_type: str | None
    data: bytes


@dataclass(frozen=True)
class RegisteredApp:
    detail: ToolAppDetail
    processor: ProcessorFn
