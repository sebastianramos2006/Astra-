# app/routes/form_config.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.models.form_config import SubmoduloFormConfig

router = APIRouter(prefix="/form-config", tags=["Form Config"])


def _normalize_columns_json(value):
    """
    Normaliza columns_json para que SIEMPRE sea una lista.
    - Si viene como lista => ok
    - Si viene como dict {"columns":[...]} (tu seed actual) => devuelve ese array
    - Si viene None u otra cosa => []
    """
    if isinstance(value, list):
        return value
    if isinstance(value, dict):
        cols = value.get("columns")
        return cols if isinstance(cols, list) else []
    return []


@router.get("/submodulos/{submodulo_id}")
def get_form_config(
    submodulo_id: int,
    db: Session = Depends(get_db),
):
    # Traer config activa más reciente
    cfg = (
        db.query(SubmoduloFormConfig)
        .filter(SubmoduloFormConfig.submodulo_id == submodulo_id)
        .filter(SubmoduloFormConfig.is_active == True)  # noqa: E712
        .order_by(SubmoduloFormConfig.version.desc())
        .first()
    )

    # Si no existe, NO es error: devolvemos default
    if not cfg:
        return {
            "id": None,
            "submodulo_id": submodulo_id,
            "version": 1,
            "is_active": True,
            "columns_json": [],
        }

    # Normalizar columns_json (evita 500 por tu seed {"columns":[]})
    normalized = _normalize_columns_json(cfg.columns_json)

    return {
        "id": cfg.id,
        "submodulo_id": cfg.submodulo_id,
        "version": cfg.version,
        "is_active": cfg.is_active,
        "columns_json": normalized,
    }
