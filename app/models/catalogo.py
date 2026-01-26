# app/models/catalogo.py
from sqlalchemy import Column, Integer, String, ForeignKey, Text, DateTime, BigInteger
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.db.base import Base


class Subprograma(Base):
    __tablename__ = "subprogramas"

    id = Column(Integer, primary_key=True)  # fijo 1..6
    nombre = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, nullable=False)
    orden = Column(Integer, nullable=False)

    submodulos = relationship(
        "Submodulo",
        back_populates="subprograma",
        cascade="all, delete-orphan"
    )


class Submodulo(Base):
    __tablename__ = "submodulos"

    id = Column(Integer, primary_key=True)  # fijo 101.. etc
    subprograma_id = Column(Integer, ForeignKey("subprogramas.id", ondelete="CASCADE"), nullable=False)
    nombre = Column(String(255), nullable=False)
    slug = Column(String(255), nullable=False)
    orden = Column(Integer, nullable=False)

    subprograma = relationship("Subprograma", back_populates="submodulos")

    #  evidencias del catálogo
    evidencias = relationship(
        "EvidenciaItem",
        back_populates="submodulo",
        cascade="all, delete-orphan"
    )


class EvidenciaItem(Base):
    __tablename__ = "evidencia_item"

    # en SQL es BIGSERIAL
    id = Column(BigInteger, primary_key=True, autoincrement=True)

    submodulo_id = Column(Integer, ForeignKey("submodulos.id", ondelete="CASCADE"), nullable=False)
    orden = Column(Integer, nullable=False)
    titulo = Column(Text, nullable=False)

    created_at = Column(DateTime, nullable=False, server_default=func.now())

    submodulo = relationship("Submodulo", back_populates="evidencias")
