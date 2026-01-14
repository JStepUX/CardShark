"""
Debug script to find the missing forked chat session.
This will query the database to see if the chat exists and check its messages.
"""
import sqlite3
import sys
from pathlib import Path

# Add backend to path to import path_utils
sys.path.insert(0, str(Path(__file__).parent))

from backend.utils.path_utils import get_application_base_path

# Get database path using the same logic as the application
PROJECT_ROOT = get_application_base_path()
db_path = PROJECT_ROOT / "cardshark.sqlite"

if not db_path.exists():
    print(f"Database not found at {db_path}")
    print(f"Checked in: {PROJECT_ROOT}")
    sys.exit(1)

print(f"Using database: {db_path}\n")

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Character UUID for Stella Chiyoko (from console logs)
character_uuid = "9cec5caa-904f-4db1-a3f9-1d4478f00efb"

print(f"Searching for chats for character: {character_uuid}\n")
print("=" * 80)

# 1. Find all chat sessions for this character
cursor.execute("""
    SELECT chat_session_uuid, title, message_count, start_time, last_message_time
    FROM chat_sessions
    WHERE character_uuid = ?
    ORDER BY last_message_time DESC
""", (character_uuid,))

sessions = cursor.fetchall()
print(f"\nFound {len(sessions)} total chat sessions:\n")

for session in sessions:
    chat_uuid, title, msg_count, start_time, last_msg_time = session
    print(f"Chat: {title}")
    print(f"  UUID: {chat_uuid}")
    print(f"  Message Count: {msg_count}")
    print(f"  Last Message: {last_msg_time}")
    
    # Check if this chat has user messages
    cursor.execute("""
        SELECT COUNT(*) 
        FROM chat_messages 
        WHERE chat_session_uuid = ? AND role = 'user'
    """, (chat_uuid,))
    user_msg_count = cursor.fetchone()[0]
    
    print(f"  User Messages: {user_msg_count}")
    
    # Check all message roles
    cursor.execute("""
        SELECT role, COUNT(*) 
        FROM chat_messages 
        WHERE chat_session_uuid = ?
        GROUP BY role
    """, (chat_uuid,))
    role_counts = cursor.fetchall()
    print(f"  Message breakdown: {dict(role_counts)}")
    
    # Check if this is a fork (title starts with "Fork of")
    if title and title.startswith("Fork of"):
        print(f"  ⚠️  THIS IS A FORKED CHAT")
        if user_msg_count == 0:
            print(f"  ❌ PROBLEM: Forked chat has no user messages!")
    
    print()

# 2. Look specifically for forked chats
print("\n" + "=" * 80)
print("Forked chats specifically:\n")

cursor.execute("""
    SELECT chat_session_uuid, title, message_count, start_time
    FROM chat_sessions
    WHERE character_uuid = ? AND title LIKE 'Fork of%'
    ORDER BY start_time DESC
""", (character_uuid,))

forked_sessions = cursor.fetchall()
print(f"Found {len(forked_sessions)} forked chats\n")

for session in forked_sessions:
    chat_uuid, title, msg_count, start_time = session
    print(f"Forked Chat: {title}")
    print(f"  UUID: {chat_uuid}")
    print(f"  Total Messages: {msg_count}")
    print(f"  Created: {start_time}")
    
    # Get first few messages to see what was copied
    cursor.execute("""
        SELECT role, content, sequence_number
        FROM chat_messages
        WHERE chat_session_uuid = ?
        ORDER BY sequence_number ASC
        LIMIT 5
    """, (chat_uuid,))
    
    messages = cursor.fetchall()
    print(f"  First {len(messages)} messages:")
    for role, content, seq in messages:
        preview = content[:50] + "..." if len(content) > 50 else content
        print(f"    [{seq}] {role}: {preview}")
    print()

conn.close()

print("\n" + "=" * 80)
print("Investigation complete. Check above for any forked chats with 0 user messages.")
