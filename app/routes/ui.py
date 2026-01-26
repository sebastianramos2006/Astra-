# routes/ui.py
from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse, RedirectResponse
from pathlib import Path

router = APIRouter()

BASE_DIR = Path(__file__).resolve().parents[1]  # .../app
HTML_DIR = BASE_DIR / "static" / "html"

def _read_html(name: str) -> str:
    p = HTML_DIR / name
    if not p.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Archivo HTML no encontrado: {p}"
        )
    return p.read_text(encoding="utf-8")

@router.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/login")

@router.get("/login", response_class=HTMLResponse, include_in_schema=False)
def login_page():
    return HTMLResponse(_read_html("login.html"))

@router.get("/app", response_class=HTMLResponse, include_in_schema=False)
def app_page():
    return HTMLResponse(_read_html("index.html"))
