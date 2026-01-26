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
    """
    # session.py está en app/db/session.py -> raíz = 2 niveles arriba de app/
    root = Path(__file__).resolve().parents[2]
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
        # No sobreescribir si ya existe en el entorno
        os.environ.setdefault(k, v)


_load_env_file_if_exists()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL no está definido.\n"
        "Ponlo en .env (raíz del proyecto) o como variable de entorno.\n"
        "Ejemplo:\n"
        "DATABASE_URL=postgresql+psycopg2://postgres:CLAVE@localhost:5432/ASTRA"
    )

engine = create_engine(
    DATABASE_URL,
    poolclass=NullPool,
    future=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def test_db_connection() -> bool:
    """
    Para /db/ping.
    """
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return True
    except Exception:
        return False
