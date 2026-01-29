from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.deps import get_current_user, get_db
from app.core.security import verify_password, hash_password

router = APIRouter(tags=["auth"])

class ChangePasswordIn(BaseModel):
    current_password: str
    new_password: str

@router.patch("/auth/me/password")
def change_my_password(
    payload: ChangePasswordIn,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Clave actual incorrecta.")

    if not payload.new_password or len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="La nueva clave debe tener al menos 8 caracteres.")

    if verify_password(payload.new_password, user.password_hash):
        raise HTTPException(status_code=400, detail="La nueva clave no puede ser igual a la actual.")

    user.password_hash = hash_password(payload.new_password)

    db.add(user)
    db.commit()
    db.refresh(user)

    return {"ok": True}
