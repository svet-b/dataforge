from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.ids import generate_cuid
from app.models.base import Base

if TYPE_CHECKING:
    from app.models.workflow import Workflow


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_cuid)
    workflow_id: Mapped[str] = mapped_column(
        String, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False
    )
    table_name: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(Text, nullable=False)  # "file" or "api"
    config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    workflow: Mapped[Workflow] = relationship("Workflow", back_populates="sources")
