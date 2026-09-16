import base64
import hashlib
import hmac

from pwdlib import PasswordHash, exceptions
from pwdlib.hashers.argon2 import Argon2Hasher
from pwdlib.hashers.bcrypt import BcryptHasher

# Argon2 — для новых хешей; Bcrypt — verify/upgrade старых.
password_hasher = PasswordHash((Argon2Hasher(), BcryptHasher()))

PASSWORD_MIN_LENGTH = 8
PASSWORD_SPECIAL_CHARS = "!@#$%^&*()_+-=[]{}|;:,.<>?"


def get_password_validation_error(password: str) -> str | None:
    if len(password) < PASSWORD_MIN_LENGTH:
        return "Пароль должен содержать минимум 8 символов"
    if not any(c.isupper() for c in password):
        return "Пароль должен содержать заглавную букву"
    if not any(c.islower() for c in password):
        return "Пароль должен содержать строчную букву"
    if not any(c.isdigit() for c in password):
        return "Пароль должен содержать цифру"
    if not any(c in PASSWORD_SPECIAL_CHARS for c in password):
        return "Пароль должен содержать спецсимвол"
    return None


def validate_password(password: str) -> bool:
    return get_password_validation_error(password) is None


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def _b64_decode_passlib(value: str) -> bytes:
    normalized = value.replace(".", "+")
    pad = (4 - len(normalized) % 4) % 4
    return base64.b64decode(normalized + ("=" * pad))


def _verify_legacy_pbkdf2_sha256(plain_password: str, stored_hash: str) -> bool:
    """Verify passlib-style pbkdf2-sha256 hashes from older deployments."""
    if not stored_hash.startswith("$pbkdf2-sha256$"):
        return False
    try:
        parts = stored_hash.split("$")
        if len(parts) != 5:
            return False
        rounds = int(parts[2])
        salt = _b64_decode_passlib(parts[3])
        expected = _b64_decode_passlib(parts[4])
        derived = hashlib.pbkdf2_hmac(
            "sha256",
            plain_password.encode("utf-8"),
            salt,
            rounds,
            dklen=len(expected),
        )
        return hmac.compare_digest(derived, expected)
    except Exception:
        return False


def verify_password(plain_password: str, hashed_password: str) -> bool:
    valid, _ = verify_and_update_password(plain_password, hashed_password)
    return valid


def verify_and_update_password(plain_password: str, hashed_password: str) -> tuple[bool, str | None]:
    if not hashed_password:
        return False, None
    try:
        return password_hasher.verify_and_update(plain_password, hashed_password)
    except exceptions.UnknownHashError:
        if _verify_legacy_pbkdf2_sha256(plain_password, hashed_password):
            return True, password_hasher.hash(plain_password)
        return False, None


def identify_hash_scheme(stored_hash: str | None) -> str:
    if not stored_hash:
        return "INVALID"
    if stored_hash.startswith("$argon2"):
        return "argon2"
    if stored_hash.startswith(("$2a$", "$2b$", "$2y$")):
        return "bcrypt"
    if stored_hash.startswith("$pbkdf2-sha256$"):
        return "pbkdf2_sha256"
    return "UNKNOWN"
