SET client_encoding = 'UTF8';

BEGIN;
SET search_path TO public;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

------------------------------------------------------------
-- 1) RESET (DEV)
------------------------------------------------------------
DROP VIEW IF EXISTS vw_resumen_submodulo_ies CASCADE;

DROP TABLE IF EXISTS evidencia_adjunto CASCADE;
DROP TABLE IF EXISTS evidencia_registro CASCADE;
DROP TABLE IF EXISTS evidencia_item CASCADE;

DROP TABLE IF EXISTS submodulo_form_config CASCADE;
DROP TABLE IF EXISTS usuarios CASCADE;

DROP TABLE IF EXISTS submodulos CASCADE;
DROP TABLE IF EXISTS subprogramas CASCADE;
DROP TABLE IF EXISTS ies CASCADE;

------------------------------------------------------------
-- 2) TABLAS BASE (CLIENTES)
------------------------------------------------------------
CREATE TABLE ies (
  id          SERIAL PRIMARY KEY,
  nombre      VARCHAR(255) NOT NULL,
  slug        VARCHAR(255) NOT NULL UNIQUE,
  created_at  TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE usuarios (
  id            BIGSERIAL PRIMARY KEY,
  ies_id        INTEGER REFERENCES ies(id) ON DELETE CASCADE,
  username      VARCHAR(80)  NOT NULL UNIQUE,
  email         VARCHAR(255) UNIQUE,
  password_hash TEXT        NOT NULL,
  rol           VARCHAR(30) NOT NULL DEFAULT 'cliente', -- admin | cliente
  is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_usuarios_ies_id ON usuarios(ies_id);

------------------------------------------------------------
-- 3) CATÁLOGO (FIJO)
------------------------------------------------------------
CREATE TABLE subprogramas (
  id      INTEGER PRIMARY KEY,
  nombre  VARCHAR(255) NOT NULL,
  slug    VARCHAR(255) NOT NULL UNIQUE,
  orden   INTEGER NOT NULL
);

CREATE TABLE submodulos (
  id             INTEGER PRIMARY KEY,
  subprograma_id INTEGER NOT NULL REFERENCES subprogramas(id) ON DELETE CASCADE,
  nombre         VARCHAR(255) NOT NULL,
  slug           VARCHAR(255) NOT NULL,
  orden          INTEGER NOT NULL,
  UNIQUE (subprograma_id, slug)
);

CREATE INDEX idx_submodulos_subprograma_id ON submodulos(subprograma_id);

CREATE TABLE evidencia_item (
  id           BIGSERIAL PRIMARY KEY,
  submodulo_id INTEGER NOT NULL REFERENCES submodulos(id) ON DELETE CASCADE,
  orden        INTEGER NOT NULL,
  titulo       TEXT    NOT NULL,
  created_at   TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE (submodulo_id, orden)
);

CREATE INDEX idx_evidencia_item_submodulo_id ON evidencia_item(submodulo_id);

------------------------------------------------------------
-- 3.1) FORM CONFIG (por submódulo, versionado)
------------------------------------------------------------
CREATE TABLE submodulo_form_config (
  id            BIGSERIAL PRIMARY KEY,
  submodulo_id  INTEGER NOT NULL REFERENCES submodulos(id) ON DELETE CASCADE,
  version       INTEGER NOT NULL DEFAULT 1,
  columns_json  JSONB  NOT NULL DEFAULT '[]'::jsonb,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT ux_submodulo_form_config UNIQUE (submodulo_id, version)
);

CREATE INDEX idx_form_config_submodulo_id ON submodulo_form_config(submodulo_id);
CREATE INDEX idx_form_config_active ON submodulo_form_config(submodulo_id, is_active);

------------------------------------------------------------
-- 4) OPERACIÓN (LO QUE LLENA EL CLIENTE)
-- ✅ OPCIÓN B: evidencia_registro tiene submodulo_id directo
------------------------------------------------------------
CREATE TABLE evidencia_registro (
  id              BIGSERIAL PRIMARY KEY,
  ies_id          INTEGER NOT NULL REFERENCES ies(id) ON DELETE CASCADE,

  -- ✅ NUEVO: submódulo directo para filtrar sin líos
  submodulo_id    INTEGER NOT NULL REFERENCES submodulos(id) ON DELETE CASCADE,

  evidencia_id    BIGINT  NOT NULL REFERENCES evidencia_item(id) ON DELETE CASCADE,

  -- Núcleo común
  presenta        BOOLEAN NOT NULL DEFAULT FALSE,
  valoracion      INTEGER NOT NULL DEFAULT 0,   -- 0..100
  responsable     VARCHAR(255),

  fecha_inicio    DATE,
  fecha_fin       DATE,
  avance_pct      INTEGER NOT NULL DEFAULT 0,   -- 0..100

  categoria_si_no BOOLEAN,

  extra_data      JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at      TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT ux_registro_ies_evidencia UNIQUE (ies_id, evidencia_id),
  CONSTRAINT ck_valoracion_0_100 CHECK (valoracion BETWEEN 0 AND 100),
  CONSTRAINT ck_avance_0_100 CHECK (avance_pct BETWEEN 0 AND 100),
  CONSTRAINT ck_fechas_ok CHECK (
    fecha_inicio IS NULL OR fecha_fin IS NULL OR fecha_inicio <= fecha_fin
  )
);

CREATE INDEX idx_registro_ies_id ON evidencia_registro(ies_id);
CREATE INDEX idx_registro_submodulo_id ON evidencia_registro(submodulo_id);
CREATE INDEX idx_registro_evidencia_id ON evidencia_registro(evidencia_id);

------------------------------------------------------------
-- 4.1) ADJUNTOS (por evidencia_registro)
------------------------------------------------------------
CREATE TABLE evidencia_adjunto (
  id          BIGSERIAL PRIMARY KEY,
  registro_id BIGINT NOT NULL REFERENCES evidencia_registro(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  nombre      TEXT,
  mime_type   VARCHAR(120),
  size_bytes  BIGINT,
  created_at  TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evidencia_adjunto_registro_id ON evidencia_adjunto(registro_id);

------------------------------------------------------------
-- 4.2) TRIGGERS updated_at (reutilizable)
------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $f$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$f$ LANGUAGE plpgsql;

CREATE TRIGGER trg_evidencia_registro_updated_at
BEFORE UPDATE ON evidencia_registro
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_submodulo_form_config_updated_at
BEFORE UPDATE ON submodulo_form_config
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

------------------------------------------------------------
-- 4.3) ✅ Trigger: set/validar submodulo_id desde evidencia_item
------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_submodulo_id_from_evidencia()
RETURNS TRIGGER AS $$
DECLARE
  v_submodulo_id INTEGER;
BEGIN
  SELECT submodulo_id INTO v_submodulo_id
  FROM evidencia_item
  WHERE id = NEW.evidencia_id;

  IF v_submodulo_id IS NULL THEN
    RAISE EXCEPTION 'evidencia_id % no existe en evidencia_item', NEW.evidencia_id;
  END IF;

  -- Siempre forzamos consistencia
  IF NEW.submodulo_id IS DISTINCT FROM v_submodulo_id THEN
    NEW.submodulo_id := v_submodulo_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_submodulo_id
BEFORE INSERT OR UPDATE OF evidencia_id
ON evidencia_registro
FOR EACH ROW
EXECUTE FUNCTION set_submodulo_id_from_evidencia();

------------------------------------------------------------
-- 5) SEED: SUBPROGRAMAS
------------------------------------------------------------
INSERT INTO subprogramas (id, nombre, slug, orden) VALUES
(1, 'Condiciones Institucionales', 'condiciones_institucionales', 1),
(2, 'Condiciones PA, AA y EST', 'condiciones_pa_aa_y_est', 2),
(3, 'Docencia', 'docencia', 3),
(4, 'Investigación e Innovación', 'investigacion_e_innovacion', 4),
(5, 'Sistema de Gestión de la Calidad', 'sistema_gestion_de_calidad', 5),
(6, 'Vinculación con la Sociedad', 'vinculacion_con_la_sociedad', 6);

------------------------------------------------------------
-- 6) SEED: SUBMODULOS
------------------------------------------------------------
INSERT INTO submodulos (id, subprograma_id, nombre, slug, orden) VALUES
(101, 1, 'Planificación institucional', 'planificacion_institucional', 1),
(102, 1, 'Bienestar universitario', 'bienestar_universitario', 2),
(103, 1, 'Internacionalización y movilidad', 'internacionalizacion_y_movilidad', 3),
(104, 1, 'Infraestructura física y tecnológica', 'infraestructura_fisica_y_tecnologica', 4),
(105, 1, 'Gestión de bibliotecas', 'gestion_de_bibliotecas', 5),
(106, 1, 'Igualdad de oportunidades e interculturalidad', 'igualdad_de_oportunidades_e_interculturalidad', 7),
(107, 1, 'Gestión documental y de archivo', 'gestion_documental_y_de_archivo', 6),
(108, 1, 'Cogobierno', 'cogobierno', 8),
(109, 1, 'Ética y transparencia', 'etica_y_transparencia', 9),

(201, 2, 'Procesos ING, PER y PROM', 'procesos_ing_per_y_prom', 1),
(202, 2, 'Evaluación integral del personal académico', 'evaluacion_integral_personal_academico', 2),
(203, 2, 'Perfeccionamiento académico', 'perfeccionamiento_academico', 3),
(204, 2, 'Personal académico con formación', 'personal_academico_con_formacion', 4),
(205, 2, 'Personal académico con dedicación tiempo completo', 'personal_academico_dedicacion_tiempo_completo', 5),
(206, 2, 'Aspirantes a estudiantes', 'aspirantes_a_estudiantes', 6),
(207, 2, 'Tasa de deserción institucional (2do año) – Oferta', 'tasa_desercion_institucional_2do_ano_oferta', 7),
(208, 2, 'Proceso de titulación', 'proceso_de_titulacion', 8),
(209, 2, 'Tasa de titulación institucional – Grado', 'tasa_titulacion_institucional_grado', 9),
(210, 2, 'Tasa de titulación institucional – Posgrado', 'tasa_titulacion_institucional_posgrado', 10),
(211, 2, 'Seguimiento a graduados', 'seguimiento_a_graduados', 11),

(301, 3, 'Modelo educativo', 'modelo_educativo', 1),
(302, 3, 'Oferta académica', 'oferta_academica', 2),
(303, 3, 'Gestión curricular y resultados de aprendizaje', 'gestion_curricular_y_resultados_de_aprendizaje', 3),

(401, 4, 'Política y planificación de investigación e innovación', 'politica_y_planificacion_investigacion_e_innovacion', 1),
(402, 4, 'Proyectos de investigación e innovación con financiamiento', 'proyectos_investigacion_innovacion_con_financiamiento', 2),
(403, 4, 'Producción académica', 'produccion_academica', 3),

(501, 5, 'Aseguramiento de la calidad institucional', 'aseguramiento_calidad_institucional', 1),
(502, 5, 'Autoevaluación institucional', 'autoevaluacion_institucional', 2),
(503, 5, 'Plan de mejora institucional', 'plan_de_mejora_institucional', 3),

(601, 6, 'Gestión de la vinculación con la sociedad', 'gestion_vinculacion_con_la_sociedad', 1),
(602, 6, 'Articulación de la vinculación con la docencia e investigación', 'articulacion_vinculacion_docencia_investigacion', 2),
(603, 6, 'Proyectos de vinculación con la sociedad', 'proyectos_vinculacion_con_la_sociedad', 3);

------------------------------------------------------------
-- 6.1) SEED: form_config v1 vacío (para todos los submódulos)
------------------------------------------------------------
INSERT INTO submodulo_form_config (submodulo_id, version, columns_json, is_active)
SELECT s.id, 1, '{"columns":[]}'::jsonb, TRUE
FROM submodulos s;

------------------------------------------------------------
-- 7) SEED: EVIDENCIAS (TUS EVIDENCIAS REALES)
------------------------------------------------------------
-- (TU BLOQUE EXACTO, TAL CUAL LO TIENES)
INSERT INTO evidencia_item (submodulo_id, orden, titulo) VALUES
-- 101
(101, 1, 'Planificación estratégica (PEDI) y operativa (POA) institucional'),
(101, 2, 'Documento que evidencie la instancia responsable correspondiente.'),
(101, 3, 'Modelo educativo o pedagógico.'),
(101, 4, 'Documentos que evidencien el seguimiento y evaluación del PEDI'),
(101, 5, 'Documentos que evidencien la difusión del PEDI y POA y su ejecución'),
(101, 6, 'Documentos que evidencien la construcción participativa del PEDI.'),
(101, 7, 'Planificación estratégica y operativa de carreras, programas o unidades académicas y de sus sedes y extensiones. El CEE evaluará una muestra de las planificaciones de carreras y programas o unidades académicas y las evidencias respectivas de su cumplimiento.'),
(101, 8, 'Análisis del aporte, producto del seguimiento y evaluación de la planificación estratégica y operativa para la contribución al aseguramiento de la calidad y mejora continua'),

-- 102
(102, 1, 'Normativa interna para la gestión del bienestar universitario'),
(102, 2, 'Documento que evidencie la instancia responsable correspondiente'),
(102, 3, 'Documentos que evidencien la planificación y ejecución de los programas y servicios de bienestar universitario'),
(102, 4, 'Evidencias de la prestación de servicios de salud y del cuidado y bienestar infantil (contratos, convenios, infraestructura, dispensarios, laboratorios, entre otros).'),
(102, 5, 'Evidencias de la ejecución de las actividades culturales, artísticas y deportivas u otras extracurriculares de integración de la comunidad universitaria'),
(102, 6, 'Evidencias de los servicios de atención de salud para la comunidad universitaria (verificación in situ)'),
(102, 7, 'Evidencias del seguro de accidentes para estudiantes'),
(102, 8, 'Evidencias de la ejecución de campañas de concientización y prevención de acoso y violencia para la seguridad y convivencia pacífica'),
(102, 9, 'Evidencias de ejecución del protocolo para la atención de vulneración de derechos, casos de todo tipo de violencia, acoso y discriminación'),
(102, 10,'Evidencias de la ejecución de campañas, programas o proyectos de prevención y control del uso de drogas, bebidas alcohólicas, cigarrillos y derivados del tabaco, así como del fenómeno socioeconómico de las drogas'),
(102, 11,'Análisis del aporte de los resultados en el aseguramiento de la calidad y mejora continua de los servicios de bienestar universitario.'),

-- 103
(103, 1, 'Normativa interna para movilidad e internacionalización institucional.'),
(103, 2, 'Documento que evidencie la instancia responsable correspondiente.'),
(103, 3, 'Convenios u otros instrumentos para movilidad e internacionalización institucional'),
(103, 4, 'Documentos que evidencien la participación en redes académicas o de investigación internacionales'),
(103, 5, 'Documentos que evidencien la acreditación, certificación u otros mecanismos de internacionalización, de ser el caso.'),
(103, 6, 'Análisis del aporte de los resultados, producto del seguimiento y evaluación de los procesos de internacionalización y movilidad'),

-- 104
(104, 1, 'Documento que evidencie la instancia responsable correspondiente y su plan operativo anual'),
(104, 2, 'Documentos que evidencien la distribución de infraestructura institucional como: aulas, laboratorios, talleres, centros de simulación, plataformas tecnológicas, salas de cómputo, salas de estudio, espacios físicos, canchas, servicios de alimentación, entre otros, que la institución considere pertinentes. Estos ambientes serán objeto de verificación in situ'),
(104, 3, 'Evidencias de los sistemas de gestión informáticos que utiliza la institución'),
(104, 4, 'Manual, guía o instructivo del sistema de gestión informático institucional'),
(104, 5, 'Manual, guía o instructivo de los ambientes de aprendizaje virtuales'),
(104, 6, 'Plan y ejecución del mantenimiento de la infraestructura física y tecnológica'),
(104, 7, 'Documento que evidencie el presupuesto aprobado y ejecutado en la adquisición y mantenimiento de la infraestructura física y tecnológica'),
(104, 8, 'Documento que evidencie el seguimiento y mantenimiento de infraestructura física y tecnológica'),
(104, 9, 'Acciones y estrategias de accesibilidad universal'),
(104, 10,'Evidencia de coordinación con el Consejo Nacional para la Igualdad de Discapacidades para implementar requerimientos de accesibilidad universal'),
(104, 11,'Documento de análisis de las condiciones, recursos, infraestructura y accesibilidad y su aporte al aseguramiento de la calidad y mejora continua'),

-- 105
(105, 1, 'Normativa interna para la gestión de bibliotecas'),
(105, 2, 'Evidencias de la ejecución de convenios interinstitucionales para gestión y acceso al acervo bibliográfico físico y digital'),
(105, 3, 'Evidencias de la actualización del acervo bibliográfico considerando la oferta académica'),
(105, 4, 'Verificación in situ de la infraestructura de la(s) biblioteca(s) y el sistema informático utilizado para la gestión del acervo bibliográfico físico y digital'),
(105, 5, 'Documentos que evidencien el monitoreo y evaluación de la calidad de los servicios bibliotecarios y el análisis del aporte de los resultados para el aseguramiento de la calidad y mejora continua.'),

-- 106
(106, 1, 'Normativa interna para acciones afirmativas e igualdad de oportunidades'),
(106, 2, 'Plan institucional de igualdad.'),
(106, 3, 'Documento que evidencie las actividades desarrolladas entorno a la igualdad de oportunidades e interculturalidad'),
(106, 4, 'Evidencias de las actividades ejecutadas de inclusión de grupos históricamente vulnerables'),
(106, 5, 'Evidencias de las actividades ejecutadas para prevenir la violencia de género'),
(106, 6, 'Evidencias de las actividades para fomentar conocimientos y diálogo saberes ancestrales de pueblos y nacionalidades.'),
(106, 7, 'Documento que evidencie el seguimiento y evaluación del plan institucional de igualdad.'),
(106, 8, 'Análisis del aporte de los resultados, producto del seguimiento y evaluación de la aplicación de las políticas de igualdad de oportunidades y del plan de igualdad institucional.'),

-- 107
(107, 1, 'Normativa interna que regula el Sistema de Gestión de Documental y Archivo'),
(107, 2, 'Documento que evidencie la instancia responsable correspondiente.'),
(107, 3, 'Documentos que evidencien la planificación, ejecución, seguimiento, evaluación y acciones de mejora del Sistema de Gestión de Documental y Archivo.'),
(107, 4, 'Documentos que evidencien la capacitación, experiencia y formación del personal de la instancia responsable.'),
(107, 5, 'Verificación de espacios físicos acondicionados técnicamente y recursos tecnológicos en la verificación técnica in situ del Sistema de Gestión Documental y Archivo'),
(107, 6, 'Evidencias de las herramientas técnico – archivísticas del Sistema de Gestión de Documentos y Archivos.'),
(107, 7, 'Evidencias del plan de conservación, preservación y limpieza de documentos'),
(107, 8, 'Análisis del aporte en el aseguramiento de la calidad para la mejora continua, producto del seguimiento y evaluación de los procesos del Sistema de Gestión de Documentos y Archivos'),

-- 108
(108, 1, 'Normativa interna para el cogobierno'),
(108, 2, 'Estatuto'),
(108, 3, 'Documentos que evidencien los procesos de elección de los miembros del cogobierno.'),
(108, 4, 'Evidencias respecto del cumplimiento de los principios de alternabilidad, igualdad de oportunidades y no discriminación.'),
(108, 5, 'Evidencias de cumplimiento de las reuniones del Órgano Colegiado Superior.'),
(108, 6, 'Análisis del aporte de los resultados producto del seguimiento y evaluación de la gestión del cogobierno, para el aseguramiento de la calidad y mejora continua'),

-- 109
(109, 1, 'Código de ética.'),
(109, 2, 'Documento que evidencie la instancia(s) responsable(s) correspondiente(s).'),
(109, 3, 'Evidencias de la difusión del código de ética y capacitaciones o actividades de concientización'),
(109, 4, 'Documentos que evidencien (en caso de existir) las sanciones emitidas a los miembros de la comunidad universitaria, considerando la confidencialidad de la información.'),
(109, 5, 'Documento que evidencie la rendición anual de cuentas.'),
(109, 6, 'Análisis del monitoreo y cumplimiento del código de ética de la institución para el aseguramiento de la calidad y mejora continua'),
(109, 7, 'Análisis del aporte de los resultados producto del seguimiento y evaluación sobre los procesos de ética y transparencia para el aseguramiento de la calidad y mejora continua'),

-- 201
(201, 1, 'Normativa interna que regula al personal académico y personal de apoyo académico de la institución'),
(201, 2, 'Documento que evidencie la instancia responsable correspondiente'),
(201, 3, 'Documento que evidencie la difusión de los procesos de permanencia, capacitación y promoción del personal académico y personal de apoyo académico.'),
(201, 4, 'Normativa interna que evidencie los derechos, obligaciones y el comportamiento ético del personal académico y personal de apoyo académico'),
(201, 5, 'Plan o programa de perfeccionamiento del personal académico'),
(201, 6, 'Documento que evidencie la ejecución del plan o programa de perfeccionamiento del personal académico'),
(201, 7, 'Análisis del aporte de los resultados producto del seguimiento y evaluación de los procesos de ingreso, permanencia y promoción del personal académico, en el aseguramiento de la calidad y mejora continua'),

-- 202
(202, 1, 'Normativa interna para la evaluación integral del desempeño académico'),
(202, 2, 'Documento que evidencie la instancia responsable correspondiente'),
(202, 3, 'Evidencia(s) de difusión de los propósitos, procedimientos e instrumentos de la evaluación integral'),
(202, 4, 'Evidencia de la evaluación integral de desempeño de todo el personal académico, sus acciones de mejora y perfeccionamiento'),
(202, 5, 'Evidencia(s) de la comunicación de resultados de la evaluación al personal evaluado.'),
(202, 6, 'Evidencia(s) de la participación de autoridades, comité evaluador, personal académico y estudiantes'),
(202, 7, 'Análisis del aporte de la evaluación integral del personal académico en el aseguramiento de la calidad y mejora continua.'),

-- 203
(203, 1, 'Normativa interna para el perfeccionamiento académico'),
(203, 2, 'Documento que evidencie la instancia responsable correspondiente'),
(203, 3, 'Plan anual de perfeccionamiento académico, que considere entre otros: a) Necesidades de formación docente. b) Recomendaciones de capacitación resultado del proceso de evaluación docente'),
(203, 4, 'Programas de perfeccionamiento académico ejecutados'),
(203, 5, 'Ejecución presupuestaria de los programas de perfeccionamiento'),
(203, 6, 'Evidencia(s) de la difusión del programa de perfeccionamiento académico.'),
(203, 7, 'Entrevistas con el personal académico en la visita in situ.'),
(203, 8, 'Análisis del aporte de los resultados producto del seguimiento y evaluación de los procesos y programas de perfeccionamiento del personal académico, en el aseguramiento de la calidad y mejora continua'),

-- 204
(204, 1, 'Contratos, adendas, nombramientos y/o acciones de personal del profesorado.'),
(204, 2, 'Planta docente reportada en el sistema SIIES'),

-- 205
(205, 1, 'Contratos, adendas, nombramientos y/o acciones de personal académico'),
(205, 2, 'El CACES podrá contrastar información del MDT de acuerdo con la dedicación de los contratos para la validación de la información reportada'),
(205, 3, 'Personal académico reportado en el sistema SIIES'),

-- 206
(206, 1, 'Normativa interna para admisión y nivelación o acompañamiento académico.'),
(206, 2, 'Documento que evidencie la instancia responsable correspondiente.'),
(206, 3, 'Documentos que evidencien la aplicación de políticas, programas o planes de acción para la igualdad de oportunidades y no discriminación.'),
(206, 4, 'Documentos que evidencien la planificación, ejecución y seguimiento de los procesos de admisión y nivelación o acompañamiento académico.'),
(206, 5, 'Documentos que evidencien mecanismos o recursos utilizados para los procesos de admisión y nivelación o acompañamiento académico y sus estrategias de mejoras'),
(206, 6, 'Documentos que evidencien el desarrollo e implementación de estrategias que contribuyen al principio de integralidad'),
(206, 7, 'Reporte o informe(s) de permanencia estudiantil de grado y posgrado. a) Los datos de permanencia se contrastarán con la información anual reportada de estudiantes en la plataforma informática correspondiente.'),
(206, 8, 'Documento que evidencie la implementación de acciones y estrategias que contribuyan a disminuir la deserción estudiantil'),
(206, 9, 'Análisis del aporte producto del seguimiento y evaluación de los procesos de admisión, nivelación, acompañamiento académico, en el aseguramiento de la calidad y mejora continua'),

-- 207
(207, 1, 'Información de estudiantes matriculados en las cohortes que inician sus estudios reportada en el SIIES.'),
(207, 2, 'Información de estudiantes matriculados en el periodo de evaluación'),

-- 208
(208, 1, 'Normativa interna para el proceso de titulación.'),
(208, 2, 'Documento que evidencie la instancia responsable correspondiente.'),
(208, 3, 'Evidencias de la difusión de la normativa interna de titulación.'),
(208, 4, 'Documentos que evidencien la planificación, ejecución y seguimiento de los procesos de titulación'),
(208, 5, 'Documentos que evidencien la asignación de tutores de acuerdo con las necesidades del estudiante.'),
(208, 6, 'Reporte o informe(s) de los resultados de la titulación estudiantil'),
(208, 7, 'Evidencias de las acciones de mejora en los procesos de titulación estudiantil, con base en los resultados del seguimiento y evaluación'),
(208, 8, 'Evidencias de los mecanismos y estrategias implementadas con los estudiantes que terminaron su plan de estudios para motivar su titulación.'),
(208, 9, 'Información de estudiantes titulados reportada en la plataforma informática destinada para el efecto.'),
(208, 10,'Análisis de la contribución de los procesos de acompañamiento a los estudiantes en su titulación para el aseguramiento de la calidad y mejora continua'),

-- 209
(209, 1, 'Información de estudiantes y graduados con fecha de graduación reportada en el SIIES.'),
(209, 2, 'Información de duración de carreras y programas reportada en el SIIES'),
(209, 3, 'Información de estudiantes matriculados en las cohortes iniciadas del periodo de evaluación reportada en el SIIES.'),

-- 210
(210, 1, 'Información de estudiantes y graduados con fecha de graduación reportada en el SIIES.'),
(210, 2, 'Información de duración de programas reportada en el SIIES'),
(210, 3, 'Información de estudiantes matriculados en las cohortes iniciadas en el periodo de evaluación reportada en el SIIES'),

-- 211
(211, 1, 'Documento que evidencie la instancia responsable correspondiente'),
(211, 2, 'Reporte o Informe de seguimiento a graduados que incluya información e indicadores de empleabilidad, emprendimiento y continuidad de estudios'),
(211, 3, 'Evidencias respecto a la difusión de los resultados del seguimiento a graduados'),
(211, 4, 'Documentos que evidencien la información obtenida de los graduados en actividades institucionales académicas y no académicas'),
(211, 5, 'Evidencias sobre implementación de estrategias de inserción laboral de sus graduados.'),
(211, 6, 'Evidencias de participación de graduados en redes de conocimiento e innovación.'),
(211, 7, 'Documento que evidencie las mejoras implementadas en el proceso de seguimiento a graduados'),
(211, 8, 'Documento que evidencie la mejora o actualización del perfil de egreso u oferta académica con base en los resultados del sistema de seguimiento a graduados'),
(211, 9, 'Verificación in situ del sistema de seguimiento a graduados'),
(211, 10,'Análisis del aporte del seguimiento a los graduados en el aseguramiento de la calidad y mejora continua'),

-- 301
(301, 1, 'Modelo educativo vigente suscrito por la instancia correspondiente.'),
(301, 2, 'Documento donde se encuentre la filosofía institucional.'),
(301, 3, 'Documento(s) que evidencie la instancia responsable correspondiente'),
(301, 4, 'Documento(s) que evidencie la planificación, monitoreo, mejora o actualización y difusión del modelo educativo'),
(301, 5, 'Documento(s) que evidencie el desarrollo de habilidades blandas en los estudiantes y la aplicación de la relación teoría – práctica.'),
(301, 6, 'Documento(s) que evidencie la perspectiva de innovación, sostenibilidad, internacionalización y mecanismos para el uso de inteligencia artificial.'),
(301, 7, 'Análisis del aporte de los resultados de la implementación, monitoreo, evaluación, actualización del modelo educativo.'),

-- 302
(302, 1, 'Normativa interna vigente relacionada con proceso de creación y actualización de la oferta académica'),
(302, 2, 'Documento que evidencie la instancia responsable correspondiente'),
(302, 3, 'Modelo educativo o pedagógico vigente suscrito por la instancia correspondiente.'),
(302, 4, 'Planificación institucional.'),
(302, 5, 'Estatuto de la UEP.'),
(302, 6, 'Documento(s) que evidencie el proceso de seguimiento, evaluación, y que sus resultados son considerados en la mejora de la oferta académica'),
(302, 7, 'Documento(s) que evidencie demuestra que la oferta académica considere la demanda social local, nacional y la perspectiva internacional con carácter de innovación permanente, en consecución a los ODS y mecanismos para el uso de inteligencia artificial'),
(302, 8, 'Análisis del seguimiento y evaluación de la oferta académica para la contribución en el aseguramiento de la calidad y mejora continua'),

-- 303
(303, 1, 'Informe(s) de gestión de la instancia responsable, que incluya al menos, evidencia de: a) El proceso de seguimiento y evaluación de los planes de estudio. b) La articulación de los proyectos curriculares con el modelo educativo, filosofía y estrategias institucionales y necesidades de la sociedad. c) El cumplimiento de resultados de aprendizaje y la participación de grupos de interés como graduados, sectores profesionales o productivos, entre otros.'),
(303, 2, 'Documentos que evidencien el seguimiento y las acciones de mejora'),
(303, 3, 'Análisis del aporte de la gestión curricular y verificación de los resultados de aprendizaje en el aseguramiento de la calidad y mejora continua.'),
(303, 4, 'Normativa interna para el diseño, actualización o ajustes curriculares'),

-- 401
(401, 1, 'Normativa interna de la investigación e innovación'),
(401, 2, 'Normativa interna que regula el comportamiento ético de la comunidad universitaria en los procesos de investigación'),
(401, 3, 'Documento que evidencie la instancia responsable correspondiente'),
(401, 4, 'Plan de investigación e innovación'),
(401, 5, 'Programas o proyectos de investigación e innovación reportados en el SIIES (usados para mejora de Docencia o Vinculación; relacionados a líneas de investigación, dominios académicos, necesidades del entorno y ODS; relacionados a pueblos y nacionalidades; participación de profesores y estudiantes; centros de transferencia tecnológica; relación con proyectos de Docencia o Vinculación).'),
(401, 6, 'Documentos que evidencien la planificación, ejecución, seguimiento, evaluación, difusión e implementación de acciones de mejora de investigación'),
(401, 7, 'Documento que evidencie el presupuesto asignado y ejecutado a investigación e innovación'),
(401, 8, 'Evidencias de mecanismos para obtener fondos o recursos externos'),
(401, 9, 'Documento que evidencie un plan de estímulos relacionados a los resultados de investigación e innovación'),
(401, 10,'Evidencien la participación de profesores o profesores y estudiantes'),
(401, 11,'Documentos que evidencien la cooperación interinstitucional (nacional o internacional)'),
(401, 12,'Convenios u otros instrumentos legales en ejecución para la participación en redes y cooperación interinstitucional'),
(401, 13,'Análisis del aporte de la política y planificación de investigación e innovación en el aseguramiento de la calidad y mejora continua'),

-- 402
(402, 1, 'Programas de investigación reportados en el SIIES.'),
(402, 2, 'Proyectos de investigación reportados en el SIIES.'),
(402, 3, 'Convenios de cooperación interinstitucional u otros instrumentos legales'),
(402, 4, 'Evidencias sobre el financiamiento externo.'),

-- 403
(403, 1, 'Artículos publicados en revistas de las bases de datos Scopus o Web of Science.'),
(403, 2, 'Artículos publicados en revistas de las bases de datos regionales según el anexo 1'),
(403, 3, 'Artículos publicados en revistas de la base de datos Latindex catálogo 2.0.'),
(403, 4, 'Artículos publicados en actas de congresos indexados (Proceedings) en bases de datos Scopus o Web of Science'),
(403, 5, 'Libros publicados en el periodo de evaluación revisados por pares'),
(403, 6, 'Capítulos de libros publicados en el periodo de evaluación revisados por pares'),
(403, 7, 'Documentos que evidencien la revisión por pares del libro o capítulo del libro'),
(403, 8, 'Planta docente reportada en el sistema SIIES'),
(403, 9, 'Documentos que evidencien la evaluación por curadores o expertos anónimos y externos a la institución donde trabaja el autor'),
(403, 10,'Documentos que evidencien haber expuesto o presentado la producción artística en eventos, exposiciones nacionales o internacionales o de haber ganado premios, dentro o fuera del país'),
(403, 11,'Evidencia de la propiedad intelectual'),
(403, 12,'Proyecto de investigación, vinculación o de producción artística al cual pertenece el producto de propiedad intelectual'),
(403, 13,'Registro de derechos de autor en el SENADI.'),

-- 501
(501, 1, 'Normativa interna que describa el sistema de gestión de la calidad institucional para el aseguramiento de la calidad considerando el modelo educativo y filosofía institucional'),
(501, 2, 'Documento que evidencie la instancia responsable correspondiente'),
(501, 3, 'Plan estratégico de desarrollo institucional'),
(501, 4, 'Informe(s) de autoevaluación institucional con su plan de mejora'),
(501, 5, 'Documento que evidencie la planificación y seguimiento de los procesos de autoevaluación de carreras, programas, sedes y extensiones.'),
(501, 6, 'Informe(s) de autoevaluación de carreras, programas, sedes y extensiones con sus planes de mejora'),
(501, 7, 'Evidencias de mejoras realizadas con base en resultados del seguimiento, monitoreo y administración de información de procesos académicos y no académicos.'),
(501, 8, 'Evidencia(s) de la participación de la comunidad universitaria para articular prioridades, examinar la alineación de sus propósitos y recursos para el aseguramiento de la calidad'),
(501, 9, 'Análisis del aporte de los resultados producto del seguimiento de los procesos de Aseguramiento de la Calidad Institucional en la mejora continua'),

-- 502
(502, 1, 'Normativa interna para el proceso de autoevaluación institucional'),
(502, 2, 'Documento que evidencie la instancia responsable correspondiente'),
(502, 3, 'Documentos que evidencien la planificación, ejecución y evaluación del proceso de autoevaluación (asignación de recursos; información utilizada; participación de la comunidad universitaria).'),
(502, 4, 'Informe de autoevaluación institucional'),
(502, 5, 'Documentos que avalen la participación y/o formación de personal académico en procesos de evaluación internos o externos'),
(502, 6, 'Plan de mejora del proceso de autoevaluación institucional'),
(502, 7, 'Plan estratégico de desarrollo institucional'),
(502, 8, 'Análisis del aporte de los procesos de autoevaluación en el aseguramiento de la calidad institucional y de la mejora continua'),

-- 503
(503, 1, 'Normativa interna que contemple el desarrollo y ejecución de planes de mejora.'),
(503, 2, 'Plan de mejora institucional'),
(503, 3, 'Planes de mejora de carreras, programas o unidades académicas y de sedes y extensiones'),
(503, 4, 'Plan estratégico de desarrollo institucional.'),
(503, 5, 'Documentos que evidencien el seguimiento y ejecución de los planes de mejora, así como de su análisis para el aporte en el aseguramiento de la calidad.'),
(503, 6, 'Análisis del aporte de los resultados, obtenidos en el seguimiento y evaluación de los planes de mejoramiento, para el aseguramiento de la calidad y de la mejora continua'),

-- 601
(601, 1, 'Normativa interna de vinculación con la sociedad'),
(601, 2, 'Documento que evidencie la instancia responsable correspondiente.'),
(601, 3, 'Documentos que evidencien la planificación, seguimiento, evaluación, y acciones de mejora de los programas o proyectos de vinculación con la sociedad'),
(601, 4, 'Documentos que evidencien la asignación y participación de personal académico o personal de apoyo académico y estudiantes en los procesos de vinculación con la sociedad.'),
(601, 5, 'Documentos donde se evidencie la participación de los actores internos y externos en la identificación de necesidades de intervención o en los diagnósticos participativos.'),
(601, 6, 'Programas y/o proyectos ejecutados o en ejecución e iniciativas de interés público planificados de acuerdo con las líneas de operativas establecidas por la institución.'),
(601, 7, 'Convenios u otros instrumentos en ejecución o ejecutados con los sectores productivos, públicos y privados, así como con organizaciones sociales'),
(601, 8, 'Programas o proyectos de vinculación con la sociedad que promuevan la equidad y la justicia hacia pueblos, nacionalidades e interculturalidad, género, personas con discapacidad y ambiente'),
(601, 9, 'Documento que evidencie la asignación y ejecución presupuestaria para la vinculación con la sociedad'),
(601, 10,'Evidencias de actividades de divulgación del conocimiento académico.'),
(601, 11,'Programas o proyectos de incubación de emprendimientos innovadores, aceleradoras, hábitat de empresas innovadoras, articulados con sus dominios académicos o líneas de investigación o vinculación'),
(601, 12,'Análisis de la gestión de la Vinculación con la Sociedad en el aseguramiento de la calidad y mejora continua'),

-- 602
(602, 1, 'Planes, programas o proyectos de vinculación con la sociedad que incluyan actividades de investigación y docencia.'),
(602, 2, 'Documentos que evidencien la asignación de personal académico y participación de estudiantes'),
(602, 3, 'Documentos que evidencien los resultados de los proyectos de vinculación utilizados en actividades o proyectos de investigación'),
(602, 4, 'Programas o proyectos de vinculación con la sociedad desarrollados a partir de resultados obtenidos de actividades o proyectos de investigación'),
(602, 5, 'Programas o proyectos de vinculación con la sociedad desarrollados a partir de resultados obtenidos de actividades o proyectos de docencia'),
(602, 6, 'Documentos que evidencien el seguimiento y acciones de mejora'),
(602, 7, 'Análisis del aporte de los procesos de articulación de la Vinculación con la Sociedad con la Docencia y la Investigación en el aseguramiento de la calidad y mejora continua.'),

-- 603
(603, 1, 'Proyectos de vinculación con la sociedad reportados en el SIIES'),
(603, 2, 'Oferta académica vigente y en ejecución reportada en el SIIES');

------------------------------------------------------------
-- 8) DEMO: Crear IES (PUCE)
------------------------------------------------------------
INSERT INTO ies (nombre, slug)
VALUES ('PUCE', 'puce')
ON CONFLICT (slug) DO NOTHING;

------------------------------------------------------------
-- 9) SEED OPERATIVO: crear evidencia_registro para PUCE
-- ✅ ahora incluye submodulo_id (o trigger lo asegura igual)
------------------------------------------------------------
INSERT INTO evidencia_registro (ies_id, submodulo_id, evidencia_id)
SELECT
  (SELECT id FROM ies WHERE slug='puce') AS ies_id,
  ei.submodulo_id,
  ei.id
FROM evidencia_item ei
ON CONFLICT (ies_id, evidencia_id) DO NOTHING;

------------------------------------------------------------
-- 9.1) VISTA RESUMEN (para dashboard) ✅ usa submodulo_id directo
------------------------------------------------------------
CREATE VIEW vw_resumen_submodulo_ies AS
SELECT
  i.slug AS ies_slug,
  er.submodulo_id,

  COUNT(*) AS evidencias_total,
  AVG(er.avance_pct)::numeric(10,2) AS avance_promedio,
  AVG(er.valoracion)::numeric(10,2) AS valoracion_promedio,

  MIN(er.fecha_inicio) AS fecha_inicio_min,
  MAX(er.fecha_fin)    AS fecha_fin_max,

  SUM(CASE WHEN er.presenta = TRUE THEN 1 ELSE 0 END) AS evidencias_presenta,
  SUM(CASE WHEN er.categoria_si_no = TRUE THEN 1 ELSE 0 END) AS categoria_si,
  SUM(CASE WHEN er.categoria_si_no = FALSE THEN 1 ELSE 0 END) AS categoria_no,
  SUM(CASE WHEN er.categoria_si_no IS NULL THEN 1 ELSE 0 END) AS categoria_null

FROM evidencia_registro er
JOIN ies i ON i.id = er.ies_id
GROUP BY i.slug, er.submodulo_id;

COMMIT;

------------------------------------------------------------
-- 10) VERIFICACIONES
------------------------------------------------------------
-- Evidencias cargadas por submódulo
SELECT submodulo_id, COUNT(*) AS n
FROM evidencia_item
GROUP BY submodulo_id
ORDER BY submodulo_id;

-- Registros operativos creados para PUCE
SELECT COUNT(*) AS registros_puce
FROM evidencia_registro er
JOIN ies i ON i.id = er.ies_id
WHERE i.slug = 'puce';

-- Ejemplo: ver evidencias del submódulo 101 con su registro en PUCE
SELECT
  ei.id AS evidencia_id,
  ei.submodulo_id,
  ei.orden,
  ei.titulo,
  er.presenta,
  er.valoracion,
  er.responsable,
  er.fecha_inicio,
  er.fecha_fin,
  er.avance_pct,
  er.categoria_si_no,
  er.extra_data
FROM evidencia_item ei
LEFT JOIN evidencia_registro er
  ON er.evidencia_id = ei.id
 AND er.ies_id = (SELECT id FROM ies WHERE slug='puce')
WHERE ei.submodulo_id = 101
ORDER BY ei.orden;

-- Vista resumen (dashboard base) para PUCE + 101
SELECT *
FROM vw_resumen_submodulo_ies
WHERE ies_slug = 'puce' AND submodulo_id = 101;
