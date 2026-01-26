# app/routes/resumen.py
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.db.session import get_db

router = APIRouter(prefix="/resumen", tags=["Resumen"])


@router.get("/ies/{ies_slug}/submodulos/{submodulo_id}")
def resumen_submodulo(ies_slug: str, submodulo_id: int, db: Session = Depends(get_db)):
    # 1) Validar que la IES exista
    q_ies = text("SELECT id FROM ies WHERE slug = :slug LIMIT 1")
    ies_row = db.execute(q_ies, {"slug": ies_slug}).mappings().first()
    if not ies_row:
        # aquí sí es correcto responder 404: la IES no existe
        return {"detail": f"IES '{ies_slug}' no existe"}

    ies_id = ies_row["id"]

    # 2) Total de evidencias del catálogo para ese submódulo
    q_total = text("""
        SELECT COUNT(*) AS total
        FROM evidencia_item
        WHERE submodulo_id = :submodulo_id
    """)
    total_catalogo = db.execute(q_total, {"submodulo_id": submodulo_id}).scalar() or 0

    # 3) Traer registros operativos para esa IES + submódulo (JOIN)
    q_regs = text("""
        SELECT
          er.presenta,
          er.valoracion,
          er.avance_pct,
          er.fecha_inicio,
          er.fecha_fin,
          er.categoria_si_no
        FROM evidencia_registro er
        JOIN evidencia_item ei ON ei.id = er.evidencia_id
        WHERE er.ies_id = :ies_id
          AND ei.submodulo_id = :submodulo_id
    """)
    regs = list(db.execute(q_regs, {"ies_id": ies_id, "submodulo_id": submodulo_id}).mappings())

    # 4) Si no hay registros, NO es error: devolvemos ceros (pero con total_catalogo)
    if not regs:
        return {
            "ies_slug": ies_slug,
            "submodulo_id": submodulo_id,
            "evidencias_total": total_catalogo,
            "avance_promedio": 0,
            "valoracion_promedio": 0,
            "fecha_inicio_min": None,
            "fecha_fin_max": None,
            "evidencias_presenta": 0,
            "categoria_si": 0,
            "categoria_no": 0,
            "categoria_null": total_catalogo,
        }

    avances = [(r["avance_pct"] or 0) for r in regs]
    vals = [(r["valoracion"] or 0) for r in regs]

    fechas_ini = [r["fecha_inicio"] for r in regs if r["fecha_inicio"] is not None]
    fechas_fin = [r["fecha_fin"] for r in regs if r["fecha_fin"] is not None]

    presenta_count = sum(1 for r in regs if r["presenta"] is True)

    cat_si = sum(1 for r in regs if r["categoria_si_no"] is True)
    cat_no = sum(1 for r in regs if r["categoria_si_no"] is False)
    cat_null = sum(1 for r in regs if r["categoria_si_no"] is None)

    return {
        "ies_slug": ies_slug,
        "submodulo_id": submodulo_id,
        "evidencias_total": len(regs),
        "avance_promedio": sum(avances) / max(len(avances), 1),
        "valoracion_promedio": sum(vals) / max(len(vals), 1),
        "fecha_inicio_min": min(fechas_ini) if fechas_ini else None,
        "fecha_fin_max": max(fechas_fin) if fechas_fin else None,
        "evidencias_presenta": presenta_count,
        "categoria_si": cat_si,
        "categoria_no": cat_no,
        "categoria_null": cat_null,
    }
