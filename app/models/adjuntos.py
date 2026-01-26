# app/models/adjuntos.py
from sqlalchemy import BigInteger, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class EvidenciaAdjunto(Base):
    __tablename__ = "evidencia_adjunto"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    registro_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("evidencia_registro.id", ondelete="CASCADE"), nullable=False)

    url: Mapped[str] = mapped_column(Text, nullable=False)
    nombre: Mapped[str | None] = mapped_column(Text, nullable=True)
    mime_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)

    created_at: Mapped[DateTime] = mapped_column(DateTime, nullable=False, server_default=func.now())
