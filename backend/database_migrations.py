# backend/database_migrations.py
import logging
import shutil
from datetime import datetime, timezone
from pathlib import Path
from sqlalchemy import Column, String, DateTime, text, Table, MetaData

logger = logging.getLogger(__name__)

# Current schema version - increment when making schema changes
CURRENT_SCHEMA_VERSION = "1.1.0"

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

def backup_database() -> Path:
    """Create a backup of the current database."""
    from backend.database import PROJECT_ROOT, DATABASE_FILE_NAME
    
    db_path = PROJECT_ROOT / DATABASE_FILE_NAME
    if not db_path.exists():
        logger.warning("Database file does not exist, skipping backup")
        return None
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_path = PROJECT_ROOT / f"cardshark_backup_{timestamp}.sqlite"
    
    try:
        shutil.copy2(db_path, backup_path)
        logger.info(f"Database backed up to: {backup_path}")
        return backup_path
    except Exception as e:
        logger.error(f"Failed to backup database: {e}")
        raise

def needs_migration(current_version: str) -> bool:
    """Check if database migration is needed."""
    if current_version == "0.0.0":
        # Fresh database, no migration needed (will be created fresh)
        return False
    
    if current_version != CURRENT_SCHEMA_VERSION:
        logger.info(f"Migration needed: {current_version} -> {CURRENT_SCHEMA_VERSION}")
        return True
    
    return False

def migrate_to_1_1_0():
    """Migrate to version 1.1.0 - Add ChatMessage table and enhance ChatSession."""
    from backend.database import engine, SessionLocal
    
    logger.info("Running migration to 1.1.0: Adding ChatMessage table and enhancing ChatSession")
    
    with SessionLocal() as db:
        try:
            # Create ChatMessage table
            db.execute(text("""
                CREATE TABLE IF NOT EXISTS chat_messages (
                    message_id TEXT PRIMARY KEY,
                    chat_session_uuid TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                    status TEXT DEFAULT 'complete',
                    reasoning_content TEXT,
                    metadata_json TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (chat_session_uuid) REFERENCES chat_sessions (chat_session_uuid)
                )
            """))
            
            # Create indexes for ChatMessage table
            db.execute(text("CREATE INDEX IF NOT EXISTS idx_chat_messages_session_uuid ON chat_messages (chat_session_uuid)"))
            db.execute(text("CREATE INDEX IF NOT EXISTS idx_chat_messages_role ON chat_messages (role)"))
            db.execute(text("CREATE INDEX IF NOT EXISTS idx_chat_messages_timestamp ON chat_messages (timestamp)"))
            
            # Add new columns to ChatSession table
            try:
                db.execute(text("ALTER TABLE chat_sessions ADD COLUMN export_format_version TEXT"))
            except Exception:
                # Column might already exist
                pass
                
            try:
                db.execute(text("ALTER TABLE chat_sessions ADD COLUMN is_archived BOOLEAN DEFAULT 0"))
            except Exception:
                # Column might already exist
                pass
            
            # Note: We're not dropping chat_log_path yet as it might be needed for data migration
            # This will be handled in Phase 2 when we implement the transition logic
            
            db.commit()
            logger.info("Migration to 1.1.0 completed successfully")
            
        except Exception as e:
            db.rollback()
            logger.error(f"Migration to 1.1.0 failed: {e}")
            raise

def run_migrations(from_version: str):
    """Run database migrations from the specified version."""
    logger.info(f"Running migrations from version {from_version} to {CURRENT_SCHEMA_VERSION}")
    
    # Initialize backup_path to avoid potential UnboundLocalError
    backup_path = None
    
    try:
        # Create backup before migration
        backup_path = backup_database()
        
        # Run version-specific migrations
        if from_version == "0.0.0":
            # Fresh installation, no migration needed
            pass
        elif from_version < "1.0.0":
            # Add future migration logic here
            # Example: migrate_to_1_0_0()
            pass
        elif from_version == "1.0.0":
            # Migrate from 1.0.0 to 1.1.0
            migrate_to_1_1_0()
        
        # Update database version
        set_database_version(CURRENT_SCHEMA_VERSION, f"Migrated from {from_version}")
        
        logger.info("Database migration completed successfully")
        
    except Exception as e:
        logger.error(f"Database migration failed: {e}")
        if backup_path and backup_path.exists():
            logger.info(f"You can restore from backup: {backup_path}")
        raise

def init_db_with_migrations():
    """Initialize database with migration support."""
    try:
        from backend.database import Base, engine
        
        # Create all tables (this will include any new tables)
        Base.metadata.create_all(bind=engine)
        
        # Check if migration is needed
        current_version = get_database_version()
        
        if current_version == "0.0.0":
            # Fresh database, set initial version
            set_database_version(CURRENT_SCHEMA_VERSION, "Initial database creation")
            logger.info("Fresh database initialized")
        elif needs_migration(current_version):
            # Existing database needs migration
            run_migrations(current_version)
        else:
            logger.info(f"Database is up to date (version {current_version})")
            
    except Exception as e:
        logger.error(f"Database initialization failed: {e}")
        raise
