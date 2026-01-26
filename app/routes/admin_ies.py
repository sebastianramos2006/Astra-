# app/routes/admin_ies.py
from pathlib import Path
from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse

from app.core.deps import require_admin
from app.models.usuarios import Usuario

router = APIRouter(tags=["Admin UI"])

# ✅ tu static está en app/static
BASE_DIR = Path(__file__).resolve().parents[1]  # .../app
ADMIN_IES_HTML = BASE_DIR / "static" / "html" / "admin_ies.html"

@router.get("/admin/ies")
def admin_ies_page(_admin: Usuario = Depends(require_admin)):
    if not ADMIN_IES_HTML.exists():
        raise RuntimeError(f"No existe: {ADMIN_IES_HTML}")
    return FileResponse(str(ADMIN_IES_HTML), media_type="text/html")
