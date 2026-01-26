# app/routes/operacion.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.ies import IES
from app.models.catalogo import EvidenciaItem
from app.models.operacion import EvidenciaRegistro
from app.schemas.operacion import EvidenciaUpdate as EvidenciaPatch

from app.core.deps import require_admin, require_ies_user
from app.models.usuarios import Usuario

router = APIRouter(prefix="/operacion", tags=["Operación"])


def _build_evidencias_out(ies_id: int, ies_slug: str, submodulo_id: int, db: Session):
    evidencias = (
        db.query(EvidenciaItem)
        .filter(EvidenciaItem.submodulo_id == submodulo_id)
        .order_by(EvidenciaItem.orden.asc())
        .all()
    )
    if not evidencias:
        raise HTTPException(
            status_code=404,
            detail=f"No hay evidencias en el catálogo para submodulo_id={submodulo_id}",
        )

    evidencia_ids = [e.id for e in evidencias]
    registros = (
        db.query(EvidenciaRegistro)
        .filter(EvidenciaRegistro.ies_id == ies_id)
        .filter(EvidenciaRegistro.evidencia_id.in_(evidencia_ids))
        .all()
    )
    reg_by_evid = {r.evidencia_id: r for r in registros}

    out = []
    for e in evidencias:
        r = reg_by_evid.get(e.id)
        out.append(
            {
                "evidencia_id": e.id,
                "submodulo_id": e.submodulo_id,
                "orden": e.orden,
                "titulo": e.titulo,
                "registro_id": r.id if r else None,
                "ies_id": ies_id,
                "ies_slug": ies_slug,
                "presenta": bool(r.presenta) if r else False,
                "valoracion": int(r.valoracion) if (r and r.valoracion is not None) else 0,
                "responsable": r.responsable if r else None,
                "fecha_inicio": r.fecha_inicio.isoformat() if (r and r.fecha_inicio) else None,
                "fecha_fin": r.fecha_fin.isoformat() if (r and r.fecha_fin) else None,
                "avance_pct": int(r.avance_pct) if (r and r.avance_pct is not None) else 0,
                "categoria_si_no": r.categoria_si_no if r else None,
                "extra_data": r.extra_data if (r and r.extra_data) else {},
                "updated_at": r.updated_at.isoformat() if (r and r.updated_at) else None,
            }
        )
    return out


# -------------------------
# (A) ADMIN: usa ies_slug
# -------------------------
@router.get("/ies/{ies_slug}/submodulos/{submodulo_id}/evidencias")
def evidencias_por_submodulo_admin(
    ies_slug: str,
    submodulo_id: int,
    db: Session = Depends(get_db),
    _admin: Usuario = Depends(require_admin),
):
    ies = db.query(IES).filter(IES.slug == ies_slug).first()
    if not ies:
        raise HTTPException(status_code=404, detail=f"IES no encontrada: {ies_slug}")

    return _build_evidencias_out(ies.id, ies.slug, submodulo_id, db)


@router.patch("/ies/{ies_slug}/evidencias/{evidencia_id}")
def patch_evidencia_admin(
    ies_slug: str,
    evidencia_id: int,
    payload: EvidenciaPatch,
    db: Session = Depends(get_db),
    _admin: Usuario = Depends(require_admin),
):
    ies = db.query(IES).filter(IES.slug == ies_slug).first()
    if not ies:
        raise HTTPException(status_code=404, detail=f"IES no encontrada: {ies_slug}")

    reg = (
        db.query(EvidenciaRegistro)
        .filter(EvidenciaRegistro.ies_id == ies.id)
        .filter(EvidenciaRegistro.evidencia_id == evidencia_id)
        .first()
    )

    if not reg:
        reg = EvidenciaRegistro(ies_id=ies.id, evidencia_id=evidencia_id)
        db.add(reg)

    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(reg, k, v)

    try:
        db.commit()
        db.refresh(reg)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error guardando evidencia: {str(e)}")

    return {"ok": True, "registro_id": reg.id, "updated_at": reg.updated_at.isoformat() if reg.updated_at else None}


# -------------------------
# (B) IES USER: NO usa selector, ies sale del token
# -------------------------
@router.get("/submodulos/{submodulo_id}/evidencias")
def evidencias_por_submodulo_ies(
    submodulo_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(require_ies_user),
):
    ies = db.query(IES).filter(IES.id == user.ies_id).first()
    if not ies:
        raise HTTPException(status_code=404, detail="IES no encontrada para el usuario")

    return _build_evidencias_out(ies.id, ies.slug, submodulo_id, db)


@router.patch("/evidencias/{evidencia_id}")
def patch_evidencia_ies(
    evidencia_id: int,
    payload: EvidenciaPatch,
    db: Session = Depends(get_db),
    user: Usuario = Depends(require_ies_user),
):
    ies_id = user.ies_id

    reg = (
        db.query(EvidenciaRegistro)
        .filter(EvidenciaRegistro.ies_id == ies_id)
        .filter(EvidenciaRegistro.evidencia_id == evidencia_id)
        .first()
    )

    if not reg:
        reg = EvidenciaRegistro(ies_id=ies_id, evidencia_id=evidencia_id)
        db.add(reg)

    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(reg, k, v)

    try:
        db.commit()
        db.refresh(reg)
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Error guardando evidencia: {str(e)}")

    return {"ok": True, "registro_id": reg.id, "updated_at": reg.updated_at.isoformat() if reg.updated_at else None}
