import tempfile

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import StaticPool, create_engine, event
from sqlalchemy.orm import sessionmaker

from app import config
from app.database import get_db
from app.main import app
from app.models import Base

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@event.listens_for(engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


TestSessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


@pytest.fixture()
def db():
    Base.metadata.create_all(bind=engine)
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    original_data_dir = config.settings.data_dir
    with tempfile.TemporaryDirectory() as tmpdir:
        config.settings.data_dir = tmpdir
        with TestClient(app) as c:
            yield c
        config.settings.data_dir = original_data_dir
    app.dependency_overrides.clear()
