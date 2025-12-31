"""
JSONL Chat Import/Export Utilities
Handles conversion between CardShark database format and JSONL chat format
Compatible with SillyTavern/TavernAI format
"""
import json
from datetime import datetime
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from backend.sql_models import ChatSession, ChatMessage, Character, UserProfile


def format_date_for_jsonl(dt: datetime) -> str:
    """Format datetime for JSONL display (e.g., 'December 31, 2025 3:12pm')"""
    return dt.strftime("%B %d, %Y %-I:%M%p").lower()


def format_create_date(dt: datetime) -> str:
    """Format datetime for create_date field (e.g., '2025-12-31@15h12m05s')"""
    return dt.strftime("%Y-%m-%d@%Hh%Mm%Ss")


def export_chat_to_jsonl(
    db: Session,
    chat_session: ChatSession,
    character: Character,
    user_profile: Optional[UserProfile] = None
) -> str:
    """
    Export a single chat session to JSONL format.

    Args:
        db: Database session
        chat_session: ChatSession object
        character: Character object
        user_profile: Optional UserProfile object

    Returns:
        String containing JSONL formatted chat
    """
    lines = []

    # First line: chat metadata
    user_name = user_profile.name if user_profile else "User"
    character_name = character.name or "Character"

    metadata_line = {
        "user_name": user_name,
        "character_name": character_name,
        "create_date": format_create_date(chat_session.start_time),
        "chat_metadata": {
            "chat_id_hash": hash(chat_session.chat_session_uuid) & 0x7FFFFFFFFFFFFFFF,  # Positive hash
            "note_prompt": "",
            "note_interval": 1,
            "note_position": 1,
            "note_depth": 4,
            "note_role": 0,
            "tainted": False,
            "timedWorldInfo": {
                "sticky": {},
                "cooldown": {}
            }
        }
    }
    lines.append(json.dumps(metadata_line))

    # Get all messages for this chat session, ordered by sequence
    messages = db.query(ChatMessage).filter(
        ChatMessage.chat_session_uuid == chat_session.chat_session_uuid
    ).order_by(ChatMessage.sequence_number, ChatMessage.timestamp).all()

    for msg in messages:
        is_user = msg.role == "user"
        is_system = msg.role == "system"

        # Base message structure
        message_line: Dict[str, Any] = {
            "name": user_name if is_user else character_name,
            "is_user": is_user,
            "is_system": is_system,
            "send_date": format_date_for_jsonl(msg.timestamp),
            "mes": msg.content or "",
            "extra": {}
        }

        # Add user avatar if available
        if is_user and user_profile and user_profile.filename:
            message_line["force_avatar"] = f"User Avatars/{user_profile.filename}"

        # Handle message variations (swipes) for assistant messages
        if not is_user and msg.metadata_json:
            metadata = msg.metadata_json

            # Add API info if available
            if metadata.get("api_config"):
                message_line["extra"]["api"] = metadata["api_config"].get("type", "unknown")
                message_line["extra"]["model"] = metadata["api_config"].get("model", "unknown")

            # Handle variations/swipes
            variations = metadata.get("variations", [])
            if variations:
                message_line["swipe_id"] = metadata.get("active_variation_index", 0)
                message_line["swipes"] = variations

                # Build swipe_info
                swipe_info = []
                for i, variation in enumerate(variations):
                    swipe_data = {
                        "send_date": format_date_for_jsonl(msg.timestamp),
                        "extra": {}
                    }

                    # Add generation times if available
                    if i == 0:  # First swipe uses main message metadata
                        if metadata.get("gen_started"):
                            swipe_data["gen_started"] = metadata["gen_started"]
                        if metadata.get("gen_finished"):
                            swipe_data["gen_finished"] = metadata["gen_finished"]
                        if metadata.get("api_config"):
                            swipe_data["extra"]["api"] = metadata["api_config"].get("type", "unknown")
                            swipe_data["extra"]["model"] = metadata["api_config"].get("model", "unknown")

                    swipe_info.append(swipe_data)

                message_line["swipe_info"] = swipe_info

            # Add generation timestamps to main message if available
            if metadata.get("gen_started"):
                message_line["gen_started"] = metadata["gen_started"]
            if metadata.get("gen_finished"):
                message_line["gen_finished"] = metadata["gen_finished"]

        # Add extra flags for user messages
        if is_user:
            message_line["extra"]["isSmallSys"] = False

        lines.append(json.dumps(message_line))

    return "\n".join(lines)


def export_multiple_chats_to_jsonl(
    db: Session,
    chat_session_uuids: List[str],
    character_uuid: str
) -> tuple[str, str]:
    """
    Export multiple chat sessions to a combined JSONL file.

    Args:
        db: Database session
        chat_session_uuids: List of chat session UUIDs to export
        character_uuid: Character UUID for these chats

    Returns:
        Tuple of (content, filename)
    """
    # Get character info
    character = db.query(Character).filter(
        Character.character_uuid == character_uuid
    ).first()

    if not character:
        raise ValueError(f"Character {character_uuid} not found")

    all_lines = []

    for session_uuid in chat_session_uuids:
        chat_session = db.query(ChatSession).filter(
            ChatSession.chat_session_uuid == session_uuid
        ).first()

        if not chat_session:
            continue

        # Get user profile if available
        user_profile = None
        if chat_session.user_uuid:
            user_profile = db.query(UserProfile).filter(
                UserProfile.user_uuid == chat_session.user_uuid
            ).first()

        # Export this chat
        jsonl_content = export_chat_to_jsonl(db, chat_session, character, user_profile)
        all_lines.append(jsonl_content)
        all_lines.append("")  # Blank line separator between chats

    content = "\n".join(all_lines)

    # Generate filename
    character_name = character.name.replace(" ", "_") if character.name else "character"
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{character_name}_chats_{timestamp}.jsonl"

    return content, filename


def import_jsonl_to_chat(
    db: Session,
    jsonl_content: str,
    character_uuid: str,
    user_uuid: Optional[str] = None
) -> List[str]:
    """
    Import JSONL formatted chat into CardShark database.

    Args:
        db: Database session
        jsonl_content: JSONL formatted string
        character_uuid: Character UUID to associate with
        user_uuid: Optional user UUID

    Returns:
        List of created chat_session_uuids
    """
    import uuid
    from backend.sql_models import ChatSession, ChatMessage

    lines = jsonl_content.strip().split('\n')
    created_sessions = []

    current_session = None
    current_messages = []

    for line in lines:
        if not line.strip():
            # Blank line - save current session if exists
            if current_session and current_messages:
                _save_imported_session(db, current_session, current_messages)
                created_sessions.append(current_session.chat_session_uuid)
            current_session = None
            current_messages = []
            continue

        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue

        # First line of a chat session (metadata)
        if "chat_metadata" in data:
            # Create new chat session
            session_uuid = str(uuid.uuid4())

            # Parse create_date
            create_date_str = data.get("create_date", "")
            try:
                start_time = datetime.strptime(create_date_str, "%Y-%m-%d@%Hh%Mm%Ss")
            except ValueError:
                start_time = datetime.now()

            current_session = ChatSession(
                chat_session_uuid=session_uuid,
                character_uuid=character_uuid,
                user_uuid=user_uuid,
                start_time=start_time,
                title=f"Imported: {data.get('character_name', 'Chat')}",
                message_count=0,
                export_format_version="1.1.0"
            )
            current_messages = []

        # Message line
        elif current_session and "mes" in data:
            message_uuid = str(uuid.uuid4())

            # Determine role
            if data.get("is_system", False):
                role = "system"
            elif data.get("is_user", False):
                role = "user"
            else:
                role = "assistant"

            # Parse send_date
            send_date_str = data.get("send_date", "")
            try:
                # Try parsing the format "December 31, 2025 3:12pm"
                timestamp = datetime.strptime(send_date_str, "%B %d, %Y %I:%M%p")
            except ValueError:
                timestamp = datetime.now()

            # Build metadata
            metadata = {
                "extra": data.get("extra", {}),
            }

            # Handle swipes/variations for assistant messages
            if role == "assistant":
                if "swipes" in data:
                    metadata["variations"] = data["swipes"]
                    metadata["active_variation_index"] = data.get("swipe_id", 0)

                if "gen_started" in data:
                    metadata["gen_started"] = data["gen_started"]
                if "gen_finished" in data:
                    metadata["gen_finished"] = data["gen_finished"]

                # Extract API config from extra
                if "api" in data.get("extra", {}):
                    metadata["api_config"] = {
                        "type": data["extra"]["api"],
                        "model": data["extra"].get("model", "unknown")
                    }

            message = ChatMessage(
                message_id=message_uuid,
                chat_session_uuid=current_session.chat_session_uuid,
                role=role,
                content=data["mes"],
                timestamp=timestamp,
                status="complete",
                metadata_json=metadata,
                sequence_number=len(current_messages)
            )

            current_messages.append(message)

    # Save last session if exists
    if current_session and current_messages:
        _save_imported_session(db, current_session, current_messages)
        created_sessions.append(current_session.chat_session_uuid)

    return created_sessions


def _save_imported_session(
    db: Session,
    session: ChatSession,
    messages: List[ChatMessage]
):
    """Helper to save imported session and messages to database"""
    session.message_count = len(messages)
    if messages:
        session.last_message_time = messages[-1].timestamp

    db.add(session)
    db.flush()

    for msg in messages:
        db.add(msg)

    db.commit()
