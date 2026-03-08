from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Literal, Optional, Union

from pydantic import BaseModel, Field


FieldType = Literal["text", "textarea", "number", "select", "checkbox", "file", "date", "time"]


class AppFieldOption(BaseModel):
    label: str
    value: str


class AppField(BaseModel):
    key: str
    label: str
    type: FieldType
    required: bool = True
    placeholder: Optional[str] = None
    help_text: Optional[str] = None
    default: Optional[Union[str, float, int]] = None
    options: list[AppFieldOption] = Field(default_factory=list)
    accept: Optional[str] = None
    multiple: bool = False
    min_value: Optional[Union[float, int]] = None
    max_value: Optional[Union[float, int]] = None
    step: Optional[Union[float, int]] = None


class ToolAppSummary(BaseModel):
    slug: str
    title: str
    summary: str
    status: Literal["ready", "migration", "planned"]
    tags: list[str] = Field(default_factory=list)


class ToolAppDetail(ToolAppSummary):
    description: str
    fields: list[AppField] = Field(default_factory=list)


class ToolRunRequest(BaseModel):
    values: dict[str, Any] = Field(default_factory=dict)


class ToolRunResponse(BaseModel):
    app_slug: str
    app_title: str
    status: Literal["success"]
    message: str
    summary: str
    outputs: Mapping[str, Any]
