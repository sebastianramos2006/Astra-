import os

from sqlalchemy import create_engine, text

# Importa tu función real de hash
from app.core.security import hash_password


def main():
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise RuntimeError("DATABASE_URL no está definido en el entorno.")

    # Compat: si viene como postgresql://, fuerza psycopg2
    if db_url.startswith("postgres://"):
        db_url = db_url.replace("postgres://", "postgresql://", 1)
    if db_url.startswith("postgresql://") and "+psycopg2" not in db_url:
        db_url = db_url.replace("postgresql://", "postgresql+psycopg2://", 1)

    engine = create_engine(db_url, future=True)

    email = input("Email a resetear: ").strip().lower()
    new_pw = input("Nueva contraseña: ").strip()

    new_hash = hash_password(new_pw)

    with engine.begin() as conn:
        r = conn.execute(
            text(
                "UPDATE usuarios "
                "SET password_hash = :h, is_active = TRUE "
                "WHERE lower(email) = lower(:e)"
            ),
            {"h": new_hash, "e": email},
        )
        if r.rowcount == 0:
            print("No existe ese email en la tabla usuarios.")
        else:
            print("OK: contraseña actualizada para", email)


if __name__ == "__main__":
    main()
