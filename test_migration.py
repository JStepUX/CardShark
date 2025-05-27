#!/usr/bin/env python3
"""
CardShark Migration Testing Module

This module provides comprehensive testing functionality for the CardShark database
migration system. It includes unit tests, integration tests, and validation utilities
to ensure migration system reliability and consistency.

Author: CardShark Development Team
"""

import unittest
import tempfile
import shutil
import sqlite3
from pathlib import Path
from datetime import datetime
from unittest.mock import patch, MagicMock
import sys
import os

# Add the project root to the Python path
PROJECT_ROOT = Path(__file__).parent
sys.path.insert(0, str(PROJECT_ROOT))

try:
    from setup_migration_table import (
        get_database_path, get_database_engine, create_migration_table,
        record_migration, get_migration_history, get_current_schema_version,
        verify_migration_integrity, setup_migration_system,
        DatabasePathError, MigrationTableError
    )
except ImportError as e:
    print(f"Error importing migration modules: {e}")
    sys.exit(1)


class TestMigrationSystem(unittest.TestCase):
    """Comprehensive test suite for the CardShark migration system."""
    
    def setUp(self):
        """Set up test environment with temporary database."""
        self.test_dir = tempfile.mkdtemp()
        self.test_db_path = Path(self.test_dir) / "test_cardshark.sqlite"
        
        # Mock the database path for testing
        self.path_patcher = patch('setup_migration_table.get_database_path')
        self.mock_get_path = self.path_patcher.start()
        self.mock_get_path.return_value = self.test_db_path
        
    def tearDown(self):
        """Clean up test environment."""
        self.path_patcher.stop()
        if Path(self.test_dir).exists():
            shutil.rmtree(self.test_dir)
    
    def test_database_path_resolution(self):
        """Test database path resolution functionality."""
        # Test normal path resolution
        path = get_database_path()
        self.assertEqual(path, self.test_db_path)
        self.assertIsInstance(path, Path)
    
    def test_database_engine_creation(self):
        """Test database engine creation."""
        # Ensure database file exists
        self.test_db_path.touch()
        
        engine = get_database_engine()
        self.assertIsNotNone(engine)
        
        # Test connection
        with engine.connect() as conn:
            result = conn.execute("SELECT 1").fetchone()
            self.assertEqual(result[0], 1)
    
    def test_migration_table_creation(self):
        """Test migration table creation functionality."""
        # Create database and migration table
        self.test_db_path.touch()
        engine = get_database_engine()
        
        # Test initial creation
        create_migration_table(engine)
        
        # Verify table exists and has correct structure
        with engine.connect() as conn:
            result = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='database_migrations'"
            ).fetchone()
            self.assertIsNotNone(result)
            
            # Check table structure
            columns = conn.execute("PRAGMA table_info(database_migrations)").fetchall()
            column_names = [col[1] for col in columns]
            expected_columns = [
                'id', 'version', 'applied_at', 'description', 
                'rollback_sql', 'is_rollback', 'checksum'
            ]
            for col in expected_columns:
                self.assertIn(col, column_names)
        
        # Test idempotent creation (should not raise error)
        create_migration_table(engine)
    
    def test_migration_recording(self):
        """Test migration recording functionality."""
        self.test_db_path.touch()
        engine = get_database_engine()
        create_migration_table(engine)
        
        # Test recording a migration
        test_migration = {
            'version': '001_initial_schema',
            'description': 'Initial database schema',
            'rollback_sql': 'DROP TABLE test_table;',
            'checksum': 'abc123def456'
        }
        
        migration_id = record_migration(
            engine,
            test_migration['version'],
            test_migration['description'],
            test_migration['rollback_sql'],
            test_migration['checksum']
        )
        
        self.assertIsNotNone(migration_id)
        self.assertIsInstance(migration_id, int)
        
        # Verify migration was recorded
        with engine.connect() as conn:
            result = conn.execute(
                "SELECT * FROM database_migrations WHERE version = ?",
                (test_migration['version'],)
            ).fetchone()
            
            self.assertIsNotNone(result)
            self.assertEqual(result[1], test_migration['version'])
            self.assertEqual(result[3], test_migration['description'])
            self.assertEqual(result[4], test_migration['rollback_sql'])
            self.assertEqual(result[6], test_migration['checksum'])
            self.assertFalse(result[5])  # is_rollback should be False
    
    def test_migration_history_retrieval(self):
        """Test migration history retrieval."""
        self.test_db_path.touch()
        engine = get_database_engine()
        create_migration_table(engine)
        
        # Record multiple migrations
        migrations = [
            ('001_initial', 'Initial schema', 'DROP TABLE users;', 'hash1'),
            ('002_add_indexes', 'Add database indexes', 'DROP INDEX idx_user_email;', 'hash2'),
            ('003_new_features', 'Add new feature tables', 'DROP TABLE features;', 'hash3')
        ]
        
        for version, desc, rollback, checksum in migrations:
            record_migration(engine, version, desc, rollback, checksum)
        
        # Test getting all history
        history = get_migration_history(engine)
        self.assertEqual(len(history), 3)
        
        # Verify order (should be by applied_at)
        self.assertEqual(history[0][1], '001_initial')
        self.assertEqual(history[1][1], '002_add_indexes')
        self.assertEqual(history[2][1], '003_new_features')
        
        # Test getting limited history
        limited_history = get_migration_history(engine, limit=2)
        self.assertEqual(len(limited_history), 2)
    
    def test_current_schema_version(self):
        """Test current schema version retrieval."""
        self.test_db_path.touch()
        engine = get_database_engine()
        create_migration_table(engine)
        
        # Test with no migrations
        version = get_current_schema_version(engine)
        self.assertIsNone(version)
        
        # Add migrations
        record_migration(engine, '001_initial', 'Initial', '', 'hash1')
        record_migration(engine, '002_updates', 'Updates', '', 'hash2')
        
        # Test with migrations
        version = get_current_schema_version(engine)
        self.assertEqual(version, '002_updates')
    
    def test_migration_integrity_verification(self):
        """Test migration integrity verification."""
        self.test_db_path.touch()
        engine = get_database_engine()
        create_migration_table(engine)
        
        # Record migration with known checksum
        test_checksum = 'abc123def456'
        record_migration(engine, '001_test', 'Test migration', '', test_checksum)
        
        # Test integrity verification
        is_valid = verify_migration_integrity(engine)
        self.assertTrue(is_valid)
        
        # Corrupt the checksum
        with engine.connect() as conn:
            conn.execute(
                "UPDATE database_migrations SET checksum = 'corrupted' WHERE version = '001_test'"
            )
            conn.commit()
        
        # Test with corrupted data
        is_valid = verify_migration_integrity(engine)
        self.assertFalse(is_valid)
    
    def test_complete_system_setup(self):
        """Test complete migration system setup."""
        self.test_db_path.touch()
        
        # Test system setup
        setup_migration_system()
        
        # Verify everything was set up correctly
        engine = get_database_engine()
        
        # Check migration table exists
        with engine.connect() as conn:
            result = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='database_migrations'"
            ).fetchone()
            self.assertIsNotNone(result)
        
        # Verify integrity
        is_valid = verify_migration_integrity(engine)
        self.assertTrue(is_valid)
    
    def test_error_handling(self):
        """Test error handling scenarios."""
        # Test with non-existent database path
        with patch('setup_migration_table.get_database_path') as mock_path:
            mock_path.return_value = Path("/nonexistent/path/db.sqlite")
            
            with self.assertRaises(DatabasePathError):
                get_database_engine()
        
        # Test migration table operations on invalid engine
        with patch('setup_migration_table.get_database_engine') as mock_engine:
            mock_engine.return_value = None
            
            with self.assertRaises(MigrationTableError):
                create_migration_table(None)
    
    def test_rollback_migrations(self):
        """Test rollback migration functionality."""
        self.test_db_path.touch()
        engine = get_database_engine()
        create_migration_table(engine)
        
        # Record a normal migration
        record_migration(engine, '001_initial', 'Initial schema', 'DROP TABLE users;', 'hash1')
        
        # Record a rollback migration
        rollback_id = record_migration(
            engine, '001_initial_rollback', 'Rollback initial schema', 
            '', 'rollback_hash', is_rollback=True
        )
        
        # Verify rollback was recorded correctly
        with engine.connect() as conn:
            result = conn.execute(
                "SELECT * FROM database_migrations WHERE id = ?",
                (rollback_id,)
            ).fetchone()
            
            self.assertTrue(result[5])  # is_rollback should be True


class TestMigrationUtilities(unittest.TestCase):
    """Test utility functions and edge cases."""
    
    def test_checksum_generation(self):
        """Test checksum generation for migration content."""
        # This would test checksum generation if implemented
        # For now, we'll test that checksums are properly stored and retrieved
        pass
    
    def test_migration_ordering(self):
        """Test migration ordering and dependency handling."""
        # This would test migration ordering logic
        pass
    
    def test_concurrent_migrations(self):
        """Test handling of concurrent migration attempts."""
        # This would test locking and concurrency control
        pass


def run_integration_tests():
    """Run integration tests with the actual CardShark database system."""
    print("Running integration tests...")
    
    try:
        # Test integration with actual database path
        with patch('setup_migration_table.get_database_path') as mock_path:
            # Use a temporary test database for integration tests
            test_db = Path(tempfile.mkdtemp()) / "integration_test.sqlite"
            mock_path.return_value = test_db
            
            print(f"Using test database: {test_db}")
            
            # Test complete workflow
            test_db.touch()
            setup_migration_system()
            
            engine = get_database_engine()
            
            # Test recording and retrieving migrations
            record_migration(
                engine, '001_integration_test', 
                'Integration test migration', 
                'DROP TABLE integration_test;', 
                'integration_hash123'
            )
            
            history = get_migration_history(engine)
            assert len(history) >= 1, "Migration history should contain at least one entry"
            
            version = get_current_schema_version(engine)
            assert version == '001_integration_test', f"Expected version '001_integration_test', got '{version}'"
            
            integrity = verify_migration_integrity(engine)
            assert integrity, "Migration integrity check should pass"
            
            print("✓ Integration tests passed!")
            
            # Clean up
            test_db.unlink()
            test_db.parent.rmdir()
            
    except Exception as e:
        print(f"✗ Integration test failed: {e}")
        return False
    
    return True


def run_performance_tests():
    """Run performance tests for migration operations."""
    print("Running performance tests...")
    
    try:
        import time
        
        # Create temporary database for performance testing
        test_db = Path(tempfile.mkdtemp()) / "performance_test.sqlite"
        
        with patch('setup_migration_table.get_database_path') as mock_path:
            mock_path.return_value = test_db
            
            test_db.touch()
            engine = get_database_engine()
            create_migration_table(engine)
            
            # Test migration recording performance
            start_time = time.time()
            
            for i in range(100):
                record_migration(
                    engine, f'{i:03d}_perf_test', 
                    f'Performance test migration {i}', 
                    'ROLLBACK SQL', f'hash_{i}'
                )
            
            record_time = time.time() - start_time
            print(f"✓ Recorded 100 migrations in {record_time:.3f} seconds")
            
            # Test history retrieval performance
            start_time = time.time()
            history = get_migration_history(engine)
            retrieval_time = time.time() - start_time
            
            print(f"✓ Retrieved {len(history)} migrations in {retrieval_time:.3f} seconds")
            
            # Test integrity verification performance
            start_time = time.time()
            verify_migration_integrity(engine)
            verification_time = time.time() - start_time
            
            print(f"✓ Verified migration integrity in {verification_time:.3f} seconds")
            
            # Clean up
            test_db.unlink()
            test_db.parent.rmdir()
            
            print("✓ Performance tests completed!")
    
    except Exception as e:
        print(f"✗ Performance test failed: {e}")
        return False
    
    return True


def main():
    """Main function to run all tests."""
    print("CardShark Migration System Test Suite")
    print("=" * 50)
    
    # Run unit tests
    print("\n1. Running Unit Tests...")
    unittest.main(module=__name__, argv=[''], exit=False, verbosity=2)
    
    # Run integration tests
    print("\n2. Running Integration Tests...")
    integration_success = run_integration_tests()
    
    # Run performance tests
    print("\n3. Running Performance Tests...")
    performance_success = run_performance_tests()
    
    # Summary
    print("\n" + "=" * 50)
    print("Test Summary:")
    print(f"Integration Tests: {'PASSED' if integration_success else 'FAILED'}")
    print(f"Performance Tests: {'PASSED' if performance_success else 'FAILED'}")
    
    if integration_success and performance_success:
        print("\n✓ All migration system tests completed successfully!")
        return 0
    else:
        print("\n✗ Some tests failed. Please review the output above.")
        return 1


if __name__ == "__main__":
    exit(main())