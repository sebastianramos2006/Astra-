# app/core/security.py
import os
from datetime import datetime, timedelta
from jose import jwt, JWTError
from passlib.context import CryptContext

JWT_SECRET = os.getenv("JWT_SECRET", "change_me_now")
JWT_ALG = "HS256"
JWT_EXPIRES_MIN = 60 * 24  # 1 día

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    return pwd_context.verify(password, password_hash)


def create_token(payload: dict, minutes: int = JWT_EXPIRES_MIN) -> str:
    to_encode = dict(payload)
    exp = datetime.utcnow() + timedelta(minutes=minutes)
    to_encode.update({"exp": exp})
    return jwt.encode(to_encode, JWT_SECRET, algorithm=JWT_ALG)


def create_access_token(data: dict, expires_minutes: int | None = None) -> str:
    mins = expires_minutes if expires_minutes is not None else JWT_EXPIRES_MIN
    return create_token(data, minutes=mins)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except JWTError as e:
        raise ValueError("Token inválido") from e
