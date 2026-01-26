# -*- coding: utf-8 -*-

# app/routes/catalogo.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.db.session import get_db

router = APIRouter(prefix="/catalogo", tags=["Catálogo"])

@router.get("/subprogramas")
def subprogramas(db: Session = Depends(get_db)):
    rows = db.execute(
        text("SELECT id, nombre, slug, orden FROM subprogramas ORDER BY orden")
    ).mappings().all()
    return rows

@router.get("/subprogramas/{subprograma_id}/submodulos")
def submodulos_por_subprograma(subprograma_id: int, db: Session = Depends(get_db)):
    rows = db.execute(
        text("""
        SELECT id, subprograma_id, nombre, slug, orden
        FROM submodulos
        WHERE subprograma_id = :sid
        ORDER BY orden
        """),
        {"sid": subprograma_id},
    ).mappings().all()
    return rows
