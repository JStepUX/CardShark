
from fastapi.testclient import TestClient
import sys
import os

# Add project root to path
sys.path.insert(0, os.getcwd())

from backend.main import app
from backend.services.character_service import CharacterService
from backend.database import get_db, SessionLocal

client = TestClient(app)

def verify_fixes():
    print("=== Verifying Fixes with TestClient ===")
    
    # 1. Test /api/load-chat existence
    print("\n1. Testing /api/load-chat endpoint...")
    resp = client.post("/api/load-chat", json={})
    if resp.status_code == 422:
        print("[PASS] Endpoint exists (got 422 Validation Error as expected)")
    elif resp.status_code == 404:
        print("[FAIL] Endpoint not found (404)")
    else:
         print(f"[PASS?] Endpoint returned {resp.status_code}")

    # 2. Test Character Image Fallback
    # functionality depends on DB state. DB is shared SQLite, so it should have "Zoomer Bride Market" from my sync earlier.
    print("\n2. Testing Image Fallback (Zoomer Bride Market.png)...")
    # Note: TestClient doesn't run the server, so we are just invoking the app router.
    resp = client.get("/api/character-image/Zoomer%20Bride%20Market.png")
    
    if resp.status_code == 200:
        print(f"[PASS] Image found! Content-Type: {resp.headers.get('Content-Type')}")
    elif resp.status_code == 404:
        print(f"[FAIL] Image not found. Status: 404. Detail: {resp.text}")
    else:
        print(f"[FAIL] Unexpected status: {resp.status_code}")

if __name__ == "__main__":
    verify_fixes()
