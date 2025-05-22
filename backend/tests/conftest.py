# backend/tests/conftest.py
import sys
from pathlib import Path
import pytest

# Add project root to sys.path to allow for absolute imports like 'from backend.database import Base'
project_root = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(project_root))
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session as SQLAlchemySession
from typing import Generator

# Import the Base from your application's database module.
# This ensures we are using the same Base and MetaData instance that the models use.
from backend.database import Base
# Ensure all models are imported and registered with Base.metadata
# This line is crucial and should come before Base.metadata.create_all is called.
import backend.sql_models # noqa: F401 - Ensures models are loaded

# Use a separate in-memory SQLite database for tests for speed and isolation
TEST_DATABASE_URL = "sqlite:///:memory:"

@pytest.fixture(scope="session")
def engine():
    """
    Creates a new SQLAlchemy engine for the test session.
    Uses an in-memory SQLite database.
    """
    return create_engine(TEST_DATABASE_URL, connect_args={"check_same_thread": False})

@pytest.fixture(scope="session")
def tables(engine):
    """
    Creates all database tables once per test session.
    Depends on the 'engine' fixture.
    All models should have been imported (as backend.sql_models is above)
    to ensure Base.metadata contains all table definitions before this runs.
    """
    Base.metadata.create_all(bind=engine)
    yield
    # For in-memory databases, dropping tables might not be strictly necessary,
    # but can be good practice if using a persistent test database.
    # Base.metadata.drop_all(bind=engine)

@pytest.fixture(scope="function")
def db_session(engine, tables) -> Generator[SQLAlchemySession, None, None]:
    """
    Provides a database session for each test function.
    Creates a new session and rolls back any changes after the test.
    Depends on the 'tables' fixture to ensure tables are created.
    """
    connection = engine.connect()
    # Begin a non-ORM transaction
    transaction = connection.begin()

    # Bind an individual session to the connection for better transaction control
    SessionLocal_test = sessionmaker(bind=connection)
    session = SessionLocal_test()

    yield session

    session.close()
    # Rollback the transaction to ensure test isolation
    transaction.rollback()
    # Return connection to the Engine pool
    connection.close()

# If your FastAPI application uses dependency overrides for 'get_db',
# you might want to override it here for integration tests.
# This part is optional if your tests directly use the db_session fixture
# and don't go through the full FastAPI app request lifecycle for DB access.

# from backend.main import app  # Assuming your FastAPI app instance is in backend.main
# from backend.database import get_db # The original get_db dependency

# @pytest.fixture(scope="function", autouse=True) # autouse if you want it for all tests using the app
# def override_get_db(db_session: SQLAlchemySession):
#     """
#     Overrides the get_db dependency in the FastAPI app for the duration of a test.
#     """
#     def _override_get_db():
#         try:
#             yield db_session
#         finally:
#             # The db_session fixture itself handles session closing and rollback
#             pass
    
#     # Ensure 'app' is defined and 'get_db' is the correct dependency
#     # if hasattr(app, 'dependency_overrides'):
#     #     app.dependency_overrides[get_db] = _override_get_db
#     #     yield
#     #     app.dependency_overrides.pop(get_db, None)
#     # else: # Fallback if app or dependency_overrides are not as expected
#     yield # Still yield to allow test execution