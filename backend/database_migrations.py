# backend/database_migrations.py
"""
Database initialization and migration handling.

Design Philosophy:
- Files (PNG, JSON) are the source of truth for portable data
- Database is an index/cache that can be deleted and rebuilt
- On schema version mismatch, delete old database and rebuild fresh
- No backwards compatibility concerns - fresh rebuild is acceptable
"""
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from sqlalchemy import Column, String, DateTime, text, Table, MetaData

logger = logging.getLogger(__name__)

# Current schema version - increment when making schema changes
# When this changes, the old database will be deleted and rebuilt fresh
CURRENT_SCHEMA_VERSION = "2.2.0"  # Added session_notes and compression_enabled columns for Context Lens feature



def get_database_path() -> Path:
    """Get the path to the database file."""
    from backend.database import PROJECT_ROOT, DATABASE_FILE_NAME
    return PROJECT_ROOT / DATABASE_FILE_NAME


def database_exists() -> bool:
    """Check if the database file exists."""
    return get_database_path().exists()


def get_database_version() -> str:
    """Get the current database schema version."""
    try:
        from backend.database import engine, SessionLocal
        
        # Check if version table exists
        metadata = MetaData()
        metadata.reflect(bind=engine)
        
        if 'database_version' not in metadata.tables:
            # No version table exists, this is a fresh database
            return "0.0.0"
        
        with SessionLocal() as db:
            result = db.execute(text("SELECT version FROM database_version LIMIT 1"))
            row = result.fetchone()
            if row:
                return row[0]
            else:
                return "0.0.0"
    except Exception as e:
        logger.warning(f"Could not read database version: {e}")
        return "0.0.0"


def set_database_version(version: str, description: str = None):
    """Set the database schema version."""
    try:
        from backend.database import engine, SessionLocal
        
        # Create version table if it doesn't exist
        metadata = MetaData()
        version_table = Table(
            'database_version', metadata,
            Column('version', String, primary_key=True),
            Column('applied_at', DateTime, default=lambda: datetime.now(timezone.utc)),
            Column('description', String, nullable=True)
        )
        metadata.create_all(engine)
        
        with SessionLocal() as db:
            # Remove existing version record
            db.execute(text("DELETE FROM database_version"))
            # Add new version record
            db.execute(text(
                "INSERT INTO database_version (version, applied_at, description) VALUES (:version, :applied_at, :description)"
            ), {
                "version": version,
                "applied_at": datetime.now(timezone.utc),
                "description": description
            })
            db.commit()
            logger.info(f"Database version set to {version}")
    except Exception as e:
        logger.error(f"Failed to set database version: {e}")
        raise


def delete_database():
    """Delete the existing database file."""
    from backend.database import engine
    
    db_path = get_database_path()
    
    if not db_path.exists():
        logger.info("No existing database to delete")
        return
    
    try:
        # Dispose of the engine to release any connections
        engine.dispose()
        
        # Delete the database file
        os.remove(db_path)
        logger.info(f"Deleted old database: {db_path}")
    except Exception as e:
        logger.error(f"Failed to delete database: {e}")
        raise


def needs_rebuild() -> bool:
    """
    Check if the database needs to be rebuilt.
    Returns True if:
    - Database doesn't exist (fresh install)
    - Schema version doesn't match current version
    """
    if not database_exists():
        logger.info("Database does not exist - fresh install")
        return True
    
    current_version = get_database_version()
    
    if current_version != CURRENT_SCHEMA_VERSION:
        logger.info(f"Schema version mismatch: {current_version} != {CURRENT_SCHEMA_VERSION}")
        return True
    
    return False


def create_fresh_database():
    """Create a fresh database with all tables."""
    from backend.database import Base, engine
    
    logger.info("Creating fresh database with all tables...")
    
    # Create all tables defined in sql_models
    Base.metadata.create_all(bind=engine)
    
    # Set the schema version
    set_database_version(CURRENT_SCHEMA_VERSION, "Fresh database creation")
    
    logger.info(f"Fresh database created with schema version {CURRENT_SCHEMA_VERSION}")


def init_db_with_migrations():
    """
    Initialize the database.
    
    Strategy:
    1. If database doesn't exist or schema version mismatches -> delete and rebuild
    2. After rebuild, character and user indexing services will populate data from files
    """
    try:
        if needs_rebuild():
            if database_exists():
                logger.info("Schema version changed - rebuilding database from scratch")
                delete_database()
            
            # Need to recreate engine after deleting database
            from backend.database import engine, Base
            
            # Re-create engine connection (the engine will auto-connect to new file)
            Base.metadata.create_all(bind=engine)
            
            # Set version
            set_database_version(CURRENT_SCHEMA_VERSION, "Fresh database creation")
            
            logger.info("Database rebuilt successfully. Character and user data will be indexed from files.")
        else:
            logger.info(f"Database is up to date (version {CURRENT_SCHEMA_VERSION})")
            
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise
