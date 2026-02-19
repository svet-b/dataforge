from __future__ import annotations

from cuid2 import cuid as generate_cuid
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.run import RunHistory
    from app.models.source import Source
    from app.models.uploaded_file import UploadedFile


class Workflow(Base):
    __tablename__ = "workflows"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=generate_cuid)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    query: Mapped[str | None] = mapped_column(Text, nullable=True)
    parameters: Mapped[list[Any]] = mapped_column(JSON, nullable=False, default=list)
    created_at: Mapped[str] = mapped_column(
        String, nullable=False, default=lambda: datetime.now(UTC).isoformat()
    )
    updated_at: Mapped[str] = mapped_column(
        String, nullable=False, default=lambda: datetime.now(UTC).isoformat()
    )

    sources: Mapped[list[Source]] = relationship(
        "Source", back_populates="workflow", cascade="all, delete-orphan"
    )
    uploaded_files: Mapped[list[UploadedFile]] = relationship(
        "UploadedFile", back_populates="workflow", cascade="all, delete-orphan"
    )
    runs: Mapped[list[RunHistory]] = relationship(
        "RunHistory", back_populates="workflow", cascade="all, delete-orphan"
    )
