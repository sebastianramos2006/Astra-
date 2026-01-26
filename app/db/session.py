import os
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError(
        "DATABASE_URL no está definido.\n"
        "Ponlo en .env (raíz del proyecto) o como variable de entorno.\n"
        "Ejemplo:\n"
        "DATABASE_URL=postgresql+psycopg2://postgres:CLAVE@localhost:5432/ASTRA"
    )

# --- Compatibilidad Render / SQLAlchemy ---
# 1) algunos proveedores usan postgres://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# 2) si viene sin driver, fuerza psycopg2 (porque tú lo usas en local)
if DATABASE_URL.startswith("postgresql://") and "+psycopg2" not in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)
###
#Correcion de el apartado del os 
########
