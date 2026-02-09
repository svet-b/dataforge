from __future__ import annotations

import uuid
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.pipeline import Pipeline


class Source(Base):
    __tablename__ = "sources"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    pipeline_id: Mapped[str] = mapped_column(
        String, ForeignKey("pipelines.id", ondelete="CASCADE"), nullable=False
    )
    table_name: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(Text, nullable=False)  # "file" or "api"
    config: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    pipeline: Mapped[Pipeline] = relationship("Pipeline", back_populates="sources")
