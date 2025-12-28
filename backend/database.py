import logging
import os
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Configure logging (this is a basic example, you might have a more advanced setup)
# It's good practice to get a logger specific to the current module
logger = logging.getLogger(__name__)

import pathlib
from backend.utils.path_utils import get_application_base_path

# Define the database file path relative to the application base directory
# This will place cardshark.sqlite in the main project directory (x:/Bolt-On/cardshark)
# When running as a PyInstaller EXE, it will be placed next to the EXE file
# When running from source, it will be placed in the project root
DATABASE_FILE_NAME = "cardshark.sqlite"
# Use the path_utils helper to get the correct base path for both dev and frozen environments
PROJECT_ROOT = get_application_base_path()
DATABASE_URL = f"sqlite:///{PROJECT_ROOT / DATABASE_FILE_NAME}"

engine = create_engine(
    DATABASE_URL, connect_args={"check_same_thread": False} # check_same_thread is needed for SQLite with FastAPI/Uvicorn
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    """
    Dependency to get a database session.
    Ensures the session is closed after the request.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """
    Initializes the database and creates tables if they don't exist.
    This should be called once on application startup.
    """
    # Import all modules here that define models so that
    # they are registered with Base.metadata - BEFORE creating tables.
    # This ensures that Base has all table metadata before create_all is called.
    # Models should be imported in the main application file before calling init_db
    try:
        # Use migration-aware initialization
        from backend.database_migrations import init_db_with_migrations
        init_db_with_migrations()
        logger.info("Database tables checked/created successfully.")
    except SQLAlchemyError as e: # More specific exception for database errors
        logger.error(f"A database error occurred during table creation: {e}", exc_info=True)
        raise # Re-raise to allow higher-level handling
    except Exception as e: # Catch other unexpected errors
        logger.error(f"An unexpected error occurred during database initialization: {e}", exc_info=True)
        raise