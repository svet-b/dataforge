FROM python:3.13-slim

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# Copy dependency files and install
COPY backend/pyproject.toml backend/uv.lock ./backend/
RUN cd backend && uv sync

# Source code is volume-mounted in dev, but copy for image layer caching
COPY backend/ ./backend/

WORKDIR /app/backend
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
