#!/usr/bin/env python3
"""
Debug script to isolate the migration verification issue.
"""

import sys
from pathlib import Path

# Add the project root to the Python path
PROJECT_ROOT = Path(__file__).parent
sys.path.insert(0, str(PROJECT_ROOT))

def test_imports():
    """Test all the imports that might be causing issues."""
    print("Testing imports...")
    
    try:
        from setup_migration_table import (
            get_database_path, get_database_engine, get_migration_history,
            get_current_schema_version, verify_migration_integrity,
            DatabasePathError, MigrationTableError
        )
        print("✅ setup_migration_table imports successful")
    except Exception as e:
        print(f"❌ setup_migration_table import failed: {e}")
        print(f"❌ Exception type: {type(e)}")
        print(f"❌ Exception string representation: '{str(e)}'")
        return False
    
    try:
        from backend.database_migrations import CURRENT_SCHEMA_VERSION
        print(f"✅ CURRENT_SCHEMA_VERSION imported: {CURRENT_SCHEMA_VERSION}")
    except Exception as e:
        print(f"❌ CURRENT_SCHEMA_VERSION import failed: {e}")
        print(f"❌ Exception type: {type(e)}")
        print(f"❌ Exception string representation: '{str(e)}'")
    
    return True

def test_database_access():
    """Test database access."""
    print("\nTesting database access...")
    
    try:
        from setup_migration_table import get_database_engine, get_database_path
        
        print(f"Database path: {get_database_path()}")
        engine = get_database_engine()
        print("✅ Database engine created successfully")
        
        # Test connection
        with engine.connect() as conn:
            result = conn.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [row[0] for row in result.fetchall()]
            print(f"✅ Database connection successful, found {len(tables)} tables: {tables}")
        
        return True
    except Exception as e:
        print(f"❌ Database access failed: {e}")
        print(f"❌ Exception type: {type(e)}")
        print(f"❌ Exception string representation: '{str(e)}'")
        return False

def test_integrity_verification():
    """Test the integrity verification function directly."""
    print("\nTesting integrity verification...")
    
    try:
        from setup_migration_table import get_database_engine, verify_migration_integrity
        
        engine = get_database_engine()
        result = verify_migration_integrity(engine)
        print(f"✅ Integrity verification successful: {result}")
        return True
    except Exception as e:
        print(f"❌ Integrity verification failed: {e}")
        print(f"❌ Exception type: {type(e)}")
        print(f"❌ Exception string representation: '{str(e)}'")
        print(f"❌ Exception args: {e.args}")
        return False

def main():
    """Run all tests."""
    print("CardShark Migration Debug Script")
    print("=" * 40)
    
    if not test_imports():
        return 1
    
    if not test_database_access():
        return 1
    
    if not test_integrity_verification():
        return 1
    
    print("\n✅ All tests passed!")
    return 0

if __name__ == "__main__":
    exit(main())
