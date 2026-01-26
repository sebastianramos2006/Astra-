from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.deps import get_db, require_admin
from app.models.usuarios import Usuario
from app.models.ies import IES

router = APIRouter(prefix="/admin", tags=["Admin IES"])

@router.delete("/ies/{ies_id}")
def admin_delete_ies(
    ies_id: int,
    db: Session = Depends(get_db),
    _admin: Usuario = Depends(require_admin),
):
    ies = db.get(IES, ies_id)
    if not ies:
        raise HTTPException(status_code=404, detail="IES no existe")

    # 1) borrar usuarios de esa IES (por si no hay cascade real en DB)
    db.query(Usuario).filter(Usuario.ies_id == ies_id).delete(synchronize_session=False)

    # 2) borrar la IES
    db.delete(ies)
    db.commit()

    return {"ok": True, "deleted_ies_id": ies_id}
