import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import agent, execution, llm, workflows

logging.basicConfig(level=settings.log_level.upper())

app = FastAPI(title="DataForge", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agent.router)
app.include_router(execution.router)
app.include_router(llm.router)
app.include_router(workflows.router)


@app.get("/api/health")
async def health_check() -> dict[str, str]:
    return {"status": "ok", "version": "0.1.0"}
