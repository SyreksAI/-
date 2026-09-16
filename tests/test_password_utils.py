import base64
import hashlib

from app.password_utils import (
    _verify_legacy_pbkdf2_sha256,
    get_password_validation_error,
    hash_password,
    identify_hash_scheme,
    validate_password,
    verify_and_update_password,
    verify_password,
)


def _make_legacy_pbkdf2_hash(password: str, *, rounds: int = 29000) -> str:
    salt = b"testsalt12345678"
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, rounds, dklen=32)
    salt_b64 = base64.b64encode(salt).decode().rstrip("=").replace("+", ".")
    digest_b64 = base64.b64encode(derived).decode().rstrip("=").replace("+", ".")
    return f"$pbkdf2-sha256${rounds}${salt_b64}${digest_b64}"


def test_password_validation_rules():
    assert validate_password("Test1234!")
    assert get_password_validation_error("Test1234!") is None
    assert get_password_validation_error("short1!") == "Пароль должен содержать минимум 8 символов"
    assert get_password_validation_error("test1234!") == "Пароль должен содержать заглавную букву"
    assert get_password_validation_error("TEST1234!") == "Пароль должен содержать строчную букву"
    assert get_password_validation_error("Testtest!") == "Пароль должен содержать цифру"
    assert get_password_validation_error("Test1234") == "Пароль должен содержать спецсимвол"


def test_hash_and_verify_argon2():
    hashed = hash_password("Test1234!")
    assert identify_hash_scheme(hashed) == "argon2"
    assert verify_password("Test1234!", hashed)
    assert not verify_password("WrongPass1!", hashed)


def test_verify_and_update_returns_none_for_current_hash():
    hashed = hash_password("Test1234!")
    valid, updated = verify_and_update_password("Test1234!", hashed)
    assert valid is True
    assert updated is None


def test_legacy_pbkdf2_verify_and_upgrade():
    legacy = _make_legacy_pbkdf2_hash("Test1234!")
    assert identify_hash_scheme(legacy) == "pbkdf2_sha256"
    assert _verify_legacy_pbkdf2_sha256("Test1234!", legacy)
    valid, updated = verify_and_update_password("Test1234!", legacy)
    assert valid is True
    assert updated is not None
    assert identify_hash_scheme(updated) == "argon2"
