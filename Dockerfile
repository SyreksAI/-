FROM python:3.12-slim

WORKDIR /app

# Установка системных зависимостей
RUN apt-get update && apt-get install -y \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Установка Poetry
RUN pip install --no-cache-dir poetry

ENV POETRY_VIRTUALENVS_CREATE=false

# Копируем файлы зависимостей
COPY pyproject.toml poetry.lock* ./

# Установка зависимостей
RUN poetry install --no-interaction --no-ansi --without dev

# Копируем код
COPY ./app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]