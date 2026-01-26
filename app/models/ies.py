from sqlalchemy import Column, Integer, String, DateTime, func
from app.db.base import Base

class IES(Base):
    __tablename__ = "ies"

    id = Column(Integer, primary_key=True)
    nombre = Column(String(255), nullable=False)
    slug = Column(String(255), unique=True, nullable=False, index=True)
    created_at = Column(DateTime(timezone=False), server_default=func.now(), nullable=False)
