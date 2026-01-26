from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import select

from app.db.session import get_db
from app.models.catalogo import Subprograma, Submodulo

router = APIRouter(prefix="/seed", tags=["seed"])

SUBPROGRAMAS = [
    (1, "Condiciones Institucionales", "condiciones_institucionales", 1),
    (2, "Condiciones PA, AA y EST", "condiciones_pa_aa_y_est", 2),
    (3, "Docencia", "docencia", 3),
    (4, "Investigación e Innovación", "investigacion_e_innovacion", 4),
    (5, "Sistema de Gestión de la Calidad", "sistema_gestion_de_calidad", 5),
    (6, "Vinculación con la Sociedad", "vinculacion_con_la_sociedad", 6),
]

SUBMODULOS = [
    (101, 1, "Planificación institucional", "planificacion_institucional", 1),
    (102, 1, "Bienestar universitario", "bienestar_universitario", 2),
    (103, 1, "Internacionalización y movilidad", "internacionalizacion_y_movilidad", 3),
    (104, 1, "Infraestructura física y tecnológica", "infraestructura_fisica_y_tecnologica", 4),
    (105, 1, "Gestión de bibliotecas", "gestion_de_bibliotecas", 5),
    (106, 1, "Gestión documental y de archivo", "gestion_documental_y_de_archivo", 6),
    (107, 1, "Igualdad de oportunidades e interculturalidad", "igualdad_de_oportunidades_e_interculturalidad", 7),
    (108, 1, "Cogobierno", "cogobierno", 8),
    (109, 1, "Ética y transparencia", "etica_y_transparencia", 9),

    (201, 2, "Procesos ING, PER y PROM", "procesos_ing_per_y_prom", 1),
    (202, 2, "Evaluación integral del personal académico", "evaluacion_integral_personal_academico", 2),
    (203, 2, "Perfeccionamiento académico", "perfeccionamiento_academico", 3),
    (204, 2, "Personal académico con formación", "personal_academico_con_formacion", 4),
    (205, 2, "Personal académico con dedicación tiempo completo", "personal_academico_dedicacion_tiempo_completo", 5),
    (206, 2, "Aspirantes a estudiantes", "aspirantes_a_estudiantes", 6),
    (207, 2, "Tasa de deserción institucional (2do año) – Oferta", "tasa_desercion_institucional_2do_ano_oferta", 7),
    (208, 2, "Proceso de titulación", "proceso_de_titulacion", 8),
    (209, 2, "Tasa de titulación institucional – Grado", "tasa_titulacion_institucional_grado", 9),
    (210, 2, "Tasa de titulación institucional – Posgrado", "tasa_titulacion_institucional_posgrado", 10),
    (211, 2, "Seguimiento a graduados", "seguimiento_a_graduados", 11),

    (301, 3, "Modelo educativo", "modelo_educativo", 1),
    (302, 3, "Oferta académica", "oferta_academica", 2),
    (303, 3, "Gestión curricular y resultados de aprendizaje", "gestion_curricular_y_resultados_de_aprendizaje", 3),

    (401, 4, "Política y planificación de investigación e innovación", "politica_y_planificacion_investigacion_e_innovacion", 1),
    (402, 4, "Proyectos de investigación e innovación con financiamiento", "proyectos_investigacion_innovacion_con_financiamiento", 2),
    (403, 4, "Producción académica", "produccion_academica", 3),

    (501, 5, "Aseguramiento de la calidad institucional", "aseguramiento_calidad_institucional", 1),
    (502, 5, "Autoevaluación institucional", "autoevaluacion_institucional", 2),
    (503, 5, "Plan de mejora institucional", "plan_de_mejora_institucional", 3),

    (601, 6, "Gestión de la vinculación con la sociedad", "gestion_vinculacion_con_la_sociedad", 1),
    (602, 6, "Articulación de la vinculación con la docencia e investigación", "articulacion_vinculacion_docencia_investigacion", 2),
    (603, 6, "Proyectos de vinculación con la sociedad", "proyectos_vinculacion_con_la_sociedad", 3),
]

@router.post("/catalogo")
def seed_catalogo(db: Session = Depends(get_db)):
    # subprogramas
    for (id_, nombre, slug, orden) in SUBPROGRAMAS:
        exists = db.execute(select(Subprograma).where(Subprograma.id == id_)).scalar_one_or_none()
        if not exists:
            db.add(Subprograma(id=id_, nombre=nombre, slug=slug, orden=orden))

    db.commit()

    # submodulos
    for (id_, subprograma_id, nombre, slug, orden) in SUBMODULOS:
        exists = db.execute(select(Submodulo).where(Submodulo.id == id_)).scalar_one_or_none()
        if not exists:
            db.add(Submodulo(id=id_, subprograma_id=subprograma_id, nombre=nombre, slug=slug, orden=orden))

    db.commit()
    return {"seed": "ok", "subprogramas": len(SUBPROGRAMAS), "submodulos": len(SUBMODULOS)}
