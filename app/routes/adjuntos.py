# app/routes/adjuntos.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import select, delete

from app.db.session import get_db
from app.models.adjuntos import EvidenciaAdjunto
from app.models.operacion import EvidenciaRegistro  # este sí debe existir en operacion.py
from app.schemas.adjuntos import AdjuntoCreate, AdjuntoOut


router = APIRouter(prefix="/adjuntos", tags=["Adjuntos"])


@router.get("/registro/{registro_id}", response_model=list[AdjuntoOut])
def list_adjuntos(registro_id: int, db: Session = Depends(get_db)):
    # Si el registro no existe, 404 (evitas 500)
    reg = db.execute(select(EvidenciaRegistro).where(EvidenciaRegistro.id == registro_id)).scalar_one_or_none()
    if reg is None:
        raise HTTPException(status_code=404, detail="registro_id no existe")

    stmt = select(EvidenciaAdjunto).where(EvidenciaAdjunto.registro_id == registro_id).order_by(EvidenciaAdjunto.id.asc())
    return list(db.execute(stmt).scalars().all())


@router.post("/registro/{registro_id}", response_model=AdjuntoOut)
def add_adjunto(registro_id: int, payload: AdjuntoCreate, db: Session = Depends(get_db)):
    reg = db.execute(select(EvidenciaRegistro).where(EvidenciaRegistro.id == registro_id)).scalar_one_or_none()
    if reg is None:
        raise HTTPException(status_code=404, detail="registro_id no existe")

    obj = EvidenciaAdjunto(
        registro_id=registro_id,
        url=payload.url,
        nombre=payload.nombre,
        mime_type=payload.mime_type,
        size_bytes=payload.size_bytes,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/{adjunto_id}")
def delete_adjunto(adjunto_id: int, db: Session = Depends(get_db)):
    obj = db.execute(select(EvidenciaAdjunto).where(EvidenciaAdjunto.id == adjunto_id)).scalar_one_or_none()
    if obj is None:
        raise HTTPException(status_code=404, detail="adjunto_id no existe")

    db.execute(delete(EvidenciaAdjunto).where(EvidenciaAdjunto.id == adjunto_id))
    db.commit()
    return {"deleted": True, "adjunto_id": adjunto_id}
