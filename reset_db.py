
import os
import sys
import time
import psutil
from pathlib import Path

# Add backend to path
sys.path.insert(0, os.getcwd())

from backend.database import init_db, SessionLocal
from backend.services.character_sync_service import CharacterSyncService
from backend.png_metadata_handler import PngMetadataHandler
from backend.settings_manager import SettingsManager
from backend.log_manager import LogManager
from backend.sql_models import Character

DB_FILE = "cardshark.sqlite"

def kill_process_on_port(port):
    for conn in psutil.net_connections():
        if conn.laddr.port == port:
            try:
                proc = psutil.Process(conn.pid)
                print(f"Killing process {proc.name()} (PID: {conn.pid}) on port {port}...")
                proc.terminate()
                proc.wait(timeout=5)
                return True
            except Exception as e:
                print(f"Error killing process: {e}")
    return False

def reset_and_sync():
    print(f"=== Resetting Database ===")
    
    # 1. Stop Server
    print("Checking for running server on port 9696...")
    kill_process_on_port(9696)
    time.sleep(2) # Wait for file lock release
    
    # 2. Delete DB
    if os.path.exists(DB_FILE):
        try:
            os.remove(DB_FILE)
            print(f"Deleted {DB_FILE}")
        except PermissionError:
            print(f"ERROR: Could not delete {DB_FILE}. Is it still in use?")
            return
    else:
        print(f"{DB_FILE} not found (already clean).")
        
    # 3. Re-init DB
    print("Initializing new database...")
    init_db()
    
    # 4. Sync
    print("Starting character sync...")
    logger = LogManager()
    settings_manager = SettingsManager(logger)
    settings_manager._load_settings()
    png_handler = PngMetadataHandler(logger)
    
    try:
        sync_service = CharacterSyncService(SessionLocal, png_handler, settings_manager, logger)
        sync_service.sync_characters()
        print("Sync complete.")
    except Exception as e:
        print(f"Sync failed: {e}")
        import traceback
        traceback.print_exc()
        return

    # 5. Verify
    db = SessionLocal()
    count = db.query(Character).count()
    print(f"\nVerification: Found {count} characters in new database.")
    
    # Check for absolute paths
    samples = db.query(Character).limit(5).all()
    for sample in samples:
        print(f"Sample: {sample.name} | Path: {sample.png_file_path}")
        if sample.png_file_path and os.path.isabs(sample.png_file_path):
             print(f"  [PASS] Path is absolute.")
        else:
             print(f"  [FAIL] Path is relative!")
    
    db.close()

if __name__ == "__main__":
    reset_and_sync()
