# app/schemas/resumen.py
from typing import Optional
from pydantic import BaseModel


class ResumenSubmoduloOut(BaseModel):
    ies_slug: str
    submodulo_id: int

    evidencias_total: int
    avance_promedio: float
    valoracion_promedio: float

    fecha_inicio_min: Optional[str] = None
    fecha_fin_max: Optional[str] = None

    evidencias_presenta: int
    categoria_si: int
    categoria_no: int
    categoria_null: int
