"""
backend/services/world_progress_service.py
Service for managing world playthrough progress per-user.

Design Philosophy:
- SQLite is the source of truth for progress data
- No foreign key constraints (orphaned rows are harmless)
- JSON columns for complex nested structures
- UPSERT pattern for save operations
"""
import json
from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import and_

from backend.database import SessionLocal
from backend.sql_models import WorldUserProgress as WorldUserProgressModel
from backend.models.world_progress import (
    WorldUserProgress,
    WorldUserProgressUpdate,
    WorldUserProgressSummary
)
from backend.log_manager import LogManager


class WorldUserProgressService:
    """
    Service for managing world user progress (save slots).
    Provides CRUD operations for progress keyed by (world_uuid, user_uuid).
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

    def get_progress(
        self,
        world_uuid: str,
        user_uuid: str
    ) -> Optional[WorldUserProgress]:
        """
        Get progress for a world+user combination.

        Args:
            world_uuid: UUID of the world
            user_uuid: UUID of the user

        Returns:
            WorldUserProgress if found, None otherwise
        """
        with self._get_session_context() as db:
            record = db.query(WorldUserProgressModel).filter(
                and_(
                    WorldUserProgressModel.world_uuid == world_uuid,
                    WorldUserProgressModel.user_uuid == user_uuid
                )
            ).first()

            if not record:
                return None

            return self._model_to_pydantic(record)

    def save_progress(
        self,
        world_uuid: str,
        user_uuid: str,
        update: WorldUserProgressUpdate
    ) -> WorldUserProgress:
        """
        Save (upsert) progress for a world+user combination.

        Args:
            world_uuid: UUID of the world
            user_uuid: UUID of the user
            update: Progress data to save

        Returns:
            The saved WorldUserProgress
        """
        with self._get_session_context() as db:
            # Check for existing record
            record = db.query(WorldUserProgressModel).filter(
                and_(
                    WorldUserProgressModel.world_uuid == world_uuid,
                    WorldUserProgressModel.user_uuid == user_uuid
                )
            ).first()

            now = datetime.now(timezone.utc)

            if record:
                # Update existing record
                self._apply_update(record, update)
                record.last_played_at = now
                record.updated_at = now
                self.logger.log_step(f"Updated progress for world={world_uuid}, user={user_uuid}")
            else:
                # Create new record
                record = WorldUserProgressModel(
                    world_uuid=world_uuid,
                    user_uuid=user_uuid,
                    player_xp=update.player_xp or 0,
                    player_level=update.player_level or 1,
                    player_gold=update.player_gold or 0,
                    current_room_uuid=update.current_room_uuid,
                    bonded_ally_uuid=self._handle_bonded_ally(update.bonded_ally_uuid),
                    time_state_json=self._to_json(update.time_state),
                    npc_relationships_json=self._to_json(update.npc_relationships),
                    player_inventory_json=self._to_json(update.player_inventory),
                    ally_inventory_json=self._to_json(update.ally_inventory),
                    room_states_json=self._to_json(update.room_states),
                    last_played_at=now,
                    created_at=now,
                    updated_at=now
                )
                db.add(record)
                self.logger.log_step(f"Created progress for world={world_uuid}, user={user_uuid}")

            db.commit()
            db.refresh(record)

            return self._model_to_pydantic(record)

    def list_progress_for_world(
        self,
        world_uuid: str
    ) -> List[WorldUserProgressSummary]:
        """
        List all progress records for a world (all users who have played).

        Args:
            world_uuid: UUID of the world

        Returns:
            List of WorldUserProgressSummary objects
        """
        with self._get_session_context() as db:
            records = db.query(WorldUserProgressModel).filter(
                WorldUserProgressModel.world_uuid == world_uuid
            ).order_by(WorldUserProgressModel.last_played_at.desc()).all()

            return [
                WorldUserProgressSummary(
                    user_uuid=r.user_uuid,
                    user_name=None,  # Resolved by endpoint from user profile
                    player_level=r.player_level,
                    player_xp=r.player_xp,
                    player_gold=r.player_gold,
                    current_room_uuid=r.current_room_uuid,
                    last_played_at=r.last_played_at.isoformat() if r.last_played_at else None
                )
                for r in records
            ]

    def delete_progress(
        self,
        world_uuid: str,
        user_uuid: str
    ) -> bool:
        """
        Delete progress for a world+user combination.

        Args:
            world_uuid: UUID of the world
            user_uuid: UUID of the user

        Returns:
            True if deleted, False if not found
        """
        with self._get_session_context() as db:
            record = db.query(WorldUserProgressModel).filter(
                and_(
                    WorldUserProgressModel.world_uuid == world_uuid,
                    WorldUserProgressModel.user_uuid == user_uuid
                )
            ).first()

            if not record:
                return False

            db.delete(record)
            db.commit()
            self.logger.log_step(f"Deleted progress for world={world_uuid}, user={user_uuid}")
            return True

    def _apply_update(
        self,
        record: WorldUserProgressModel,
        update: WorldUserProgressUpdate
    ) -> None:
        """Apply partial update to an existing record."""
        if update.player_xp is not None:
            record.player_xp = update.player_xp
        if update.player_level is not None:
            record.player_level = update.player_level
        if update.player_gold is not None:
            record.player_gold = update.player_gold
        if update.current_room_uuid is not None:
            record.current_room_uuid = update.current_room_uuid
        if update.bonded_ally_uuid is not None:
            record.bonded_ally_uuid = self._handle_bonded_ally(update.bonded_ally_uuid)
        if update.time_state is not None:
            record.time_state_json = self._to_json(update.time_state)
        if update.npc_relationships is not None:
            record.npc_relationships_json = self._to_json(update.npc_relationships)
        if update.player_inventory is not None:
            record.player_inventory_json = self._to_json(update.player_inventory)
        if update.ally_inventory is not None:
            record.ally_inventory_json = self._to_json(update.ally_inventory)
        if update.room_states is not None:
            record.room_states_json = self._to_json(update.room_states)

    def _handle_bonded_ally(self, value: Optional[str]) -> Optional[str]:
        """Handle bonded ally UUID - empty string means clear (unbond)."""
        if value == "":
            return None
        return value

    def _to_json(self, value) -> Optional[str]:
        """Convert a Pydantic model or dict to JSON string."""
        if value is None:
            return None
        if hasattr(value, 'model_dump'):
            # Pydantic model
            return json.dumps(value.model_dump())
        if isinstance(value, dict):
            # Handle dict with Pydantic model values
            serialized = {}
            for k, v in value.items():
                if hasattr(v, 'model_dump'):
                    serialized[k] = v.model_dump()
                else:
                    serialized[k] = v
            return json.dumps(serialized)
        return json.dumps(value)

    def _from_json(self, value: Optional[str]) -> Optional[dict]:
        """Parse JSON string to dict."""
        if value is None:
            return None
        if isinstance(value, dict):
            return value
        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return None

    def _model_to_pydantic(self, record: WorldUserProgressModel) -> WorldUserProgress:
        """Convert SQLAlchemy model to Pydantic model."""
        return WorldUserProgress(
            world_uuid=record.world_uuid,
            user_uuid=record.user_uuid,
            player_xp=record.player_xp,
            player_level=record.player_level,
            player_gold=record.player_gold,
            current_room_uuid=record.current_room_uuid,
            bonded_ally_uuid=record.bonded_ally_uuid,
            time_state=self._from_json(record.time_state_json),
            npc_relationships=self._from_json(record.npc_relationships_json),
            player_inventory=self._from_json(record.player_inventory_json),
            ally_inventory=self._from_json(record.ally_inventory_json),
            room_states=self._from_json(record.room_states_json),
            last_played_at=record.last_played_at.isoformat() if record.last_played_at else None,
            created_at=record.created_at.isoformat() if record.created_at else None,
            updated_at=record.updated_at.isoformat() if record.updated_at else None
        )
