# app/schemas/form_config.py
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field


class FormConfigOut(BaseModel):
    id: int
    submodulo_id: int
    version: int
    is_active: bool
    columns_json: List[Dict[str, Any]] = Field(default_factory=list)

    class Config:
        from_attributes = True


class FormConfigCreate(BaseModel):
    # lista de objetos (no "string")
    columns_json: List[Dict[str, Any]] = Field(default_factory=list)
