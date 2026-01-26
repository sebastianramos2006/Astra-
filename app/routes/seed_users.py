import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.security import hash_password
from app.models.usuarios import Usuario
from app.models.ies import IES  # ajusta si tu modelo se llama distinto

router = APIRouter(prefix="/seed", tags=["seed"])

class SeedIesUserIn(BaseModel):
    ies_slug: str
    email: str
    password: str
    username: str | None = None
    rol: str = "ies"

@router.post("/ies-user")
def seed_ies_user(payload: SeedIesUserIn, db: Session = Depends(get_db)):
    if os.getenv("ENV", "local") != "local":
        return {"ok": False, "detail": "disabled"}

    ies = db.query(IES).filter(IES.slug == payload.ies_slug).first()
    if not ies:
        raise HTTPException(status_code=404, detail="IES no encontrada")

    email = payload.email.lower().strip()
    exists = db.query(Usuario).filter(Usuario.email == email).first()
    if exists:
        return {"ok": True, "detail": "user exists", "email": email, "ies_id": ies.id}

    u = Usuario(
        email=email,
        username=(payload.username or email.split("@")[0]),
        password_hash=hash_password(payload.password),
        rol=payload.rol,
        ies_id=ies.id,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return {"ok": True, "id": u.id, "email": u.email, "ies_id": ies.id, "rol": u.rol}
