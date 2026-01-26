# app/routes/seed_admin.py
import os
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.security import hash_password
from app.models.usuarios import Usuario

router = APIRouter(prefix="/seed", tags=["seed"])


@router.post("/admin")
def seed_admin(db: Session = Depends(get_db)):
    # Solo local
    if os.getenv("ENV", "local") != "local":
        return {"ok": False, "detail": "disabled"}

    email = "admin@astra.cedepro.com".lower()
    password = "Admin123*"
    username = "admin"

    exists = db.query(Usuario).filter(Usuario.email == email).first()
    if exists:
        return {"ok": True, "detail": "admin exists", "email": email}

    u = Usuario(
        email=email,
        username=username,
        password_hash=hash_password(password),
        rol="admin",       # ✅ correcto
        ies_id=None,
        is_active=True,
    )
    db.add(u)
    db.commit()
    db.refresh(u)

    return {"ok": True, "email": email, "password": password, "id": u.id}
