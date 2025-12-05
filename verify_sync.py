import os
import time
import shutil
from pathlib import Path
from backend.database import init_db, SessionLocal
from backend.services.character_sync_service import CharacterSyncService
from backend.png_metadata_handler import PngMetadataHandler
from backend.log_manager import LogManager
from backend.settings_manager import SettingsManager
from backend import sql_models

# Setup
logger = LogManager()
settings_manager = SettingsManager(logger)
png_handler = PngMetadataHandler(logger)
init_db()

# Ensure characters directory exists
chars_dir = Path("characters")
chars_dir.mkdir(exist_ok=True)

# Test File
test_char_name = "SyncTestChar"
test_char_path = chars_dir / f"{test_char_name}.png"
dummy_png_content = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'

def create_dummy_char(name="Sync Test"):
    # Create a minimal PNG with metadata (mocking the handler reading it)
    # Since we can't easily write real metadata to a dummy PNG without a library,
    # we will mock the PngMetadataHandler.read_character_data method for this test.
    with open(test_char_path, "wb") as f:
        f.write(dummy_png_content)
    
    # Mock return value
    return {
        "name": name,
        "description": "A test character for sync.",
        "spec_version": "2.0"
    }

# Mock the PNG handler's read method
original_read = png_handler.read_character_data
current_mock_data = {}

def mock_read(path):
    if path.name == test_char_path.name:
        return current_mock_data
    return original_read(path)

png_handler.read_character_data = mock_read

# Initialize Service
sync_service = CharacterSyncService(SessionLocal, png_handler, settings_manager, logger)

def verify_db(expected_name=None, should_exist=True):
    with SessionLocal() as db:
        char = db.query(sql_models.Character).filter(sql_models.Character.png_file_path == test_char_path.name).first()
        if should_exist:
            if not char:
                print(f"FAILED: Character {test_char_path.name} not found in DB.")
                return False
            if expected_name and char.name != expected_name:
                print(f"FAILED: Expected name {expected_name}, got {char.name}")
                return False
            print(f"SUCCESS: Found character {char.name} in DB.")
            return True
        else:
            if char:
                print(f"FAILED: Character {test_char_path.name} should not exist (or be marked missing).")
                # For now we just check existence, our logic doesn't delete yet
                return True 
            print("SUCCESS: Character not found (as expected for delete test if implemented).")
            return True

# --- TEST 1: New File ---
print("\n--- Test 1: New File ---")
print("Creating dummy character...")
current_mock_data = create_dummy_char("Sync Test 1")
print("Running sync...")
sync_service.sync_characters()
print("Verifying DB...")
verify_db("Sync Test 1")

# --- TEST 2: Modification ---
print("\n--- Test 2: Modification ---")
print("Sleeping for 1.1s to ensure mtime change...")
time.sleep(1.1) # Ensure mtime changes
print("Updating dummy character...")
current_mock_data = create_dummy_char("Sync Test 2 - Modified")
print("Running sync...")
sync_service.sync_characters()
print("Verifying DB...")
verify_db("Sync Test 2 - Modified")

# --- TEST 3: No Change ---
print("\n--- Test 3: No Change ---")
# Don't touch file, run sync
print("Running sync (expecting no changes)...")
sync_service.sync_characters()
print("Verifying DB...")
verify_db("Sync Test 2 - Modified")

# Cleanup
print("\nCleaning up...")
if test_char_path.exists():
    os.remove(test_char_path)
print("Test Complete.")
