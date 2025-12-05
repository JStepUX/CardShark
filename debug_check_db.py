
import sys
import os
from pathlib import Path

# Add backend to path
sys.path.insert(0, os.path.join(os.getcwd(), 'backend'))

from backend.database import init_db, SessionLocal
from backend.sql_models import Character, ChatSession
from sqlalchemy.orm import Session


from backend.services.character_sync_service import CharacterSyncService
from backend.png_metadata_handler import PngMetadataHandler
from backend.settings_manager import SettingsManager
from backend.log_manager import LogManager

def check_db():
    init_db()
    db = SessionLocal()
    
    # Initialize dependencies for sync
    logger = LogManager()
    settings_manager = SettingsManager(logger)
    settings_manager._load_settings()
    png_handler = PngMetadataHandler(logger)
    
    print("=== Running Character Sync ===")
    try:
        sync_service = CharacterSyncService(SessionLocal, png_handler, settings_manager, logger)
        sync_service.sync_characters()
        print("Sync complete.")
    except Exception as e:
        print(f"Sync failed: {e}")
    
    print("\n=== Checking Characters in DB ===")
    chars = db.query(Character).all()
    print(f"Total Characters: {len(chars)}")
    
    for char in chars:
        status = "FOUND" if char.png_file_path and os.path.exists(char.png_file_path) else "MISSING"
        print(f"[{status}] UUID: {char.character_uuid} | Name: {char.name}")
        print(f"        Path: {char.png_file_path}")
        
    print("\n=== Checking Chat Sessions ===")
    sessions = db.query(ChatSession).all()
    print(f"Total Sessions: {len(sessions)}")
    
    db.close()

if __name__ == "__main__":
    check_db()
