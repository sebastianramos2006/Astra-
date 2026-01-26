# app/db/base.py
from sqlalchemy.orm import declarative_base

Base = declarative_base()
# Importa modelos para registrar tablas en metadata
import app.models  # noqa: F401
