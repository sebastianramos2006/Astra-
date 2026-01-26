# app/routes/auth.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.usuarios import Usuario
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

    token = create_access_token(
        data={
            "sub": str(user.id),
            "rol": user.rol,
            "ies_id": user.ies_id,
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
            "email": user.email,
            "username": user.username,
        },
    }
