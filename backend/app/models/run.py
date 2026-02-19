from __future__ import annotations

from cuid2 import cuid_wrapper

generate_cuid = cuid_wrapper()
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.workflow import Workflow


class RunHistory(Base):
    __tablename__ = "run_history"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_cuid)
    workflow_id: Mapped[str] = mapped_column(
        String, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False
    )
    parameters: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    started_at: Mapped[str] = mapped_column(
        String, nullable=False, default=lambda: datetime.now(UTC).isoformat()
    )
    completed_at: Mapped[str | None] = mapped_column(String, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    row_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    schema_info: Mapped[list[dict[str, str]] | None] = mapped_column(JSON, nullable=True)
    output_preview: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    error: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    node_timings: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)

    workflow: Mapped[Workflow] = relationship("Workflow", back_populates="runs")
