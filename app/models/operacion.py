# app/models/operacion.py
from sqlalchemy import Column, BigInteger, Integer, Boolean, Date, String, ForeignKey, DateTime
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from sqlalchemy.dialects.postgresql import JSONB

from app.db.base import Base


class EvidenciaRegistro(Base):
    __tablename__ = "evidencia_registro"

    id = Column(BigInteger, primary_key=True, autoincrement=True)

    ies_id = Column(Integer, ForeignKey("ies.id", ondelete="CASCADE"), nullable=False)
    evidencia_id = Column(BigInteger, ForeignKey("evidencia_item.id", ondelete="CASCADE"), nullable=False)

    presenta = Column(Boolean, nullable=False, server_default="false")
    valoracion = Column(Integer, nullable=False, server_default="0")
    responsable = Column(String(255), nullable=True)

    fecha_inicio = Column(Date, nullable=True)
    fecha_fin = Column(Date, nullable=True)
    avance_pct = Column(Integer, nullable=False, server_default="0")

    categoria_si_no = Column(Boolean, nullable=True)
    extra_data = Column(JSONB, nullable=False, server_default="{}")

    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now())

    # Relación: NO definas EvidenciaItem aquí, solo referencia por string
    evidencia = relationship("EvidenciaItem", lazy="joined")


class EvidenciaAdjunto(Base):
    __tablename__ = "evidencia_adjunto"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    registro_id = Column(BigInteger, ForeignKey("evidencia_registro.id", ondelete="CASCADE"), nullable=False)

    url = Column(String, nullable=False)
    nombre = Column(String, nullable=True)
    mime_type = Column(String(120), nullable=True)
    size_bytes = Column(BigInteger, nullable=True)

    created_at = Column(DateTime, nullable=False, server_default=func.now())

    registro = relationship("EvidenciaRegistro", backref="adjuntos")
