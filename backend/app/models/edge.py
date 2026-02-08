from __future__ import annotations

import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.node import Node
    from app.models.pipeline import Pipeline


class Edge(Base):
    __tablename__ = "edges"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    pipeline_id: Mapped[str] = mapped_column(
        String, ForeignKey("pipelines.id", ondelete="CASCADE"), nullable=False
    )
    source_node_id: Mapped[str] = mapped_column(
        String, ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False
    )
    target_node_id: Mapped[str] = mapped_column(
        String, ForeignKey("nodes.id", ondelete="CASCADE"), nullable=False
    )

    pipeline: Mapped[Pipeline] = relationship("Pipeline", back_populates="edges")
    source_node: Mapped[Node] = relationship("Node", foreign_keys=[source_node_id])
    target_node: Mapped[Node] = relationship("Node", foreign_keys=[target_node_id])
