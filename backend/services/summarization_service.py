"""
backend/services/summarization_service.py
Service for summarizing room visits into RoomSummary objects.

Supports two methods:
1. LLM summarization - Uses the configured LLM to generate structured summaries
2. Fallback extraction - Keyword-based extraction when LLM is unavailable
"""
import json
import re
import time
from typing import List, Optional, Dict, Any

from backend.models.adventure_log import (
    RoomSummary,
    NPCInteractionSummary,
    ItemChange,
    SummarizeMessageInput,
    SummarizeNPCInput,
    create_empty_room_summary
)
from backend.log_manager import LogManager


# LLM prompt for structured summarization
SUMMARIZATION_PROMPT = """You are a narrative log keeper. Summarize the following conversation that took place in "{room_name}".

Output ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{{
  "key_events": ["event1", "event2"],
  "npcs_interacted": [
    {{"npc_uuid": "uuid", "npc_name": "Name", "relationship_change": "improved|worsened|neutral", "notable_interaction": "brief description"}}
  ],
  "items_changed": [
    {{"item": "item name", "action": "acquired|used|lost|traded"}}
  ],
  "unresolved_threads": ["thread1"],
  "mood_on_departure": "hopeful|wounded|triumphant|fearful|curious|neutral"
}}

Rules:
- key_events: Max 3 most significant events (10-20 words each)
- npcs_interacted: Only NPCs from this list: {npc_list}
- notable_interaction: Max 60 characters
- unresolved_threads: Max 2 open questions or unfinished business
- mood_on_departure: Player's emotional state based on conversation tone

NPCs present: {npc_list}

Conversation:
{conversation}

JSON output:"""


# Keywords for fallback extraction
ACTION_KEYWORDS = {
    'acquired': ['found', 'picked up', 'received', 'obtained', 'acquired', 'got', 'took', 'grabbed', 'collected'],
    'used': ['used', 'consumed', 'activated', 'equipped', 'wore', 'wielded'],
    'lost': ['lost', 'dropped', 'destroyed', 'broke', 'gave away'],
    'traded': ['traded', 'exchanged', 'sold', 'bought', 'bartered']
}

EVENT_KEYWORDS = [
    'attacked', 'defeated', 'killed', 'discovered', 'found', 'learned',
    'agreed', 'refused', 'escaped', 'entered', 'opened', 'closed',
    'met', 'spoke', 'asked', 'answered', 'revealed', 'secret'
]

MOOD_KEYWORDS = {
    'hopeful': ['hope', 'excited', 'looking forward', 'optimistic', 'happy', 'pleased'],
    'wounded': ['hurt', 'injured', 'pain', 'wounded', 'damaged'],
    'triumphant': ['victory', 'won', 'defeated', 'success', 'accomplished'],
    'fearful': ['afraid', 'scared', 'fear', 'worried', 'anxious', 'nervous'],
    'curious': ['wonder', 'curious', 'mystery', 'question', 'intrigued']
}


class SummarizationService:
    """
    Service for summarizing room visits.
    Uses LLM when available, falls back to keyword extraction.
    """

    def __init__(self, api_handler, logger: LogManager):
        """
        Initialize the service.

        Args:
            api_handler: ApiHandler instance for LLM calls
            logger: LogManager instance for logging
        """
        self.api_handler = api_handler
        self.logger = logger

    async def summarize_room_messages(
        self,
        room_uuid: str,
        room_name: str,
        visited_at: int,
        messages: List[SummarizeMessageInput],
        npcs: List[SummarizeNPCInput],
        api_config: Optional[Dict[str, Any]] = None
    ) -> tuple[RoomSummary, str]:
        """
        Summarize chat messages from a room visit.

        Args:
            room_uuid: UUID of the room
            room_name: Display name of the room
            visited_at: Epoch milliseconds when visit started
            messages: Chat messages from the visit
            npcs: NPCs present in the room
            api_config: LLM API configuration (optional)

        Returns:
            Tuple of (RoomSummary, method) where method is "llm" or "fallback"
        """
        departed_at = int(time.time() * 1000)
        message_count = len(messages)

        # If no messages or very few, return minimal summary
        if message_count < 2:
            self.logger.log_step(f"Too few messages ({message_count}) for summarization")
            summary = create_empty_room_summary(room_uuid, room_name, visited_at)
            summary = RoomSummary(
                **{**summary.model_dump(), 'departed_at': departed_at, 'message_count': message_count}
            )
            return summary, "fallback"

        # If no meaningful conversation (only room intros, no user messages), return pass-through summary
        if not self._has_meaningful_content(messages):
            self.logger.log_step(f"No conversation in {room_name}, creating pass-through summary")
            summary = create_empty_room_summary(room_uuid, room_name, visited_at)
            summary = RoomSummary(
                **{**summary.model_dump(),
                   'departed_at': departed_at,
                   'message_count': message_count,
                   'key_events': ['Passed through briefly']}
            )
            return summary, "passthrough"

        # Try LLM summarization if API config is available
        if api_config and api_config.get('url'):
            try:
                summary = await self._llm_summarize(
                    room_uuid, room_name, visited_at, departed_at,
                    messages, npcs, api_config
                )
                if summary:
                    self.logger.log_step(f"LLM summarization succeeded for {room_name}")
                    return summary, "llm"
            except Exception as e:
                self.logger.log_warning(f"LLM summarization failed: {e}")

        # Fall back to keyword extraction
        self.logger.log_step(f"Using fallback summarization for {room_name}")
        summary = self._fallback_summarize(
            room_uuid, room_name, visited_at, departed_at,
            messages, npcs
        )
        return summary, "fallback"

    async def _llm_summarize(
        self,
        room_uuid: str,
        room_name: str,
        visited_at: int,
        departed_at: int,
        messages: List[SummarizeMessageInput],
        npcs: List[SummarizeNPCInput],
        api_config: Dict[str, Any]
    ) -> Optional[RoomSummary]:
        """
        Use LLM to generate a structured summary.
        """
        # Build conversation text
        conversation_lines = []
        for msg in messages[-30:]:  # Limit to last 30 messages
            role_label = "Player" if msg.role == "user" else "Narrator"
            # Clean content (strip HTML if present)
            content = self._strip_html(msg.content)
            if content:
                conversation_lines.append(f"{role_label}: {content[:500]}")  # Truncate long messages

        conversation = "\n".join(conversation_lines)

        # Build NPC list
        npc_list = ", ".join(f"{n.name} ({n.id})" for n in npcs) if npcs else "None"

        # Build prompt
        prompt = SUMMARIZATION_PROMPT.format(
            room_name=room_name,
            npc_list=npc_list,
            conversation=conversation
        )

        # Call LLM
        generation_params = {
            "prompt": prompt,
            "max_length": 500,
            "temperature": 0.3,  # Low temperature for structured output
            "stop_sequence": ["\n\n", "```"]
        }

        result = await self.api_handler.generate_with_config(api_config, generation_params)

        if 'error' in result:
            raise Exception(result['error'])

        content = result.get('content', '')

        # Parse JSON response
        summary_data = self._parse_llm_response(content, npcs)
        if not summary_data:
            return None

        return RoomSummary(
            room_uuid=room_uuid,
            room_name=room_name,
            visited_at=visited_at,
            departed_at=departed_at,
            message_count=len(messages),
            key_events=summary_data.get('key_events', [])[:3],
            npcs_interacted=summary_data.get('npcs_interacted', []),
            items_changed=summary_data.get('items_changed', []),
            unresolved_threads=summary_data.get('unresolved_threads', [])[:2],
            mood_on_departure=summary_data.get('mood_on_departure', 'neutral')
        )

    def _parse_llm_response(
        self,
        content: str,
        npcs: List[SummarizeNPCInput]
    ) -> Optional[Dict[str, Any]]:
        """
        Parse the LLM's JSON response into a summary dict.
        """
        try:
            # Try to extract JSON from response
            content = content.strip()

            # Remove markdown code block if present
            if content.startswith('```'):
                content = re.sub(r'^```(?:json)?\n?', '', content)
                content = re.sub(r'\n?```$', '', content)

            # Find JSON object
            json_match = re.search(r'\{[\s\S]*\}', content)
            if not json_match:
                self.logger.log_warning("No JSON object found in LLM response")
                return None

            data = json.loads(json_match.group())

            # Validate and transform npcs_interacted
            npc_uuid_map = {n.id: n.name for n in npcs}
            npc_name_map = {n.name.lower(): n for n in npcs}

            npcs_interacted = []
            for npc_data in data.get('npcs_interacted', []):
                npc_uuid = npc_data.get('npc_uuid', '')
                npc_name = npc_data.get('npc_name', '')

                # Try to match by UUID first, then by name
                if npc_uuid in npc_uuid_map:
                    matched_name = npc_uuid_map[npc_uuid]
                elif npc_name.lower() in npc_name_map:
                    npc = npc_name_map[npc_name.lower()]
                    npc_uuid = npc.id
                    matched_name = npc.name
                else:
                    continue  # Skip unmatched NPCs

                npcs_interacted.append(NPCInteractionSummary(
                    npc_uuid=npc_uuid,
                    npc_name=matched_name,
                    relationship_change=npc_data.get('relationship_change', 'neutral'),
                    notable_interaction=npc_data.get('notable_interaction', '')[:60]
                ))

            # Transform items_changed
            items_changed = []
            for item_data in data.get('items_changed', []):
                action = item_data.get('action', 'acquired')
                if action not in {'acquired', 'used', 'lost', 'traded'}:
                    action = 'acquired'
                items_changed.append(ItemChange(
                    item=item_data.get('item', ''),
                    action=action
                ))

            # Validate mood
            mood = data.get('mood_on_departure', 'neutral')
            valid_moods = {'hopeful', 'wounded', 'triumphant', 'fearful', 'curious', 'neutral'}
            if mood not in valid_moods:
                mood = 'neutral'

            return {
                'key_events': data.get('key_events', []),
                'npcs_interacted': npcs_interacted,
                'items_changed': items_changed,
                'unresolved_threads': data.get('unresolved_threads', []),
                'mood_on_departure': mood
            }

        except json.JSONDecodeError as e:
            self.logger.log_warning(f"Failed to parse LLM JSON response: {e}")
            return None
        except Exception as e:
            self.logger.log_warning(f"Error processing LLM response: {e}")
            return None

    def _fallback_summarize(
        self,
        room_uuid: str,
        room_name: str,
        visited_at: int,
        departed_at: int,
        messages: List[SummarizeMessageInput],
        npcs: List[SummarizeNPCInput]
    ) -> RoomSummary:
        """
        Extract summary using keyword matching (fallback when LLM unavailable).
        """
        # Combine all message content
        all_content = " ".join(self._strip_html(m.content) for m in messages).lower()

        # Extract key events
        key_events = []
        for keyword in EVENT_KEYWORDS:
            if keyword in all_content and len(key_events) < 3:
                # Find a sentence containing the keyword
                sentences = re.split(r'[.!?]', all_content)
                for sentence in sentences:
                    if keyword in sentence and len(sentence) > 10:
                        event = sentence.strip()[:80]
                        if event and event not in key_events:
                            key_events.append(event.capitalize())
                            break

        # Detect NPC interactions
        npcs_interacted = []
        npc_names_lower = {n.name.lower(): n for n in npcs}
        for name_lower, npc in npc_names_lower.items():
            if name_lower in all_content:
                npcs_interacted.append(NPCInteractionSummary(
                    npc_uuid=npc.id,
                    npc_name=npc.name,
                    relationship_change='neutral',
                    notable_interaction='Encountered during visit'
                ))

        # Detect item changes
        items_changed = []
        for action, keywords in ACTION_KEYWORDS.items():
            for keyword in keywords:
                if keyword in all_content:
                    # Try to find what was affected
                    match = re.search(rf'{keyword}\s+(?:a\s+|the\s+)?(\w+(?:\s+\w+)?)', all_content)
                    if match:
                        item_name = match.group(1)
                        if len(item_name) > 2:
                            items_changed.append(ItemChange(
                                item=item_name.capitalize(),
                                action=action
                            ))
                            break

        # Determine mood
        mood = 'neutral'
        for mood_name, keywords in MOOD_KEYWORDS.items():
            for keyword in keywords:
                if keyword in all_content:
                    mood = mood_name
                    break
            if mood != 'neutral':
                break

        return RoomSummary(
            room_uuid=room_uuid,
            room_name=room_name,
            visited_at=visited_at,
            departed_at=departed_at,
            message_count=len(messages),
            key_events=key_events[:3],
            npcs_interacted=npcs_interacted,
            items_changed=items_changed[:5],
            unresolved_threads=[],
            mood_on_departure=mood
        )

    def _has_meaningful_content(self, messages: List[SummarizeMessageInput]) -> bool:
        """
        Check if messages contain meaningful conversation content.

        Returns False if messages are only room intros or system notifications
        (i.e., no user messages present).
        """
        user_messages = [m for m in messages if m.role == 'user']
        return len(user_messages) > 0

    def _strip_html(self, content: str) -> str:
        """Strip HTML tags from content."""
        if not content:
            return ""
        # Simple HTML tag removal
        clean = re.sub(r'<[^>]+>', '', content)
        # Normalize whitespace
        clean = re.sub(r'\s+', ' ', clean).strip()
        return clean
