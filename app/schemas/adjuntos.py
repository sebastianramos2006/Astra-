# app/schemas/adjuntos.py
from pydantic import BaseModel
from typing import Optional


class AdjuntoCreate(BaseModel):
    url: str
    nombre: Optional[str] = None
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None


class AdjuntoOut(BaseModel):
    id: int
    registro_id: int
    url: str
    nombre: Optional[str] = None
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None

    class Config:
        from_attributes = True
