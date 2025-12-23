"""
Test script for Context Lens Session Settings API endpoints.
Run this after starting the CardShark backend server.
"""
import requests
import json

BASE_URL = "http://localhost:9696/api"

def test_session_settings():
    """Test the session settings endpoints."""
    
    print("=" * 60)
    print("Context Lens Session Settings API Test")
    print("=" * 60)
    
    # First, we need a valid chat session UUID
    # You'll need to replace this with an actual UUID from your database
    # or create a new chat session first
    
    print("\n⚠️  NOTE: You need to replace 'YOUR_CHAT_SESSION_UUID' with an actual")
    print("    chat session UUID from your database before running this test.\n")
    
    chat_session_uuid = "YOUR_CHAT_SESSION_UUID"  # Replace with actual UUID
    
    # Test 1: Get session settings (should return defaults)
    print("\n1. Testing GET /chat/session-settings/{uuid}")
    print("-" * 60)
    try:
        response = requests.get(f"{BASE_URL}/chat/session-settings/{chat_session_uuid}")
        print(f"Status Code: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Response: {json.dumps(data, indent=2)}")
            print("✅ GET endpoint working!")
        else:
            print(f"❌ Error: {response.text}")
    except Exception as e:
        print(f"❌ Request failed: {e}")
    
    # Test 2: Update session settings
    print("\n2. Testing POST /chat/session-settings")
    print("-" * 60)
    try:
        payload = {
            "chat_session_uuid": chat_session_uuid,
            "session_notes": "Test note: Character revealed their secret identity in the last scene.",
            "compression_enabled": True
        }
        print(f"Payload: {json.dumps(payload, indent=2)}")
        
        response = requests.post(
            f"{BASE_URL}/chat/session-settings",
            json=payload,
            headers={"Content-Type": "application/json"}
        )
        print(f"Status Code: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Response: {json.dumps(data, indent=2)}")
            print("✅ POST endpoint working!")
        else:
            print(f"❌ Error: {response.text}")
    except Exception as e:
        print(f"❌ Request failed: {e}")
    
    # Test 3: Verify the update by getting settings again
    print("\n3. Verifying update with GET request")
    print("-" * 60)
    try:
        response = requests.get(f"{BASE_URL}/chat/session-settings/{chat_session_uuid}")
        print(f"Status Code: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Response: {json.dumps(data, indent=2)}")
            
            # Verify the values
            settings = data.get("data", {})
            if settings.get("session_notes") == "Test note: Character revealed their secret identity in the last scene.":
                print("✅ Session notes persisted correctly!")
            else:
                print("❌ Session notes don't match")
                
            if settings.get("compression_enabled") == True:
                print("✅ Compression flag persisted correctly!")
            else:
                print("❌ Compression flag doesn't match")
        else:
            print(f"❌ Error: {response.text}")
    except Exception as e:
        print(f"❌ Request failed: {e}")
    
    print("\n" + "=" * 60)
    print("Test Complete!")
    print("=" * 60)

if __name__ == "__main__":
    test_session_settings()
