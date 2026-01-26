# app/services/seed_operativo.py
from sqlalchemy.orm import Session
from sqlalchemy import text

def ensure_seed_operativo(db: Session, ies_id: int) -> None:
    db.execute(
        text("""
        INSERT INTO evidencia_registro (ies_id, evidencia_id)
        SELECT :ies_id, ei.id
        FROM evidencia_item ei
        ON CONFLICT (ies_id, evidencia_id) DO NOTHING
        """),
        {"ies_id": ies_id},
    )
    db.commit()
