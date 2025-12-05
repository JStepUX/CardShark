
import sys
import os
from pathlib import Path
from sqlalchemy import or_

# Add backend to path
sys.path.insert(0, os.path.join(os.getcwd(), 'backend'))

from backend.database import init_db, SessionLocal
from backend.sql_models import Character

def inspect_failing_chars():
    init_db()
    db = SessionLocal()
    
    targets = [
        "Kayla (1)", 
        "Lily (1)", 
        "Tori (1)", 
        "Resistance v2_133549149123030", 
        "Family Dysfunction"
    ]
    
    print("=== Inspecting Failing Characters in DB ===")
    
    for target in targets:
        print(f"\n--- Checking '{target}' ---")
        # Check by Name
        by_name = db.query(Character).filter(Character.name == target).first()
        if by_name:
            print(f"Match by NAME:")
            print(f"  UUID: {by_name.character_uuid}")
            print(f"  Path: {by_name.png_file_path}")
            print(f"  Is Abs: {os.path.isabs(by_name.png_file_path) if by_name.png_file_path else 'N/A'}")
            print(f"  Exists: {os.path.exists(by_name.png_file_path) if by_name.png_file_path else 'False'}")
        else:
            print("Match by NAME: None")
            
        # Check by Filename logic (ILIKE)
        search_filename = f"{target}.png"
        try:
            by_file = db.query(Character).filter(Character.png_file_path.like(f"%{search_filename}")).first()
            if by_file:
                 if by_name and by_file.character_uuid == by_name.character_uuid:
                     print("Match by FILE: Same as Name match")
                 else:
                    print(f"Match by FILE ({search_filename}):")
                    print(f"  UUID: {by_file.character_uuid}")
                    print(f"  Path: {by_file.png_file_path}")
                    print(f"  Is Abs: {os.path.isabs(by_file.png_file_path) if by_file.png_file_path else 'N/A'}")
                    print(f"  Exists: {os.path.exists(by_file.png_file_path) if by_file.png_file_path else 'False'}")
            else:
                print(f"Match by FILE ({search_filename}): None")
        except Exception as e:
            print(f"Error checking file match: {e}")

    db.close()

if __name__ == "__main__":
    inspect_failing_chars()
