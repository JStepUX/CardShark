
import sys
import os
import uuid
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add the project root to the python path
sys.path.append(os.getcwd())

from backend import sql_models
from backend.services import chat_service
from backend.database import Base

# Setup temporary DB
TEST_DB_URL = "sqlite:///./test_duplicate_msg.db"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def setup_db():
    Base.metadata.create_all(bind=engine)

def teardown_db():
    Base.metadata.drop_all(bind=engine)
    if os.path.exists("./test_duplicate_msg.db"):
        os.remove("./test_duplicate_msg.db")

def test_duplicate_messages_save():
    setup_db()
    db = TestingSessionLocal()
    try:
        # Create a character
        char_uuid = str(uuid.uuid4())
        char = sql_models.Character(
            character_uuid=char_uuid,
            name="Test Char",
            png_file_path=f"test_{char_uuid}.png"
        )
        db.add(char)
        db.commit()

        # Create a chat session
        session_uuid = str(uuid.uuid4())
        chat_session = sql_models.ChatSession(
            chat_session_uuid=session_uuid,
            character_uuid=char_uuid,
            title="Test Session"
        )
        db.add(chat_session)
        db.commit()

        # Create duplicate messages payload
        msg_id = str(uuid.uuid4())
        messages_data = [
            {"id": msg_id, "role": "user", "content": "Hello"},
            {"id": msg_id, "role": "user", "content": "Hello again (duplicate ID)"},
            {"role": "assistant", "content": "Hi"} # No ID, should generate one
        ]

        print("Attempting to replace messages with duplicates...")
        # This should NOT raise IntegrityError with the fix
        new_messages = chat_service.replace_chat_session_messages(db, session_uuid, messages_data)
        
        print(f"Successfully saved {len(new_messages)} messages.")
        
        # Verify
        db_messages = db.query(sql_models.ChatMessage).filter(sql_models.ChatMessage.chat_session_uuid == session_uuid).all()
        print(f"Messages in DB: {len(db_messages)}")
        
        assert len(db_messages) == 2 # Should have deduplicated the first two
        
        ids = [m.message_id for m in db_messages]
        assert msg_id in ids
        print("Verification successful!")

    except Exception as e:
        print(f"Test FAILED with error: {e}")
        raise e
    finally:
        db.close()
        teardown_db()

if __name__ == "__main__":
    test_duplicate_messages_save()
