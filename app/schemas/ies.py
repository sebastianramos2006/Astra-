# app/schemas/ies.py
from pydantic import BaseModel, EmailStr
from typing import Optional

class IESCreate(BaseModel):
    # Datos IES
    nombre: str
    slug: str

    # Si vienen, se crea usuario IES al mismo tiempo
    email: Optional[EmailStr] = None
    password: Optional[str] = None
