# app/routes/admin_usuarios.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import require_admin
from app.models.usuarios import Usuario

# OJO: si tu get_db NO está aquí, cambia el import al que uses en otros routes.
from app.db.session import get_db

router = APIRouter(prefix="/admin", tags=["Admin Users"])


@router.get("/ies/{ies_id}/usuarios")
def admin_listar_usuarios_por_ies(
    ies_id: int,
    _admin: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    users = db.query(Usuario).filter(Usuario.ies_id == ies_id).order_by(Usuario.id.asc()).all()
    return [
        {
            "id": int(u.id),
            "ies_id": u.ies_id,
            "username": u.username,
            "email": u.email,
            "rol": u.rol,
            "is_active": u.is_active,
            "created_at": u.created_at,
        }
        for u in users
    ]


@router.delete("/usuarios/{user_id}")
def admin_eliminar_usuario(
    user_id: int,
    _admin: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    u = db.query(Usuario).filter(Usuario.id == user_id).first()
    if not u:
        raise HTTPException(status_code=404, detail="Usuario no existe.")

    # 🔒 protección: no borrar admins
    if (u.rol or "").lower() == "admin":
        raise HTTPException(status_code=400, detail="No se puede eliminar un usuario admin.")

    db.delete(u)
    db.commit()
    return {"ok": True, "deleted_user_id": int(user_id)}


@router.delete("/ies/{ies_id}/usuarios")
def admin_eliminar_usuarios_de_ies(
    ies_id: int,
    _admin: Usuario = Depends(require_admin),
    db: Session = Depends(get_db),
):
    # Borra TODOS los usuarios de esa IES excepto admins (por si existiera alguno)
    q = db.query(Usuario).filter(Usuario.ies_id == ies_id).filter(Usuario.rol != "admin")
    count = q.count()
    q.delete(synchronize_session=False)
    db.commit()
    return {"ok": True, "deleted_count": int(count), "ies_id": int(ies_id)}
