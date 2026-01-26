# app/routes/resumen.py
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import date

from app.db.session import get_db
from app.core.deps import require_admin, require_ies_user
from app.models.usuarios import Usuario

router = APIRouter(prefix="/api/resumen", tags=["Resumen"])


def _to_float(x):
    try:
        return float(x) if x is not None else None
    except Exception:
        return None


def _bucket_avance(av):
    if av is None:
        return "sin_dato"
    if av < 25:
        return "0_24"
    if av < 50:
        return "25_49"
    if av < 75:
        return "50_74"
    if av <= 100:
        return "75_100"
    return "mas_100"


def _bool_or_none(x):
    if x is True:
        return True
    if x is False:
        return False
    return None


def _run_resumen(ies_id: int, submodulo_id: int, db: Session):
    sql = text("""
        SELECT
            er.id              AS registro_id,
            er.avance_pct      AS avance_pct,
            er.valoracion      AS valoracion,
            er.presenta        AS presenta,
            er.categoria_si_no AS categoria_si_no,
            er.fecha_inicio    AS fecha_inicio,
            er.fecha_fin       AS fecha_fin,
            er.updated_at      AS updated_at,
            ei.id              AS evidencia_id,
            ei.titulo          AS titulo,
            ei.orden           AS orden,
            ei.submodulo_id    AS submodulo_id
        FROM evidencia_registro er
        JOIN evidencia_item ei ON ei.id = er.evidencia_id
        WHERE er.ies_id = :ies_id
          AND ei.submodulo_id = :submodulo_id
        ORDER BY ei.orden ASC, er.id ASC
    """)

    try:
        rows = db.execute(sql, {"ies_id": ies_id, "submodulo_id": submodulo_id}).mappings().all()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error consultando resumen (JOIN evidencia_registro/evidencia_item): {str(e)}"
        )

    if not rows:
        raise HTTPException(
            status_code=404,
            detail="No hay evidencias registradas para esa IES y ese Submódulo."
        )

    avances = []
    valoraciones = []
    fechas_inicio = []
    fechas_fin = []

    presenta_si = 0
    presenta_no = 0
    presenta_sin_dato = 0

    cat_si = 0
    cat_no = 0
    cat_sin_dato = 0

    buckets = {"0_24": 0, "25_49": 0, "50_74": 0, "75_100": 0, "sin_dato": 0, "mas_100": 0}
    registros_out = []

    for r in rows:
        av = _to_float(r.get("avance_pct"))
        val = _to_float(r.get("valoracion"))

        if av is not None:
            avances.append(av)
        if val is not None:
            valoraciones.append(val)

        fi = r.get("fecha_inicio")
        ff = r.get("fecha_fin")
        if fi is not None:
            fechas_inicio.append(fi)
        if ff is not None:
            fechas_fin.append(ff)

        p = _bool_or_none(r.get("presenta"))
        c = _bool_or_none(r.get("categoria_si_no"))

        # Compat: si categoria_si_no no existe, usa presenta como proxy
        if c is None and p is not None:
            c = p

        if p is True:
            presenta_si += 1
        elif p is False:
            presenta_no += 1
        else:
            presenta_sin_dato += 1

        if c is True:
            cat_si += 1
        elif c is False:
            cat_no += 1
        else:
            cat_sin_dato += 1

        buckets[_bucket_avance(av)] += 1

        registros_out.append({
            "registro_id": r.get("registro_id"),
            "evidencia_id": r.get("evidencia_id"),
            "titulo": r.get("titulo"),
            "orden": r.get("orden"),
            "avance_pct": av,
            "valoracion": val,
            "presenta": p,
            "categoria_si_no": c,
            "fecha_inicio": str(fi) if fi is not None else None,
            "fecha_fin": str(ff) if ff is not None else None,
            "updated_at": str(r.get("updated_at")) if r.get("updated_at") is not None else None,
        })

    total = len(rows)
    avg_avance = (sum(avances) / len(avances)) if avances else None
    avg_val = (sum(valoraciones) / len(valoraciones)) if valoraciones else None

    f_inicio_min = min(fechas_inicio) if fechas_inicio else None
    f_fin_max = max(fechas_fin) if fechas_fin else None

    meses_para_finalizar = None
    if f_fin_max is not None:
        hoy = date.today()
        fin = f_fin_max.date() if hasattr(f_fin_max, "date") else f_fin_max
        meses_para_finalizar = (fin.year - hoy.year) * 12 + (fin.month - hoy.month)

    return {
        "ies_id": ies_id,
        "submodulo_id": submodulo_id,
        "evidencias_total": total,
        "avance_promedio": avg_avance,
        "valoracion_promedio": avg_val,
        "fecha_inicio_min": str(f_inicio_min) if f_inicio_min is not None else None,
        "fecha_fin_max": str(f_fin_max) if f_fin_max is not None else None,
        "meses_para_finalizar": meses_para_finalizar,
        "presenta": {"si": presenta_si, "no": presenta_no, "sin_dato": presenta_sin_dato},
        "categoria_si_no": {"si": cat_si, "no": cat_no, "sin_dato": cat_sin_dato},
        "avance_rangos": buckets,
        "registros": registros_out,
    }


# ✅ ADMIN: /api/resumen/submodulo/{ies_id}/{submodulo_id}
@router.get("/submodulo/{ies_id}/{submodulo_id}")
def resumen_submodulo_admin(
    ies_id: int,
    submodulo_id: int,
    db: Session = Depends(get_db),
    _admin=Depends(require_admin),
):
    return _run_resumen(ies_id, submodulo_id, db)


# ✅ IES: /api/resumen/submodulo/{submodulo_id}
@router.get("/submodulo/{submodulo_id}")
def resumen_submodulo_ies(
    submodulo_id: int,
    db: Session = Depends(get_db),
    user: Usuario = Depends(require_ies_user),
):
    return _run_resumen(user.ies_id, submodulo_id, db)
