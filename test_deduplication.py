#!/usr/bin/env python3
"""
Test script to verify character deduplication functionality.
This script tests the path normalization and deduplication services.
"""

import sys
import os
from pathlib import Path

# Add the project root to sys.path
project_root = Path(__file__).resolve().parent
sys.path.insert(0, str(project_root))

try:
    from backend.utils.path_utils import normalize_path, paths_are_equivalent
    from backend.services.character_deduplication_service import CharacterDeduplicationService
    from backend.database import SessionLocal
    from backend.sql_models import Character
    from backend.log_manager import LogManager
    import uuid
    import datetime
except ImportError as e:
    print(f"Import error: {e}")
    print("Make sure you're running this from the project root directory.")
    sys.exit(1)

def test_path_normalization():
    """Test path normalization functionality."""
    print("\n=== Testing Path Normalization ===")
    
    test_paths = [
        "C:\\Users\\Test\\Characters",
        "C:/Users/Test/Characters",
        "C:\\Users\\Test\\Characters\\",
        "C:/Users/Test/Characters/",
        "c:\\users\\test\\characters",
        "C:\\Users\\Test\\..\\Test\\Characters"
    ]
    
    normalized_paths = [normalize_path(p) for p in test_paths]
    
    print("Original paths:")
    for i, path in enumerate(test_paths):
        print(f"  {i+1}. {path}")
    
    print("\nNormalized paths:")
    for i, path in enumerate(normalized_paths):
        print(f"  {i+1}. {path}")
    
    # Check if all normalized paths are equivalent
    all_equivalent = all(paths_are_equivalent(normalized_paths[0], p) for p in normalized_paths[1:])
    print(f"\nAll paths equivalent after normalization: {all_equivalent}")
    
    return all_equivalent

def test_deduplication_service():
    """Test the deduplication service functionality."""
    print("\n=== Testing Deduplication Service ===")
    
    logger = LogManager()
    dedup_service = CharacterDeduplicationService(logger, SessionLocal)
    
    # Test UUID extraction (this will return None for non-PNG files, which is expected)
    test_uuid = dedup_service.extract_uuid_from_png("test_file.png")
    print(f"UUID extraction test (expected None for non-existent file): {test_uuid}")
    
    # Test duplicate detection with mock data
    print("\nTesting duplicate detection logic...")
    
    # Create some test character data using mock Character objects
    class MockCharacter:
        def __init__(self, character_uuid, name, png_file_path, created_at):
            self.character_uuid = character_uuid
            self.name = name
            self.png_file_path = png_file_path
            self.created_at = created_at
    
    test_chars = [
        MockCharacter(
            character_uuid=str(uuid.uuid4()),
            name='TestChar1',
            png_file_path=normalize_path('C:/Users/Test/Characters/char1.png'),
            created_at=datetime.datetime.now()
        ),
        MockCharacter(
            character_uuid=str(uuid.uuid4()),
            name='TestChar1',  # Same name
            png_file_path=normalize_path('C:\\Users\\Test\\Characters\\char1.png'),  # Same path, different format
            created_at=datetime.datetime.now()
        ),
        MockCharacter(
            character_uuid=str(uuid.uuid4()),
            name='TestChar2',
            png_file_path=normalize_path('C:/Users/Test/Characters/char2.png'),
            created_at=datetime.datetime.now()
        )
    ]
    
    # Test path duplicate detection
    path_duplicates = dedup_service.find_duplicates_by_path(test_chars)
    print(f"Path duplicates found: {len(path_duplicates)} groups")
    for i, (path, group) in enumerate(path_duplicates.items()):
        print(f"  Group {i+1}: {len(group)} characters with same path '{path}'")
        for char in group:
            print(f"    - {char.name} ({char.png_file_path})")
    
    return len(path_duplicates) > 0

def test_database_integration():
    """Test database integration (if database is available)."""
    print("\n=== Testing Database Integration ===")
    
    try:
        with SessionLocal() as db:
            # Count existing characters
            char_count = db.query(Character).count()
            print(f"Current character count in database: {char_count}")
            
            # Test for potential duplicates
            all_chars = db.query(Character).all()
            
            # Group by normalized path
            path_groups = {}
            for char in all_chars:
                normalized = normalize_path(char.png_file_path)
                if normalized not in path_groups:
                    path_groups[normalized] = []
                path_groups[normalized].append(char)
            
            # Find duplicates
            duplicates = {path: chars for path, chars in path_groups.items() if len(chars) > 1}
            
            print(f"Found {len(duplicates)} paths with multiple characters:")
            for path, chars in duplicates.items():
                print(f"  Path: {path}")
                for char in chars:
                    print(f"    - UUID: {char.character_uuid}, Name: {char.name}")
            
            return len(duplicates)
            
    except Exception as e:
        print(f"Database test failed: {e}")
        return None

def main():
    """Run all tests."""
    print("Character Deduplication Test Suite")
    print("=" * 50)
    
    # Test 1: Path normalization
    path_test_passed = test_path_normalization()
    
    # Test 2: Deduplication service
    dedup_test_passed = test_deduplication_service()
    
    # Test 3: Database integration
    db_duplicates = test_database_integration()
    
    # Summary
    print("\n=== Test Summary ===")
    print(f"Path normalization test: {'PASSED' if path_test_passed else 'FAILED'}")
    print(f"Deduplication service test: {'PASSED' if dedup_test_passed else 'FAILED'}")
    
    if db_duplicates is not None:
        print(f"Database integration: Connected successfully")
        print(f"Existing duplicates found: {db_duplicates}")
        if db_duplicates > 0:
            print("  ⚠️  Consider running the deduplication cleanup!")
        else:
            print("  ✅ No duplicates found in database")
    else:
        print("Database integration: Failed to connect")
    
    print("\n=== Recommendations ===")
    if path_test_passed:
        print("✅ Path normalization is working correctly")
    else:
        print("❌ Path normalization needs attention")
    
    if dedup_test_passed:
        print("✅ Deduplication service is detecting duplicates")
    else:
        print("❌ Deduplication service may need debugging")
    
    if db_duplicates is not None and db_duplicates > 0:
        print("🔧 Run the application to trigger automatic deduplication cleanup")
        print("   Or manually call the deduplication service cleanup method")

if __name__ == "__main__":
    main()