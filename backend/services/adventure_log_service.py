"""
backend/services/adventure_log_service.py
Service for managing adventure log entries.

Design Philosophy:
- SQLite stores room visit summaries for narrative continuity
- No foreign key constraints (orphaned rows are harmless)
- UPSERT pattern for create/complete operations
"""
import json
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import and_, desc

from backend.database import SessionLocal
from backend.sql_models import AdventureLogEntry as AdventureLogEntryModel
from backend.models.adventure_log import (
    AdventureLogEntry,
    AdventureLogEntryCreate,
    AdventureLogEntryComplete,
    AdventureContext,
    RoomSummary
)
from backend.log_manager import LogManager


class AdventureLogService:
    """
    Service for managing adventure log entries.
    Provides CRUD operations for room visit summaries keyed by (world_uuid, user_uuid).
    """

    def __init__(self, db_session_generator, logger: LogManager):
        """
        Initialize the service.

        Args:
            db_session_generator: Callable that returns a database session
            logger: LogManager instance for logging
        """
        self.db_session_generator = db_session_generator
        self.logger = logger

    def _get_session_context(self):
        """Get a database session context manager."""
        from backend.utils.db_utils import get_session_context
        return get_session_context(self.db_session_generator, self.logger)

    def create_entry(
        self,
        world_uuid: str,
        user_uuid: str,
        room_uuid: str,
        room_name: str,
        visited_at: int
    ) -> AdventureLogEntry:
        """
        Create a new adventure log entry when entering a room.

        Args:
            world_uuid: UUID of the world
            user_uuid: UUID of the user
            room_uuid: UUID of the room being entered
            room_name: Display name of the room
            visited_at: Epoch milliseconds when entered

        Returns:
            The created AdventureLogEntry
        """
        with self._get_session_context() as db:
            now = datetime.now(timezone.utc)

            record = AdventureLogEntryModel(
                world_uuid=world_uuid,
                user_uuid=user_uuid,
                room_uuid=room_uuid,
                room_name=room_name,
                visited_at=visited_at,
                departed_at=None,
                message_count=0,
                summary_json=None,
                created_at=now,
                updated_at=now
            )
            db.add(record)
            db.commit()
            db.refresh(record)

            self.logger.log_step(f"Created adventure log entry for room={room_name}, world={world_uuid[:8]}...")
            return self._model_to_pydantic(record)

    def complete_entry(
        self,
        world_uuid: str,
        user_uuid: str,
        room_uuid: str,
        visited_at: int,
        complete_data: AdventureLogEntryComplete
    ) -> Optional[AdventureLogEntry]:
        """
        Complete an adventure log entry when leaving a room.

        Args:
            world_uuid: UUID of the world
            user_uuid: UUID of the user
            room_uuid: UUID of the room being left
            visited_at: Epoch milliseconds when originally entered (for lookup)
            complete_data: Completion data including summary

        Returns:
            The updated AdventureLogEntry, or None if not found
        """
        with self._get_session_context() as db:
            record = db.query(AdventureLogEntryModel).filter(
                and_(
                    AdventureLogEntryModel.world_uuid == world_uuid,
                    AdventureLogEntryModel.user_uuid == user_uuid,
                    AdventureLogEntryModel.room_uuid == room_uuid,
                    AdventureLogEntryModel.visited_at == visited_at
                )
            ).first()

            if not record:
                self.logger.log_warning(f"Adventure log entry not found for completion: room={room_uuid}, visited_at={visited_at}")
                return None

            now = datetime.now(timezone.utc)

            record.departed_at = complete_data.departed_at
            record.message_count = complete_data.message_count
            record.summary_json = complete_data.summary.model_dump()
            record.updated_at = now

            db.commit()
            db.refresh(record)

            self.logger.log_step(f"Completed adventure log entry for room={record.room_name}")
            return self._model_to_pydantic(record)

    def get_adventure_context(
        self,
        world_uuid: str,
        user_uuid: str,
        max_entries: int = 10
    ) -> AdventureContext:
        """
        Get the adventure context for a world+user playthrough.

        Args:
            world_uuid: UUID of the world
            user_uuid: UUID of the user
            max_entries: Maximum number of recent entries to include

        Returns:
            AdventureContext with recent room summaries
        """
        with self._get_session_context() as db:
            records = db.query(AdventureLogEntryModel).filter(
                and_(
                    AdventureLogEntryModel.world_uuid == world_uuid,
                    AdventureLogEntryModel.user_uuid == user_uuid,
                    AdventureLogEntryModel.summary_json.isnot(None)  # Only completed entries
                )
            ).order_by(desc(AdventureLogEntryModel.visited_at)).limit(max_entries).all()

            # Reverse to get chronological order (oldest first)
            records = list(reversed(records))

            entries: List[RoomSummary] = []
            total_messages = 0
            unique_rooms = set()

            for record in records:
                if record.summary_json:
                    try:
                        summary = RoomSummary.model_validate(record.summary_json)
                        entries.append(summary)
                        total_messages += record.message_count
                        unique_rooms.add(record.room_uuid)
                    except Exception as e:
                        self.logger.log_warning(f"Failed to parse summary_json: {e}")

            return AdventureContext(
                world_uuid=world_uuid,
                user_uuid=user_uuid,
                entries=entries,
                current_objectives=[],  # TODO: Could be extracted from summaries
                total_rooms_visited=len(unique_rooms),
                total_message_count=total_messages
            )

    def get_entries_for_room(
        self,
        world_uuid: str,
        user_uuid: str,
        room_uuid: str
    ) -> List[AdventureLogEntry]:
        """
        Get all adventure log entries for a specific room.

        Args:
            world_uuid: UUID of the world
            user_uuid: UUID of the user
            room_uuid: UUID of the room

        Returns:
            List of AdventureLogEntry objects for this room
        """
        with self._get_session_context() as db:
            records = db.query(AdventureLogEntryModel).filter(
                and_(
                    AdventureLogEntryModel.world_uuid == world_uuid,
                    AdventureLogEntryModel.user_uuid == user_uuid,
                    AdventureLogEntryModel.room_uuid == room_uuid
                )
            ).order_by(desc(AdventureLogEntryModel.visited_at)).all()

            return [self._model_to_pydantic(r) for r in records]

    def get_latest_incomplete_entry(
        self,
        world_uuid: str,
        user_uuid: str
    ) -> Optional[AdventureLogEntry]:
        """
        Get the most recent incomplete entry (room not yet departed).

        Args:
            world_uuid: UUID of the world
            user_uuid: UUID of the user

        Returns:
            The most recent incomplete entry, or None
        """
        with self._get_session_context() as db:
            record = db.query(AdventureLogEntryModel).filter(
                and_(
                    AdventureLogEntryModel.world_uuid == world_uuid,
                    AdventureLogEntryModel.user_uuid == user_uuid,
                    AdventureLogEntryModel.departed_at.is_(None)
                )
            ).order_by(desc(AdventureLogEntryModel.visited_at)).first()

            if record:
                return self._model_to_pydantic(record)
            return None

    def delete_entries_for_world(
        self,
        world_uuid: str,
        user_uuid: str
    ) -> int:
        """
        Delete all adventure log entries for a world+user combination.
        Used when starting a new game or clearing progress.

        Args:
            world_uuid: UUID of the world
            user_uuid: UUID of the user

        Returns:
            Number of entries deleted
        """
        with self._get_session_context() as db:
            count = db.query(AdventureLogEntryModel).filter(
                and_(
                    AdventureLogEntryModel.world_uuid == world_uuid,
                    AdventureLogEntryModel.user_uuid == user_uuid
                )
            ).delete()
            db.commit()

            self.logger.log_step(f"Deleted {count} adventure log entries for world={world_uuid[:8]}...")
            return count

    def _model_to_pydantic(self, record: AdventureLogEntryModel) -> AdventureLogEntry:
        """Convert SQLAlchemy model to Pydantic model."""
        summary = None
        if record.summary_json:
            try:
                summary = RoomSummary.model_validate(record.summary_json)
            except Exception:
                pass

        return AdventureLogEntry(
            id=record.id,
            world_uuid=record.world_uuid,
            user_uuid=record.user_uuid,
            room_uuid=record.room_uuid,
            room_name=record.room_name,
            visited_at=record.visited_at,
            departed_at=record.departed_at,
            message_count=record.message_count,
            summary=summary,
            created_at=record.created_at.isoformat() if record.created_at else None,
            updated_at=record.updated_at.isoformat() if record.updated_at else None
        )
