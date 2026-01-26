# app/core/deps.py
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.security import decode_token
from app.models.usuarios import Usuario

security = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> Usuario:
    if not creds or not creds.credentials:
        raise HTTPException(status_code=401, detail="No autenticado")

    token = creds.credentials
    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token sin 'sub'")

    user = db.query(Usuario).filter(Usuario.id == int(user_id)).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Usuario no válido/inactivo")

    return user


def require_admin(user: Usuario = Depends(get_current_user)) -> Usuario:
    if (user.rol or "").lower() != "admin":
        raise HTTPException(status_code=403, detail="Requiere rol admin")
    return user


def require_ies_user(user: Usuario = Depends(get_current_user)) -> Usuario:
    """
    Usuario de una IES (cliente).
    Compatibilidad: aceptamos 'ies' (nuevo) y 'cliente' (legado).
    """
    rol = (user.rol or "").lower()
    if rol not in ("ies", "cliente"):
        raise HTTPException(status_code=403, detail="Requiere rol cliente (IES)")

    if user.ies_id is None:
        raise HTTPException(status_code=403, detail="Usuario no tiene IES asignada")

    return user
