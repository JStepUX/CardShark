
import requests
import json
import sys
import os

BASE_URL = "http://localhost:9696"

def verify_endpoints():
    print("=== Verifying API Fixes ===")
    
    # 1. Test Character Image Fallback
    # expected to work now even with filename as UUID
    print("\n1. Testing Image Fallback (Zoomer Bride Market.png)...")
    try:
        url = f"{BASE_URL}/api/character-image/Zoomer%20Bride%20Market.png"
        resp = requests.get(url)
        if resp.status_code == 200:
            print(f"[PASS] Image found! Content-Type: {resp.headers.get('Content-Type')}")
        else:
            print(f"[FAIL] Image not found. Status: {resp.status_code}")
    except Exception as e:
        print(f"[FAIL] Connection error: {e}")

    # 2. Test Load Chat Endpoint
    print("\n2. Testing /api/load-chat...")
    # First, need a valid character UUID and Session UUID from the DB
    # We'll use the debug script logic to find one, or just try to trigger the endpoint validation
    # If we get 422/400 (validation error), it means the endpoint exists! 
    # If we get 404, it's missing.
    try:
        url = f"{BASE_URL}/api/load-chat"
        # Send empty payload to trigger validation error
        resp = requests.post(url, json={}) 
        
        if resp.status_code == 422: # Validation error means endpoint is reachable
             print(f"[PASS] Endpoint reachable (got 422 Validation Error as expected for empty payload)")
        elif resp.status_code == 404:
             print(f"[FAIL] Endpoint not found (404)")
        else:
             print(f"[PASS?] Endpoint returned {resp.status_code}")
             
    except Exception as e:
        print(f"[FAIL] Connection error: {e}")

if __name__ == "__main__":
    verify_endpoints()
