# app/models/form_config.py
from sqlalchemy import (
    Column, BigInteger, Integer, Boolean, DateTime, ForeignKey, func
)
from sqlalchemy.dialects.postgresql import JSONB

from app.db.base import Base


class SubmoduloFormConfig(Base):
    __tablename__ = "submodulo_form_config"

    id = Column(BigInteger, primary_key=True, index=True)
    submodulo_id = Column(Integer, ForeignKey("submodulos.id", ondelete="CASCADE"), nullable=False)

    version = Column(Integer, nullable=False, default=1)
    columns_json = Column(JSONB, nullable=False, default=list)
    is_active = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime(timezone=False), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=False), server_default=func.now(), nullable=False)
