#!/bin/sh
set -e

echo "Waiting for PostgreSQL..."
python - <<'PY'
import sys
import time

from sqlalchemy import create_engine, text

from app.config import settings
from app.database import normalize_database_url

url = normalize_database_url(settings.DATABASE_URL)
engine = create_engine(url, pool_pre_ping=True)

for attempt in range(1, 31):
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        print("Database is ready")
        break
    except Exception as exc:
        print(f"Database not ready ({attempt}/30): {exc}")
        time.sleep(2)
else:
    sys.exit("Database did not become ready in time")
PY

echo "Running Alembic migrations..."
alembic upgrade head

exec "$@"
