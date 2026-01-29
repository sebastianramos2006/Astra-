# app/db/session.py
import os
from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool


def _load_env_file_if_exists():
    """
    Carga un .env simple (KEY=VALUE) si existe en la raíz del proyecto.
    No requiere python-dotenv.
    - En local te sirve para leer DATABASE_URL y JWT_SECRET desde .env
    - En Render normalmente NO existe .env, y está bien (usa env vars)
    """
    root = Path(__file__).resolve().parents[2]  # app/db/session.py -> 2 niveles arriba = raíz del repo
    env_path = root / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        os.environ.setdefault(k, v)


# Cargar .env solo si existe (local). En Render no estorba.
_load_env_file_if_exists()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL no está definido.\n"
        "Ponlo en .env (raíz del proyecto) o como variable de entorno.\n"
        "Ejemplo:\n"
        "DATABASE_URL=postgresql+psycopg2://postgres:CLAVE@localhost:5432/ASTRA"
    )

# --- Compatibilidad Render / SQLAlchemy ---
# 1) Algunos proveedores usan postgres://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# 2) Si viene sin driver, fuerza psycopg2 (porque tu local usa +psycopg2)
if DATABASE_URL.startswith("postgresql://") and "+psycopg2" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)

# Engine
engine = create_engine(
    DATABASE_URL,
    poolclass=NullPool,     # OK para Render free y evita conexiones colgadas
    future=True,
    connect_args={
        "options": "-c client_encoding=UTF8"
    },
)

# Sesión
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)


def get_db():
    """Dependency para FastAPI."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def test_db_connection() -> bool:
    """Para /db/ping."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False

