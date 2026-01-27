# app/routes/auth.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.usuarios import Usuario
from app.models.ies import IES  # ✅ AJUSTA ESTA RUTA SI TU MODELO SE LLAMA DISTINTO
from app.core.security import verify_password, create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginIn(BaseModel):
    email: str
    password: str


@router.post("/login")
def login(payload: LoginIn, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()

    user = db.query(Usuario).filter(Usuario.email == email).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    # ✅ Resolver ies_slug/ies_nombre desde DB
    ies_slug = None
    ies_nombre = None
    if user.ies_id:
        ies = db.query(IES).filter(IES.id == user.ies_id).first()
        if ies:
            ies_slug = ies.slug
            ies_nombre = ies.nombre

    token = create_access_token(
        data={
            "sub": str(user.id),
            "rol": user.rol,
            "ies_id": user.ies_id,
            "ies_slug": ies_slug,         # ✅ CLAVE
            "ies_nombre": ies_nombre,     # ✅ CLAVE (opcional pero recomendado)
            "email": user.email,
        }
    )

    return {
        "ok": True,
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "rol": user.rol,
            "ies_id": user.ies_id,
            "ies_slug": ies_slug,         # ✅ útil para debug
            "email": user.email,
            "username": user.username,
        },
    }
