from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from cuid2 import cuid_wrapper
from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

generate_cuid = cuid_wrapper()

if TYPE_CHECKING:
    from app.models.workflow import Workflow


class UploadedFile(Base):
    __tablename__ = "uploaded_files"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_cuid)
    workflow_id: Mapped[str] = mapped_column(
        String, ForeignKey("workflows.id", ondelete="CASCADE"), nullable=False
    )
    filename: Mapped[str] = mapped_column(Text, nullable=False)
    file_type: Mapped[str] = mapped_column(Text, nullable=False)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    uploaded_at: Mapped[str] = mapped_column(
        String, nullable=False, default=lambda: datetime.now(UTC).isoformat()
    )

    workflow: Mapped[Workflow] = relationship("Workflow", back_populates="uploaded_files")
