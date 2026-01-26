# app/schemas/operacion.py
from pydantic import BaseModel, Field
from typing import Optional
from datetime import date

class EvidenciaUpdate(BaseModel):
    presenta: Optional[bool] = None
    valoracion: Optional[int] = Field(default=None, ge=0, le=100)
    responsable: Optional[str] = None
    fecha_inicio: Optional[date] = None
    fecha_fin: Optional[date] = None
    avance_pct: Optional[int] = Field(default=None, ge=0, le=100)
    categoria_si_no: Optional[bool] = None
