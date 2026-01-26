# app/main.py
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse, JSONResponse

from app.routes.db import router as db_router
from app.routes.catalogo import router as catalogo_router
from app.routes.ies import router as ies_router
from app.routes.operacion import router as operacion_router
from app.routes.resumen import router as resumen_router
from app.routes.form_config import router as form_config_router
from app.routes.seed_operativo import router as seed_operativo_router
from app.routes.ui import router as ui_router
from app.routes import seed_users
from app.routes.auth import router as auth_router
from app.routes.seed_admin import router as seed_admin_router
from app.routes.admin_usuarios import router as admin_usuarios_router
from app.routes.admin_delete import router as admin_delete_router
from app.routes.admin_ies import router as admin_ies_router

app = FastAPI(
    title="Astra by CEDEPRO",
    version="0.1.0",
    default_response_class=JSONResponse
)

app.mount("/static", StaticFiles(directory="app/static"), name="static")

app.include_router(db_router)
app.include_router(auth_router)
app.include_router(seed_admin_router)
app.include_router(seed_users.router)
app.include_router(catalogo_router)
app.include_router(ies_router)
app.include_router(operacion_router)
app.include_router(resumen_router)
app.include_router(form_config_router)
app.include_router(seed_operativo_router)
app.include_router(ui_router)
app.include_router(admin_usuarios_router)
app.include_router(admin_ies_router)
app.include_router(admin_delete_router)

@app.get("/", include_in_schema=False)
def root():
    return RedirectResponse(url="/app")
