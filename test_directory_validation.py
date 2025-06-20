#!/usr/bin/env python3
"""
Test script to verify directory validation fix
"""
import os
import tempfile
from pathlib import Path
import sys

# Add backend to path
backend_path = Path(__file__).parent / "backend"
sys.path.insert(0, str(backend_path))

# Import after path modification
try:
    from settings_manager import SettingsManager  # type: ignore
except ImportError as e:
    print(f"Failed to import SettingsManager: {e}")
    print(f"Backend path: {backend_path}")
    print(f"Backend path exists: {backend_path.exists()}")
    print(f"Settings manager file exists: {(backend_path / 'settings_manager.py').exists()}")
    sys.exit(1)

def test_directory_validation():
    """Test the directory validation with empty directories"""
    print("Testing directory validation fix...")
      # Create a temporary empty directory
    with tempfile.TemporaryDirectory() as temp_dir:
        print(f"Created temporary directory: {temp_dir}")
        
        # Create a simple mock logger for testing
        class MockLogger:
            def log_step(self, message): print(f"LOG: {message}")
            def log_warning(self, message): print(f"WARN: {message}")
            def log_error(self, message): print(f"ERROR: {message}")
        
        # Initialize settings manager
        settings_manager = SettingsManager(MockLogger())
        
        # Test validation of empty directory
        is_valid = settings_manager._validate_directory(temp_dir)
        print(f"Empty directory validation result: {is_valid}")
        
        if is_valid:
            print("✅ SUCCESS: Empty directory is now correctly validated as valid")
        else:
            print("❌ FAILED: Empty directory is still being rejected")
            return False
            
        # Test with a directory that has a PNG file
        png_file = Path(temp_dir) / "test_character.png"
        png_file.write_bytes(b"fake png data")
        
        is_valid_with_png = settings_manager._validate_directory(temp_dir)
        print(f"Directory with PNG validation result: {is_valid_with_png}")
        
        if is_valid_with_png:
            print("✅ SUCCESS: Directory with PNG files is still valid")
        else:
            print("❌ FAILED: Directory with PNG files should be valid")
            return False
            
        return True

if __name__ == "__main__":
    success = test_directory_validation()
    if success:
        print("\n🎉 All directory validation tests passed!")
    else:
        print("\n💥 Directory validation tests failed!")
        sys.exit(1)
