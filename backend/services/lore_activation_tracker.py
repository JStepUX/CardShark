"""
@file lore_activation_tracker.py
@description Service for tracking and managing active lore entries with temporal effects (sticky/cooldown/delay).
Implements SillyTavern-compatible lore expiration mechanics.
@dependencies sql_models, database
@consumers lore_handler, api_handler, chat_endpoints
"""
import uuid
import logging
from typing import List, Optional, Dict, Tuple
from sqlalchemy.orm import Session
from backend import sql_models
from backend.database import get_db

logger = logging.getLogger(__name__)


class LoreActivationTracker:
    """
    Manages active lore entries in chat sessions with temporal effects.

    Temporal Effects:
    - Sticky: Entry stays active for N messages after activation
    - Cooldown: Entry can't activate for N messages after sticky expires
    - Delay: Entry can't activate until at least N messages exist in chat

    Example: sticky=2, cooldown=1, delay=0
    - Message 0: Available
    - Message 0: Activates → sticky_remaining=2
    - Message 1: Still active (sticky_remaining=1)
    - Message 2: Still active (sticky_remaining=0, then expires)
    - Message 3: Cooldown (cooldown_remaining=0, then available again)
    - Message 4+: Available for re-activation
    """

    def __init__(self, db: Session, chat_session_uuid: str):
        """
        Initialize tracker for a specific chat session.

        Args:
            db: Database session
            chat_session_uuid: UUID of the chat session to track
        """
        self.db = db
        self.chat_session_uuid = chat_session_uuid

    def activate(
        self,
        lore_entry_id: int,
        character_uuid: str,
        message_number: int,
        sticky: int = 2,
        cooldown: int = 0,
        delay: int = 0
    ) -> sql_models.LoreActivation:
        """
        Activate a lore entry with temporal effects.

        Args:
            lore_entry_id: ID of the lore entry
            character_uuid: UUID of the character
            message_number: Current message number in chat
            sticky: Messages to stay active (default: 2)
            cooldown: Messages to block re-activation after sticky (default: 0)
            delay: Messages required before first activation (default: 0)

        Returns:
            Created LoreActivation record
        """
        # Check if already active
        existing = self.get_activation(lore_entry_id)
        if existing:
            # Already active, update sticky if new activation has longer duration
            if sticky > existing.sticky_remaining:
                existing.sticky_remaining = sticky
                existing.updated_at = sql_models.func.now()
                self.db.commit()
                logger.debug(f"Extended sticky for lore_entry_id={lore_entry_id} to {sticky} messages")
            return existing

        # Check if in cooldown
        if self.is_in_cooldown(lore_entry_id):
            logger.debug(f"Lore entry {lore_entry_id} is in cooldown, skipping activation")
            return None

        # Check delay requirement
        if message_number < delay:
            logger.debug(f"Lore entry {lore_entry_id} requires {delay} messages, only at {message_number}")
            return None

        # Create new activation
        activation = sql_models.LoreActivation(
            activation_id=str(uuid.uuid4()),
            chat_session_uuid=self.chat_session_uuid,
            lore_entry_id=lore_entry_id,
            character_uuid=character_uuid,
            activated_at_message_number=message_number,
            sticky_remaining=sticky,
            cooldown_remaining=cooldown,
            delay_remaining=0  # Delay only applies to first activation
        )

        self.db.add(activation)
        self.db.commit()
        self.db.refresh(activation)

        logger.info(f"Activated lore entry {lore_entry_id} with sticky={sticky}, cooldown={cooldown}")
        return activation

    def get_activation(self, lore_entry_id: int) -> Optional[sql_models.LoreActivation]:
        """
        Get active activation for a lore entry.

        Returns:
            LoreActivation if active, None otherwise
        """
        return self.db.query(sql_models.LoreActivation).filter(
            sql_models.LoreActivation.chat_session_uuid == self.chat_session_uuid,
            sql_models.LoreActivation.lore_entry_id == lore_entry_id,
            sql_models.LoreActivation.sticky_remaining > 0
        ).first()

    def get_all_active(self) -> List[sql_models.LoreActivation]:
        """Get all active lore entries (sticky_remaining > 0) for this chat session."""
        return self.db.query(sql_models.LoreActivation).filter(
            sql_models.LoreActivation.chat_session_uuid == self.chat_session_uuid,
            sql_models.LoreActivation.sticky_remaining > 0
        ).all()

    def get_active_lore_entry_ids(self) -> List[int]:
        """Get list of lore_entry_ids that are currently active."""
        activations = self.get_all_active()
        return [a.lore_entry_id for a in activations]

    def is_active(self, lore_entry_id: int) -> bool:
        """Check if a lore entry is currently active (sticky)."""
        return self.get_activation(lore_entry_id) is not None

    def is_in_cooldown(self, lore_entry_id: int) -> bool:
        """Check if a lore entry is in cooldown period."""
        activation = self.db.query(sql_models.LoreActivation).filter(
            sql_models.LoreActivation.chat_session_uuid == self.chat_session_uuid,
            sql_models.LoreActivation.lore_entry_id == lore_entry_id,
            sql_models.LoreActivation.sticky_remaining == 0,
            sql_models.LoreActivation.cooldown_remaining > 0
        ).first()
        return activation is not None

    def decrement_all(self) -> Dict[str, int]:
        """
        Decrement sticky and cooldown counters for all activations.
        Called when a new message is added to the chat.

        Returns:
            Dict with counts: {"expired": N, "active": N, "cooldown": N}
        """
        all_activations = self.db.query(sql_models.LoreActivation).filter(
            sql_models.LoreActivation.chat_session_uuid == self.chat_session_uuid
        ).all()

        expired_count = 0
        active_count = 0
        cooldown_count = 0

        for activation in all_activations:
            # Decrement sticky if active
            if activation.sticky_remaining > 0:
                activation.sticky_remaining -= 1
                if activation.sticky_remaining == 0:
                    # Sticky expired, transition to cooldown
                    logger.debug(f"Lore entry {activation.lore_entry_id} sticky expired")
                    if activation.cooldown_remaining == 0:
                        # No cooldown, can be removed
                        self.db.delete(activation)
                        expired_count += 1
                    else:
                        cooldown_count += 1
                else:
                    active_count += 1

            # Decrement cooldown if in cooldown period
            elif activation.cooldown_remaining > 0:
                activation.cooldown_remaining -= 1
                if activation.cooldown_remaining == 0:
                    # Cooldown expired, remove activation record
                    self.db.delete(activation)
                    expired_count += 1
                else:
                    cooldown_count += 1

        self.db.commit()

        logger.debug(f"Decremented activations: {active_count} active, {cooldown_count} cooldown, {expired_count} expired")
        return {
            "expired": expired_count,
            "active": active_count,
            "cooldown": cooldown_count
        }

    def remove_activation(self, lore_entry_id: int) -> bool:
        """
        Forcibly remove an activation (e.g., when message is deleted or lore entry modified).

        Returns:
            True if activation was removed, False if not found
        """
        activation = self.db.query(sql_models.LoreActivation).filter(
            sql_models.LoreActivation.chat_session_uuid == self.chat_session_uuid,
            sql_models.LoreActivation.lore_entry_id == lore_entry_id
        ).first()

        if activation:
            self.db.delete(activation)
            self.db.commit()
            logger.info(f"Removed activation for lore_entry_id={lore_entry_id}")
            return True

        return False

    def clear_all(self) -> int:
        """
        Clear all activations for this chat session.
        Used when chat is reset or deleted.

        Returns:
            Number of activations cleared
        """
        count = self.db.query(sql_models.LoreActivation).filter(
            sql_models.LoreActivation.chat_session_uuid == self.chat_session_uuid
        ).delete()

        self.db.commit()
        logger.info(f"Cleared {count} lore activations for chat session")
        return count

    def get_activation_summary(self) -> Dict[str, List[Tuple[int, str]]]:
        """
        Get summary of all lore activations for debugging/UI.

        Returns:
            Dict with lists of (lore_entry_id, state) tuples:
            {"active": [...], "cooldown": [...]}
        """
        activations = self.db.query(sql_models.LoreActivation).filter(
            sql_models.LoreActivation.chat_session_uuid == self.chat_session_uuid
        ).all()

        active = []
        cooldown = []

        for activation in activations:
            entry_info = (activation.lore_entry_id, f"sticky={activation.sticky_remaining}")
            if activation.sticky_remaining > 0:
                active.append(entry_info)
            elif activation.cooldown_remaining > 0:
                cooldown.append((activation.lore_entry_id, f"cooldown={activation.cooldown_remaining}"))

        return {
            "active": active,
            "cooldown": cooldown
        }


def get_tracker_for_session(chat_session_uuid: str, db: Session = None) -> LoreActivationTracker:
    """
    Factory function to create a tracker for a chat session.

    Args:
        chat_session_uuid: UUID of the chat session
        db: Optional database session (creates new one if not provided)

    Returns:
        LoreActivationTracker instance
    """
    if db is None:
        db = next(get_db())

    return LoreActivationTracker(db, chat_session_uuid)
