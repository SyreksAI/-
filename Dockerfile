FROM python:3.12-slim

WORKDIR /app

# Системные зависимости (ffmpeg — превью видео в чате)
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        libpq-dev \
        curl \
        ffmpeg \
        libjpeg62-turbo-dev \
        zlib1g-dev \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir poetry

ENV POETRY_VIRTUALENVS_CREATE=false

COPY pyproject.toml poetry.lock ./

RUN poetry install --no-interaction --no-ansi --without dev

COPY ./app ./app
COPY ./alembic ./alembic
COPY alembic.ini ./
COPY .docker/entrypoint.sh /app/.docker/entrypoint.sh
RUN chmod +x /app/.docker/entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["/bin/sh", "/app/.docker/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
