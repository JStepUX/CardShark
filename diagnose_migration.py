#!/usr/bin/env python3
"""
Simple diagnostic script to identify migration system issues
"""
import sys
from pathlib import Path
import traceback

# Add project root to path
PROJECT_ROOT = Path(__file__).parent
sys.path.insert(0, str(PROJECT_ROOT))

def test_imports():
    """Test all imports"""
    print("Testing imports...")
    
    try:
        from setup_migration_table import get_database_path, get_database_engine
        print("✓ setup_migration_table imports OK")
        return True
    except Exception as e:
        print(f"✗ setup_migration_table import failed: {e}")
        traceback.print_exc()
        return False

def test_database_operations():
    """Test basic database operations"""
    print("\nTesting database operations...")
    
    try:
        from setup_migration_table import get_database_path, get_database_engine, create_migration_table
        
        # Test database path
        db_path = get_database_path()
        print(f"✓ Database path: {db_path}")
        
        # Test engine creation
        engine = get_database_engine()
        print("✓ Database engine created")
        
        # Test connection
        with engine.connect() as conn:
            result = conn.execute("SELECT 1").fetchone()
            print(f"✓ Database connection test: {result[0]}")
        
        return True
        
    except Exception as e:
        print(f"✗ Database operations failed: {e}")
        traceback.print_exc()
        return False

def test_verification_system():
    """Test the verification system specifically"""
    print("\nTesting verification system...")
    
    try:
        from verify_migration import generate_migration_report, get_database_engine
        
        engine = get_database_engine()
        print("✓ Engine created for verification")
        
        report = generate_migration_report(engine)
        print(f"✓ Report generated: {report.get('summary', {}).get('overall_status', 'Unknown')}")
        
        if 'error' in report:
            print(f"✗ Report contains error: {report['error']}")
            return False
            
        return True
        
    except Exception as e:
        print(f"✗ Verification system failed: {e}")
        traceback.print_exc()
        return False

def main():
    print("CardShark Migration System Diagnostics")
    print("=" * 40)
    
    tests = [
        test_imports,
        test_database_operations,
        test_verification_system
    ]
    
    results = []
    for test in tests:
        try:
            result = test()
            results.append(result)
        except Exception as e:
            print(f"✗ Test {test.__name__} crashed: {e}")
            results.append(False)
    
    print("\n" + "=" * 40)
    print(f"Tests passed: {sum(results)}/{len(results)}")
    
    if all(results):
        print("✓ All diagnostics passed - migration system should be working")
        return 0
    else:
        print("✗ Some diagnostics failed - see errors above")
        return 1

if __name__ == "__main__":
    sys.exit(main())
