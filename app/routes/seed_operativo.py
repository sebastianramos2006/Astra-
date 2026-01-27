# app/routes/seed_operativo.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.db.session import get_db

router = APIRouter(prefix="/seed-operativo", tags=["Seed Operativo"])


def ensure_seed_operativo(db: Session, ies_id: int):
    db.execute(
        text("""
        INSERT INTO evidencia_registro (ies_id, evidencia_id)
        SELECT :ies_id, ei.id
        FROM evidencia_item ei
        ON CONFLICT (ies_id, evidencia_id) DO NOTHING
        """),
        {"ies_id": ies_id}
    )
    db.commit()


@router.post("/ies/{ies_slug}")
def seed_operativo_por_ies(ies_slug: str, db: Session = Depends(get_db)):
    ies = db.execute(
        text("SELECT id, slug, nombre FROM ies WHERE slug=:slug"),
        {"slug": ies_slug}
    ).mappings().first()

    if not ies:
        raise HTTPException(status_code=404, detail="IES no existe")

    ensure_seed_operativo(db, ies["id"])
    return {"ok": True, "ies_slug": ies["slug"], "msg": "Seed operativo creado/actualizado"}
@router.get("/debug/encoding")
def debug_encoding():
    return {"test": "Ética y transparencia – ñ á é í ó ú"}
