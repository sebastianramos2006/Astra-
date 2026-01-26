import os
from sqlalchemy import create_engine, text

from app.core.security import hash_password

def normalize_db_url(url: str) -> str:
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)
    if url.startswith("postgresql://") and "+psycopg2" not in url:
        url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
    return url

def main():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL no está definido.")

    db_url = normalize_db_url(db_url)
    engine = create_engine(db_url, future=True)

    email = input("Email admin: ").strip().lower()
    username = input("Username admin: ").strip()
    password = input("Password admin: ").strip()

    pw_hash = hash_password(password)

    with engine.begin() as conn:
        # Si ya existe, no lo duplica
        exists = conn.execute(
            text("SELECT 1 FROM usuarios WHERE lower(email)=lower(:e) LIMIT 1"),
            {"e": email},
        ).fetchone()

        if exists:
            print("Ese email ya existe. Mejor usa reset_password_render.py para cambiar password.")
            return

        conn.execute(
            text("""
                INSERT INTO usuarios (ies_id, username, email, password_hash, rol, is_active)
                VALUES (NULL, :u, :e, :h, 'admin', TRUE)
            """),
            {"u": username, "e": email, "h": pw_hash},
        )

    print("OK: admin creado:", email)

if __name__ == "__main__":
    main()
