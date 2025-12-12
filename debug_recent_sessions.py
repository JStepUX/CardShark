import sqlite3
import datetime
from pathlib import Path

def main():
    db_path = Path('cardshark.sqlite')
    if not db_path.exists():
        print("Database not found!")
        return

    try:
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        print("--- Recent Chat Sessions (Last 24 Hours) ---")
        
        # Get sessions from last 24h
        # SQLite datetime is text, usually UTC
        query = """
        SELECT 
            cs.chat_session_uuid,
            cs.character_uuid,
            c.name as character_name,
            cs.last_message_time,
            cs.message_count,
            cs.start_time,
            cs.title
        FROM chat_sessions cs
        LEFT JOIN characters c ON cs.character_uuid = c.character_uuid
        ORDER BY cs.last_message_time DESC
        LIMIT 50
        """
        
        cursor.execute(query)
        sessions = cursor.fetchall()
        
        print(f"{'Time':<26} | {'Character':<20} | {'Msgs':<5} | {'Title':<30} | {'UUID'}")
        print("-" * 120)
        
        for s in sessions:
            time_str = str(s['last_message_time'])
            char_name = str(s['character_name'])[:20]
            count = s['message_count']
            title = str(s['title'])[:30]
            uuid = s['chat_session_uuid']
            print(f"{time_str:<26} | {char_name:<20} | {count:<5} | {title:<30} | {uuid}")

        print("\n--- Searching for 'lost' messages ---")
        # Check if there are messages that don't belong to a session or belong to a session not listed above
        # Count messages by session_uuid
        cursor.execute("""
            SELECT chat_session_uuid, COUNT(*) as count 
            FROM chat_messages 
            GROUP BY chat_session_uuid 
            ORDER BY count DESC 
            LIMIT 20
        """)
        msg_counts = cursor.fetchall()
        
        print(f"{'Session UUID':<36} | {'Real Msg Count'}")
        print("-" * 60)
        for row in msg_counts:
            uuid = row['chat_session_uuid']
            count = row['count']
            # Get character name for this uuid
            cursor.execute("SELECT c.name FROM chat_sessions cs JOIN characters c ON cs.character_uuid = c.character_uuid WHERE cs.chat_session_uuid = ?", (uuid,))
            char_res = cursor.fetchone()
            char_name = char_res['name'] if char_res else "Unknown/Orphan"
            print(f"{uuid:<36} | {count:<5} ({char_name})")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    main()
