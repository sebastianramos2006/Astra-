# app/routes/db.py
from fastapi import APIRouter
from app.db.session import test_db_connection

router = APIRouter(prefix="/db", tags=["DB"])

@router.get("/ping")
def ping():
    ok = test_db_connection()
    return {"ok": ok}
