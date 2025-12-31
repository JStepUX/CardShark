"""
JSONL Chat Import/Export Utilities
Handles conversion between CardShark database format and JSONL chat format
Compatible with SillyTavern/TavernAI format
"""
import json
import re
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from sqlalchemy.orm import Session
from backend.sql_models import ChatSession, ChatMessage, Character, UserProfile


def format_date_for_jsonl(dt: datetime) -> str:
    """Format datetime for JSONL display (e.g., 'December 31, 2025 3:12pm')"""
    return dt.strftime("%B %d, %Y %-I:%M%p").lower()


def format_create_date(dt: datetime) -> str:
    """Format datetime for create_date field (e.g., '2025-12-31@15h12m05s')"""
    return dt.strftime("%Y-%m-%d@%Hh%Mm%Ss")


# =============================================================================
# SMART IMPORT HELPERS (Fuzzy Matching & Tolerance)
# =============================================================================

def fuzzy_get(data: Dict[str, Any], *possible_keys: str, default: Any = None) -> Any:
    """
    Try to get value from dict using multiple possible key names.
    Returns first matching key's value, or default if none found.

    Example: fuzzy_get(data, 'mes', 'message', 'content', default='')
    """
    for key in possible_keys:
        if key in data:
            return data[key]
    return default


def smart_parse_date(date_str: str) -> Optional[datetime]:
    """
    Intelligently parse date strings in multiple formats.
    Returns datetime object or None if unparseable.
    """
    if not date_str:
        return None

    # List of date format patterns to try
    patterns = [
        # SillyTavern/TavernAI formats
        "%B %d, %Y %I:%M%p",           # December 31, 2025 3:12pm
        "%B %d, %Y %I:%M%P",           # December 31, 2025 3:12PM
        "%Y-%m-%d@%Hh%Mm%Ss",          # 2025-12-31@15h12m05s

        # ISO formats
        "%Y-%m-%dT%H:%M:%S.%fZ",       # ISO with milliseconds and Z
        "%Y-%m-%dT%H:%M:%SZ",          # ISO with Z
        "%Y-%m-%dT%H:%M:%S.%f",        # ISO with milliseconds
        "%Y-%m-%dT%H:%M:%S",           # ISO basic

        # Common formats
        "%Y-%m-%d %H:%M:%S",           # SQL datetime
        "%Y/%m/%d %H:%M:%S",           # Slash format
        "%m/%d/%Y %I:%M %p",           # US format with AM/PM
        "%d/%m/%Y %H:%M:%S",           # EU format
        "%Y-%m-%d",                    # Date only
        "%m/%d/%Y",                    # US date only
    ]

    for pattern in patterns:
        try:
            return datetime.strptime(date_str, pattern)
        except ValueError:
            continue

    # Try parsing as timestamp (Unix epoch)
    try:
        timestamp = float(date_str)
        # Handle both seconds and milliseconds
        if timestamp > 10000000000:  # Likely milliseconds
            timestamp = timestamp / 1000
        return datetime.fromtimestamp(timestamp)
    except (ValueError, TypeError, OSError):
        pass

    return None


def smart_detect_role(data: Dict[str, Any]) -> str:
    """
    Intelligently detect message role from various field combinations.
    Returns 'user', 'assistant', or 'system'.
    """
    # Check explicit role field
    role = fuzzy_get(data, 'role', default=None)
    if role in ['user', 'assistant', 'system']:
        return role

    # Check is_user/is_system flags
    if fuzzy_get(data, 'is_system', default=False):
        return 'system'

    if fuzzy_get(data, 'is_user', default=False):
        return 'user'

    # Check name matching
    name = fuzzy_get(data, 'name', default='').lower()
    if 'user' in name or 'you' in name:
        return 'user'

    # Default to assistant if unclear
    return 'assistant'


def is_metadata_line(data: Dict[str, Any]) -> bool:
    """
    Detect if this is a chat session metadata line.
    Tolerant to various metadata structures.
    """
    return bool(
        fuzzy_get(data, 'chat_metadata', 'metadata', 'session_metadata') or
        (fuzzy_get(data, 'user_name') and fuzzy_get(data, 'character_name'))
    )


def is_message_line(data: Dict[str, Any]) -> bool:
    """
    Detect if this is a message line.
    Tolerant to various message field names.
    """
    return bool(fuzzy_get(data, 'mes', 'message', 'content', 'text'))


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
    Import JSONL formatted chat into CardShark database with smart tolerance.
    Handles variations in field names, date formats, and missing data gracefully.

    Args:
        db: Database session
        jsonl_content: JSONL formatted string (tolerant to format variations)
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
            continue  # Skip invalid JSON lines

        # Detect if this is a metadata line (session start)
        if is_metadata_line(data):
            # Save previous session if exists
            if current_session and current_messages:
                _save_imported_session(db, current_session, current_messages)
                created_sessions.append(current_session.chat_session_uuid)

            # Create new chat session
            session_uuid = str(uuid.uuid4())

            # Parse create_date with smart parsing
            create_date_str = fuzzy_get(data, 'create_date', 'date', 'timestamp', default='')
            start_time = smart_parse_date(create_date_str) or datetime.now()

            # Get character name for title
            char_name = fuzzy_get(data, 'character_name', 'char_name', 'character', default='Chat')

            current_session = ChatSession(
                chat_session_uuid=session_uuid,
                character_uuid=character_uuid,
                user_uuid=user_uuid,
                start_time=start_time,
                title=f"Imported: {char_name}",
                message_count=0,
                export_format_version="1.1.0"
            )
            current_messages = []

        # Detect if this is a message line
        elif is_message_line(data):
            if not current_session:
                # Create implicit session if missing metadata
                session_uuid = str(uuid.uuid4())
                current_session = ChatSession(
                    chat_session_uuid=session_uuid,
                    character_uuid=character_uuid,
                    user_uuid=user_uuid,
                    start_time=datetime.now(),
                    title="Imported: Unknown Chat",
                    message_count=0,
                    export_format_version="1.1.0"
                )
                current_messages = []

            message_uuid = str(uuid.uuid4())

            # Determine role using smart detection
            role = smart_detect_role(data)

            # Get message content with fuzzy matching
            content = fuzzy_get(data, 'mes', 'message', 'content', 'text', default='')

            # Parse send_date with smart parsing
            send_date_str = fuzzy_get(data, 'send_date', 'timestamp', 'date', 'time', default='')
            timestamp = smart_parse_date(send_date_str) or datetime.now()

            # Build metadata - preserve everything for compatibility
            metadata = {
                "extra": fuzzy_get(data, 'extra', default={}),
                "original_data": {}  # Store fields we don't explicitly handle
            }

            # Store any unrecognized fields for future compatibility
            known_fields = {
                'mes', 'message', 'content', 'text', 'name', 'is_user', 'is_system',
                'send_date', 'timestamp', 'date', 'time', 'role', 'extra',
                'swipes', 'swipe_id', 'swipe_info', 'gen_started', 'gen_finished',
                'force_avatar', 'api', 'model'
            }
            for key, value in data.items():
                if key not in known_fields:
                    metadata["original_data"][key] = value

            # Handle swipes/variations for assistant messages
            if role == "assistant":
                swipes = fuzzy_get(data, 'swipes', 'variations', 'alternatives')
                if swipes:
                    metadata["variations"] = swipes
                    metadata["active_variation_index"] = fuzzy_get(data, 'swipe_id', 'variation_index', default=0)

                gen_started = fuzzy_get(data, 'gen_started', 'generation_started')
                if gen_started:
                    metadata["gen_started"] = gen_started

                gen_finished = fuzzy_get(data, 'gen_finished', 'generation_finished')
                if gen_finished:
                    metadata["gen_finished"] = gen_finished

                # Extract API config from extra or top level
                extra = fuzzy_get(data, 'extra', default={})
                api_type = fuzzy_get(extra, 'api') or fuzzy_get(data, 'api')
                api_model = fuzzy_get(extra, 'model') or fuzzy_get(data, 'model')

                if api_type or api_model:
                    metadata["api_config"] = {
                        "type": api_type or "unknown",
                        "model": api_model or "unknown"
                    }

            message = ChatMessage(
                message_id=message_uuid,
                chat_session_uuid=current_session.chat_session_uuid,
                role=role,
                content=content,
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
