# app/models/usuarios.py
from sqlalchemy import Column, BigInteger, Integer, String, Boolean, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship
from app.db.base import Base

class Usuario(Base):
    __tablename__ = "usuarios"

    id = Column(BigInteger, primary_key=True)

    ies_id = Column(Integer, ForeignKey("ies.id", ondelete="CASCADE"), nullable=True)
    ies = relationship("IES")

    username = Column(String(80), unique=True, nullable=False)
    email = Column(String(255), unique=True, nullable=True)

    password_hash = Column(String, nullable=False)

    # admin | cliente
    rol = Column(String(30), nullable=False, default="cliente")

    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime(timezone=False), server_default=func.now(), nullable=False)
