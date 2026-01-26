# app/core/config.py
import os
from dataclasses import dataclass
from pathlib import Path

def _load_dotenv_if_exists() -> None:
    """
    Loader simple de .env (sin python-dotenv).
    - Lee el .env en la raíz del proyecto (misma carpeta donde está /app).
    - Solo setea variables que NO existan ya en el entorno.
    """
    root = Path(__file__).resolve().parents[2]  # .../ASTRA
    env_path = root / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        os.environ.setdefault(key, val)

@dataclass(frozen=True)
class Settings:
    database_url: str
    jwt_secret: str = "change_me_now"

def get_settings() -> Settings:
    _load_dotenv_if_exists()

    # Aceptamos DATABASE_URL o DATABASE_URL (tu caso)
    db_url = os.getenv("DATABASE_URL") or os.getenv("DATABASE_URL".upper())
    if not db_url:
        raise RuntimeError(
            "DATABASE_URL no está definido. Revisa .env o variables de entorno."
        )

    return Settings(
        database_url=db_url,
        jwt_secret=os.getenv("JWT_SECRET", "change_me_now"),
    )
