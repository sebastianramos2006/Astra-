# app/routes/ies.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
import secrets

from app.db.session import get_db
from app.core.deps import require_admin
from app.schemas.ies import IESCreate
from app.core.security import hash_password

router = APIRouter(prefix="/ies", tags=["IES"])


@router.get("/")
def listar_ies(db: Session = Depends(get_db), _=Depends(require_admin)):
    rows = db.execute(
        text("SELECT id, nombre, slug, created_at FROM ies ORDER BY id")
    ).mappings().all()
    return rows


@router.post("/")
def crear_ies(body: IESCreate, db: Session = Depends(get_db), _=Depends(require_admin)):
    """
    Crea IES + (opcional) crea usuario IES + seed de evidencia_registro.
    Para cambios futuros: busca 'CREAR_USUARIO' y 'SEED_OPERATIVO'.
    """

    # -----------------------------
    # Normalización rápida
    # -----------------------------
    nombre = (body.nombre or "").strip()
    slug = (body.slug or "").strip().lower()

    if not nombre:
        raise HTTPException(status_code=400, detail="nombre vacío")
    if not slug:
        raise HTTPException(status_code=400, detail="slug vacío")

    # -----------------------------
    # 1) Crear IES (o actualizar nombre si ya existe)
    # -----------------------------
    ies_row = db.execute(
        text("""
        INSERT INTO ies (nombre, slug)
        VALUES (:nombre, :slug)
        ON CONFLICT (slug) DO UPDATE SET nombre = EXCLUDED.nombre
        RETURNING id, nombre, slug
        """),
        {"nombre": nombre, "slug": slug}
    ).mappings().first()

    if not ies_row:
        raise HTTPException(status_code=500, detail="No se pudo crear IES")

    ies_id = int(ies_row["id"])

    # -----------------------------
    # 2) CREAR_USUARIO (si mandan email)
    # -----------------------------
    created_user = None
    temp_password = None

    if body.email:
        email = body.email.strip().lower()

        # Si no mandan password, generamos una provisional
        temp_password = (body.password or "").strip() or secrets.token_urlsafe(10)
        pwd_hash = hash_password(temp_password)

        # Username base: slug (si choca, slug2, slug3, ...)
        base_username = slug
        username = base_username
        i = 1
        while True:
            exists = db.execute(
                text("SELECT 1 FROM usuarios WHERE username = :u LIMIT 1"),
                {"u": username}
            ).first()
            if not exists:
                break
            i += 1
            username = f"{base_username}{i}"

        # Si el email ya existe PERO apunta a otra ies -> conflicto
        email_exists = db.execute(
            text("SELECT id, ies_id FROM usuarios WHERE lower(email)=:e LIMIT 1"),
            {"e": email}
        ).mappings().first()

        if email_exists and int(email_exists["ies_id"] or 0) != ies_id:
            raise HTTPException(status_code=409, detail="Ese email ya está usado por otra IES")

        # Insert/update por email (email es UNIQUE)
        created_user = db.execute(
            text("""
            INSERT INTO usuarios (ies_id, username, email, password_hash, rol, is_active)
            VALUES (:ies_id, :username, :email, :ph, 'cliente', TRUE)
            ON CONFLICT (email) DO UPDATE
              SET ies_id = EXCLUDED.ies_id,
                  username = EXCLUDED.username,
                  password_hash = EXCLUDED.password_hash,
                  rol = 'cliente',
                  is_active = TRUE
            RETURNING id, username, email, rol, ies_id
            """),
            {"ies_id": ies_id, "username": username, "email": email, "ph": pwd_hash}
        ).mappings().first()

    # -----------------------------
    # 3) SEED_OPERATIVO: crea evidencia_registro para esa IES
    # (esto hace que el resumen funcione sin 404)
    # -----------------------------
    db.execute(
        text("""
        INSERT INTO evidencia_registro (ies_id, submodulo_id, evidencia_id)
        SELECT :ies_id, ei.submodulo_id, ei.id
        FROM evidencia_item ei
        ON CONFLICT (ies_id, evidencia_id) DO NOTHING
        """),
        {"ies_id": ies_id}
    )

    db.commit()

    # -----------------------------
    # Respuesta para el modal
    # -----------------------------
    out = dict(ies_row)

    if created_user:
        out["email"] = created_user["email"]
        out["username"] = created_user["username"]
        out["rol"] = created_user["rol"]
        out["ies_id"] = created_user["ies_id"]
        out["temp_password"] = temp_password  # ✅ mostrar al admin

    return out
