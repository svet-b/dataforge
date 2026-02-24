FROM python:3.14-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app/backend

# Keep virtual environment inside project for predictable uv run behavior.
ENV UV_PROJECT_ENVIRONMENT=/app/backend/.venv

# Copy dependency files and install.
COPY pyproject.toml uv.lock ./
RUN uv sync

# Source code is volume-mounted in dev, but copy for image layer caching.
COPY . .

CMD ["sh", "-c", "uv run alembic upgrade head && uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload"]
