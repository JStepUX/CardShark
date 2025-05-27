#!/usr/bin/env python3
"""
Setup migration table for CardShark database system.

This module provides functionality to set up and manage the database migration 
table used to track schema versions and migration history. It ensures consistent 
database path resolution and implements comprehensive error handling for all 
database operations.

The migration table tracks:
- Schema version history
- Migration timestamps
- Migration descriptions
- Rollback information when available

This module follows CardShark's established patterns for database operations
and integrates with the existing migration system in database_migrations.py.
"""

import logging
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Dict, Any, List
from sqlalchemy import create_engine, text, Column, String, DateTime, Boolean, MetaData, Table
from sqlalchemy.exc import SQLAlchemyError, OperationalError, IntegrityError
from sqlalchemy.orm import sessionmaker

# Add project root to path for consistent imports
PROJECT_ROOT = Path(__file__).parent.absolute()
sys.path.insert(0, str(PROJECT_ROOT))

# Import after path setup to ensure consistent module resolution
try:
    from backend.database import DATABASE_FILE_NAME, PROJECT_ROOT as DB_PROJECT_ROOT, DATABASE_URL
    from backend.database_migrations import CURRENT_SCHEMA_VERSION
except ImportError as e:
    # Fallback for standalone execution
    print(f"Warning: Could not import from backend modules: {e}")
    DATABASE_FILE_NAME = "cardshark.sqlite"
    DB_PROJECT_ROOT = PROJECT_ROOT
    DATABASE_URL = f"sqlite:///{PROJECT_ROOT / DATABASE_FILE_NAME}"
    CURRENT_SCHEMA_VERSION = "1.0.0"

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class DatabasePathError(Exception):
    """Raised when database path resolution fails."""
    pass


class MigrationTableError(Exception):
    """Raised when migration table operations fail."""
    pass


def get_database_path() -> Path:
    """
    Get the consistent database path following CardShark's established pattern.
    
    Returns:
        Path: Absolute path to the database file
        
    Raises:
        DatabasePathError: If path resolution fails or path is invalid
    """
    try:
        # Use the same path resolution as backend.database module
        db_path = DB_PROJECT_ROOT / DATABASE_FILE_NAME
        
        # Ensure the parent directory exists
        db_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Validate path accessibility
        if db_path.exists() and not db_path.is_file():
            raise DatabasePathError(f"Database path exists but is not a file: {db_path}")
            
        logger.debug(f"Database path resolved to: {db_path}")
        return db_path
        
    except Exception as e:
        raise DatabasePathError(f"Failed to resolve database path: {e}") from e


def get_database_engine():
    """
    Create a database engine with consistent configuration.
    
    Returns:
        sqlalchemy.Engine: Configured database engine
        
    Raises:
        DatabasePathError: If database path resolution fails
        SQLAlchemyError: If engine creation fails
    """
    try:
        # Ensure database path is valid
        db_path = get_database_path()
        
        # Use the same URL pattern as backend.database
        engine = create_engine(
            DATABASE_URL,
            connect_args={"check_same_thread": False},
            echo=False  # Set to True for SQL debugging
        )
        
        logger.debug(f"Database engine created for: {DATABASE_URL}")
        return engine
        
    except DatabasePathError:
        raise
    except Exception as e:
        raise SQLAlchemyError(f"Failed to create database engine: {e}") from e


def check_database_connectivity(engine) -> bool:
    """
    Test database connectivity and basic operations.
    
    Args:
        engine: SQLAlchemy engine instance
        
    Returns:
        bool: True if database is accessible and functional
        
    Raises:
        OperationalError: If database connection fails
    """
    try:
        with engine.connect() as connection:
            # Test basic connectivity
            result = connection.execute(text("SELECT 1"))
            test_value = result.fetchone()[0]
            
            if test_value != 1:
                raise OperationalError("Database connectivity test failed", None, None)
                
            logger.debug("Database connectivity test passed")
            return True
            
    except Exception as e:
        logger.error(f"Database connectivity test failed: {e}")
        raise OperationalError(f"Database connection failed: {e}", None, None) from e


def create_migration_table(engine) -> bool:
    """
    Create the database migration tracking table if it doesn't exist.
    
    Args:
        engine: SQLAlchemy engine instance
        
    Returns:
        bool: True if table was created or already exists
        
    Raises:
        MigrationTableError: If table creation fails
    """
    try:
        metadata = MetaData()
        
        # Define migration table schema
        migration_table = Table(
            'database_migrations', metadata,
            Column('id', String, primary_key=True),  # Migration ID/version
            Column('version', String, nullable=False),  # Schema version
            Column('applied_at', DateTime, nullable=False, default=lambda: datetime.now(timezone.utc)),
            Column('description', String, nullable=True),  # Migration description
            Column('rollback_sql', String, nullable=True),  # Rollback commands if available
            Column('is_rollback', Boolean, default=False),  # Track if this is a rollback entry
            Column('checksum', String, nullable=True),  # Migration file checksum for integrity
        )
        
        # Create table if it doesn't exist
        metadata.create_all(engine, checkfirst=True)
        
        logger.info("Migration table created or verified successfully")
        return True
        
    except Exception as e:
        error_msg = f"Failed to create migration table: {e}"
        logger.error(error_msg)
        raise MigrationTableError(error_msg) from e


def get_migration_history(engine) -> List[Dict[str, Any]]:
    """
    Retrieve the complete migration history from the database.
    
    Args:
        engine: SQLAlchemy engine instance
        
    Returns:
        List[Dict]: List of migration records ordered by application time
        
    Raises:
        MigrationTableError: If migration history retrieval fails
    """
    try:
        with engine.connect() as connection:
            # Check if migration table exists
            result = connection.execute(text(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='database_migrations'"
            ))
            
            if not result.fetchone():
                logger.info("Migration table does not exist, returning empty history")
                return []
            
            # Retrieve migration history
            result = connection.execute(text(
                """
                SELECT id, version, applied_at, description, is_rollback, checksum
                FROM database_migrations 
                ORDER BY applied_at ASC
                """
            ))
            
            history = []
            for row in result:
                history.append({
                    'id': row[0],
                    'version': row[1],
                    'applied_at': row[2],
                    'description': row[3],
                    'is_rollback': bool(row[4]),
                    'checksum': row[5]
                })
            
            logger.debug(f"Retrieved {len(history)} migration records")
            return history
            
    except Exception as e:
        error_msg = f"Failed to retrieve migration history: {e}"
        logger.error(error_msg)
        raise MigrationTableError(error_msg) from e


def record_migration(engine, migration_id: str, version: str, description: Optional[str] = None,
                    rollback_sql: Optional[str] = None, checksum: Optional[str] = None) -> bool:
    """
    Record a migration in the database migration table.
    
    Args:
        engine: SQLAlchemy engine instance
        migration_id: Unique identifier for the migration
        version: Schema version after this migration
        description: Human-readable description of the migration
        rollback_sql: SQL commands to rollback this migration (if available)
        checksum: Migration file checksum for integrity verification
        
    Returns:
        bool: True if migration was recorded successfully
        
    Raises:
        MigrationTableError: If migration recording fails
        IntegrityError: If migration ID already exists
    """
    try:
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        
        with SessionLocal() as session:
            # Check if migration already exists
            result = session.execute(text(
                "SELECT id FROM database_migrations WHERE id = :migration_id"
            ), {"migration_id": migration_id})
            
            if result.fetchone():
                raise IntegrityError(
                    f"Migration '{migration_id}' already exists",
                    None, None
                )
            
            # Insert new migration record
            session.execute(text(
                """
                INSERT INTO database_migrations 
                (id, version, applied_at, description, rollback_sql, is_rollback, checksum)
                VALUES (:id, :version, :applied_at, :description, :rollback_sql, :is_rollback, :checksum)
                """
            ), {
                "id": migration_id,
                "version": version,
                "applied_at": datetime.now(timezone.utc),
                "description": description,
                "rollback_sql": rollback_sql,
                "is_rollback": False,
                "checksum": checksum
            })
            
            session.commit()
            logger.info(f"Migration '{migration_id}' recorded successfully")
            return True
            
    except IntegrityError:
        raise
    except Exception as e:
        error_msg = f"Failed to record migration '{migration_id}': {e}"
        logger.error(error_msg)
        raise MigrationTableError(error_msg) from e


def get_current_schema_version(engine) -> Optional[str]:
    """
    Get the current schema version from the migration table.
    
    Args:
        engine: SQLAlchemy engine instance
        
    Returns:
        Optional[str]: Current schema version, None if no migrations exist
        
    Raises:
        MigrationTableError: If version retrieval fails
    """
    try:
        history = get_migration_history(engine)
        
        if not history:
            return None
            
        # Find the latest non-rollback migration
        for record in reversed(history):
            if not record['is_rollback']:
                return record['version']
                
        return None
        
    except Exception as e:
        error_msg = f"Failed to get current schema version: {e}"
        logger.error(error_msg)
        raise MigrationTableError(error_msg) from e


def verify_migration_integrity(engine) -> Dict[str, Any]:
    """
    Verify the integrity of the migration system and database.
    
    Args:
        engine: SQLAlchemy engine instance
        
    Returns:
        Dict[str, Any]: Verification results including status and any issues found
        
    Raises:
        MigrationTableError: If verification fails
    """
    try:
        verification_results = {
            'status': 'success',
            'issues': [],
            'migration_count': 0,
            'current_version': None,
            'database_accessible': False
        }
        
        # Test database connectivity
        verification_results['database_accessible'] = check_database_connectivity(engine)
        
        # Get migration history
        history = get_migration_history(engine)
        verification_results['migration_count'] = len(history)
        
        # Get current version
        current_version = get_current_schema_version(engine)
        verification_results['current_version'] = current_version
        
        # Check for common issues
        if history:
            # Check for duplicate migration IDs
            migration_ids = [record['id'] for record in history]
            duplicates = set([mid for mid in migration_ids if migration_ids.count(mid) > 1])
            if duplicates:
                verification_results['issues'].append(f"Duplicate migration IDs found: {duplicates}")
            
            # Check version consistency
            if current_version and current_version != CURRENT_SCHEMA_VERSION:
                verification_results['issues'].append(
                    f"Schema version mismatch: DB has {current_version}, expected {CURRENT_SCHEMA_VERSION}"
                )
        
        if verification_results['issues']:
            verification_results['status'] = 'warning'
            
        logger.info(f"Migration integrity verification completed: {verification_results['status']}")
        return verification_results
        
    except Exception as e:
        error_msg = f"Migration integrity verification failed: {e}"
        logger.error(error_msg)
        raise MigrationTableError(error_msg) from e


def setup_migration_system() -> Dict[str, Any]:
    """
    Set up the complete migration system with proper error handling.
    
    This is the main entry point for migration table setup. It performs:
    1. Database path resolution and validation
    2. Database connectivity testing
    3. Migration table creation
    4. System integrity verification
    
    Returns:
        Dict[str, Any]: Setup results including status and any issues
        
    Raises:
        DatabasePathError: If database path resolution fails
        SQLAlchemyError: If database operations fail
        MigrationTableError: If migration table operations fail
    """
    setup_results = {
        'status': 'success',
        'database_path': None,
        'migration_table_created': False,
        'integrity_check': None,
        'errors': []
    }
    
    try:
        logger.info("Starting migration system setup...")
        
        # Step 1: Resolve database path
        try:
            db_path = get_database_path()
            setup_results['database_path'] = str(db_path)
            logger.info(f"Database path resolved: {db_path}")
        except DatabasePathError as e:
            setup_results['errors'].append(f"Database path error: {e}")
            raise
        
        # Step 2: Create and test database engine
        try:
            engine = get_database_engine()
            check_database_connectivity(engine)
            logger.info("Database engine created and connectivity verified")
        except (SQLAlchemyError, OperationalError) as e:
            setup_results['errors'].append(f"Database connectivity error: {e}")
            raise
        
        # Step 3: Create migration table
        try:
            setup_results['migration_table_created'] = create_migration_table(engine)
            logger.info("Migration table setup completed")
        except MigrationTableError as e:
            setup_results['errors'].append(f"Migration table error: {e}")
            raise
        
        # Step 4: Verify system integrity
        try:
            integrity_results = verify_migration_integrity(engine)
            setup_results['integrity_check'] = integrity_results
            
            if integrity_results['status'] != 'success':
                setup_results['status'] = 'warning'
                logger.warning("Migration system setup completed with warnings")
            else:
                logger.info("Migration system setup completed successfully")
                
        except MigrationTableError as e:
            setup_results['errors'].append(f"Integrity verification error: {e}")
            setup_results['status'] = 'warning'  # Non-fatal for setup
        
        return setup_results
        
    except Exception as e:
        setup_results['status'] = 'error'
        setup_results['errors'].append(f"Unexpected error during setup: {e}")
        logger.error(f"Migration system setup failed: {e}")
        raise


def main():
    """
    Main entry point for standalone execution.
    
    This function provides a command-line interface for setting up the migration table
    and can be used for testing or manual setup operations.
    """
    try:
        print("CardShark Database Migration Table Setup")
        print("=" * 40)
        
        # Run setup
        results = setup_migration_system()
        
        # Print results
        print(f"\nSetup Status: {results['status'].upper()}")
        print(f"Database Path: {results['database_path']}")
        print(f"Migration Table Created: {results['migration_table_created']}")
        
        if results['integrity_check']:
            integrity = results['integrity_check']
            print(f"\nIntegrity Check:")
            print(f"  Status: {integrity['status']}")
            print(f"  Database Accessible: {integrity['database_accessible']}")
            print(f"  Migration Count: {integrity['migration_count']}")
            print(f"  Current Version: {integrity['current_version']}")
            
            if integrity['issues']:
                print("  Issues Found:")
                for issue in integrity['issues']:
                    print(f"    - {issue}")
        
        if results['errors']:
            print(f"\nErrors:")
            for error in results['errors']:
                print(f"  - {error}")
        
        # Exit with appropriate code
        if results['status'] == 'error':
            sys.exit(1)
        elif results['status'] == 'warning':
            sys.exit(2)
        else:
            sys.exit(0)
            
    except KeyboardInterrupt:
        print("\nOperation cancelled by user")
        sys.exit(130)
    except Exception as e:
        print(f"Fatal error: {e}")
        logger.exception("Fatal error during migration table setup")
        sys.exit(1)


if __name__ == "__main__":
    main()