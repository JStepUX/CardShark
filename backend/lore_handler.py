# backend/lore_handler.py
# Simple lore entry matching for chat generation
import re
from typing import Dict, List, Any

class LoreHandler:
    """Handles lore entry matching and integration into prompts"""

    # Position constants for clarity
    POSITION_BEFORE_CHAR = 0
    POSITION_AFTER_CHAR = 1
    POSITION_AN_TOP = 2
    POSITION_AN_BOTTOM = 3
    POSITION_AT_DEPTH = 4
    POSITION_BEFORE_EXAMPLE = 5
    POSITION_AFTER_EXAMPLE = 6

    def __init__(self, logger, default_position=0):  # Default to before_char (0)
        self.logger = logger
        self.default_position = default_position

    @staticmethod
    def estimate_tokens(text: str) -> int:
        """
        Estimate token count for text using simple heuristic.
        Roughly 1 token per 4 characters (conservative estimate).

        Args:
            text: Text to estimate tokens for

        Returns:
            Estimated token count
        """
        if not text:
            return 0
        # Conservative estimate: ~4 chars per token
        return max(1, len(text) // 4)

    def extract_lore_from_metadata(self, metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Extract lore entries from character card metadata
        
        Args:
            metadata: Character card metadata dictionary
            
        Returns:
            List of lore entry dictionaries
        """
        lore_entries = []
        
        self.logger.log_step("Extracting lore entries from character card metadata")
        
        # Validate metadata structure
        if not isinstance(metadata, dict):
            self.logger.log_warning(f"Invalid metadata type: {type(metadata)}")
            return []
            
        # Check if metadata has the expected structure
        if 'data' not in metadata:
            self.logger.log_warning("No 'data' field found in metadata")
            return []
            
        data = metadata['data']
        
        # Look for character_book which contains lore entries
        if 'character_book' not in data or not data['character_book']:
            self.logger.log_step("No character_book found in metadata")
            return []
            
        character_book = data['character_book']
        
        # Extract entries from character_book
        # Character book structure may vary based on format
        if isinstance(character_book, dict):
            # Process modern character book format
            entries = character_book.get('entries', [])
            if entries and isinstance(entries, list):
                for entry in entries:
                    # Validate and standardize the entry
                    if not isinstance(entry, dict):
                        continue
                        
                    # Extract extensions for advanced features
                    extensions = entry.get('extensions', {})
                    if not isinstance(extensions, dict):
                        extensions = {}

                    normalized_entry = {
                        'content': entry.get('content', ''),
                        'keys': entry.get('keys', []),
                        'secondary_keys': entry.get('secondary_keys', []),
                        'enabled': entry.get('enabled', True),
                        'position': self._convert_position(entry.get('position', self.default_position)),
                        'insertion_order': entry.get('insertion_order', 0),
                        'case_sensitive': entry.get('case_sensitive', False),
                        'use_regex': entry.get('use_regex', False),
                        'name': entry.get('name', ''),
                        'has_image': entry.get('has_image', False),
                        'image_uuid': entry.get('image_uuid', ''),
                        'priority': entry.get('priority', 100),  # For token budget prioritization
                        'constant': entry.get('constant', False),  # Always included if true
                        'selective': entry.get('selective', False),  # Requires both keys and secondary_keys
                        # Extensions (advanced features)
                        'extensions': {
                            'match_whole_words': extensions.get('match_whole_words', True),  # Default True for quality
                            'sticky': extensions.get('sticky', 2),  # Default 2 messages
                            'cooldown': extensions.get('cooldown', 0),
                            'delay': extensions.get('delay', 0),
                            'scan_depth': extensions.get('scan_depth', None),  # Per-entry override
                        }
                    }
                    
                    # Only add entries with content and at least one key
                    if normalized_entry['content'] and normalized_entry['keys']:
                        lore_entries.append(normalized_entry)
                        
            self.logger.log_step(f"Extracted {len(lore_entries)} lore entries from character_book")
        else:
            self.logger.log_warning(f"Unexpected character_book type: {type(character_book)}")
            
        return lore_entries
        
    def _convert_position(self, position) -> int:
        """
        Convert position from string or other formats to standard integer
        
        Args:
            position: Position value to convert
            
        Returns:
            Standardized integer position
        """
        # Position mapping from strings (for compatibility with different formats)
        position_mapping = {
            # String positions
            'before_char': self.POSITION_BEFORE_CHAR,
            'after_char': self.POSITION_AFTER_CHAR, 
            'an_top': self.POSITION_AN_TOP,
            'an_bottom': self.POSITION_AN_BOTTOM,
            'at_depth': self.POSITION_AT_DEPTH,
            'before_example': self.POSITION_BEFORE_EXAMPLE,
            'after_example': self.POSITION_AFTER_EXAMPLE
        }
        
        if isinstance(position, str) and position in position_mapping:
            return position_mapping[position]
        elif isinstance(position, int) and 0 <= position <= 6:
            return position
        else:
            return self.default_position
    
    def match_lore_entries(self,
                           lore_entries: List[Dict],
                           text: str = None,
                           chat_messages: List[Any] = None,
                           scan_depth: int = 3) -> List[Dict]:
        """
        Match lore entries against chat history with advanced keyword matching.
        Supports scan depth, regex, word boundaries, and case sensitivity.

        Args:
            lore_entries: List of lore entry dictionaries
            text: (Deprecated) Text to match against - use chat_messages instead
            chat_messages: List of chat message objects with 'content' field
            scan_depth: Number of recent messages to scan (0 = all, default: 3)

        Returns:
            List of matched lore entries
        """
        # Build scan text from chat messages
        if chat_messages is not None:
            # Use only last N messages based on scan_depth
            if scan_depth > 0 and len(chat_messages) > scan_depth:
                messages_to_scan = chat_messages[-scan_depth:]
            else:
                messages_to_scan = chat_messages

            # Concatenate message content
            scan_text_parts = []
            for msg in messages_to_scan:
                content = msg.get('content', '') if isinstance(msg, dict) else getattr(msg, 'content', '')
                if content:
                    scan_text_parts.append(content)

            scan_text = "\n".join(scan_text_parts)
            self.logger.log_step(f"Scanning last {len(messages_to_scan)} messages (scan_depth={scan_depth})")
        elif text is not None:
            # Fallback to old text-based API for backwards compatibility
            scan_text = text
            self.logger.log_step("Using deprecated text parameter (consider using chat_messages)")
        else:
            self.logger.log_warning("No text or chat_messages provided for lore matching")
            return []

        if not lore_entries or not scan_text:
            return []

        self.logger.log_step(f"Matching {len(lore_entries)} lore entries against text")

        # Sort entries by insertion order to maintain priority
        sorted_entries = sorted(lore_entries, key=lambda e: e.get('insertion_order', 0))
        matched_entries = []

        for entry in sorted_entries:
            # Skip disabled entries
            if entry.get('enabled') is False:
                continue

            # Skip entries with no keys
            keys = entry.get('keys', [])
            if not keys:
                continue

            # Get matching options from entry
            case_sensitive = entry.get('case_sensitive', False)
            match_whole_words = entry.get('extensions', {}).get('match_whole_words', True)  # Default to True for quality
            use_regex = entry.get('use_regex', False)

            # Prepare search text based on case sensitivity
            search_text = scan_text if case_sensitive else scan_text.lower()

            # Try to find a match for any key
            matched = False
            for key in keys:
                if not key or not isinstance(key, str):
                    continue

                key = key.strip()
                if not key:
                    continue

                # Check if key is a regex pattern (starts and ends with /)
                is_regex = use_regex or (key.startswith('/') and key.endswith('/') and len(key) > 2)

                if is_regex:
                    # Regex matching
                    pattern_str = key[1:-1] if key.startswith('/') else key  # Strip / delimiters
                    try:
                        flags = 0 if case_sensitive else re.IGNORECASE
                        if re.search(pattern_str, scan_text, flags):
                            matched = True
                            self.logger.log_step(f"Matched regex key: {key}")
                            break
                    except re.error as e:
                        self.logger.log_warning(f"Invalid regex pattern '{key}': {e}")
                        continue

                elif match_whole_words:
                    # Word boundary matching (prevents "cat" from matching "category")
                    pattern = r'\b' + re.escape(key) + r'\b'
                    flags = 0 if case_sensitive else re.IGNORECASE
                    if re.search(pattern, scan_text, flags):
                        matched = True
                        self.logger.log_step(f"Matched whole word key: {key}")
                        break

                else:
                    # Simple substring matching (original behavior)
                    search_key = key if case_sensitive else key.lower()
                    if search_key in search_text:
                        matched = True
                        self.logger.log_step(f"Matched substring key: {key}")
                        break

            if matched:
                matched_entries.append(entry)

        self.logger.log_step(f"Matched {len(matched_entries)} lore entries")
        return matched_entries
        
    def build_memory(self,
                     character_data: Dict,
                     excluded_fields: List[str] = None,
                     char_name: str = 'Character',
                     user_name: str = 'User',
                     lore_entries: List[Dict] = None,
                     active_sticky_entries: List[Dict] = None,
                     token_budget: int = 0) -> str:
        """
        Build the memory string from character card data with lore integration.
        Single source of truth for memory assembly — replaces both
        integrate_lore_into_prompt() and _create_basic_prompt().

        Args:
            character_data: Character card data dict (with 'data' sub-dict)
            excluded_fields: List of field keys to skip (e.g. ['scenario', 'mes_example'])
            char_name: Character name for {{char}} resolution
            user_name: User name for {{user}} resolution
            lore_entries: Newly matched lore entries (may be empty)
            active_sticky_entries: Still-active sticky lore entries
            token_budget: Max tokens for lore entries (0 = unlimited)

        Returns:
            Assembled memory string with resolved tokens
        """
        excluded = set(excluded_fields or [])

        # Extract fields from character_data
        if character_data and 'data' in character_data:
            data = character_data['data']
        elif character_data:
            data = character_data
        else:
            data = {}

        system_prompt = data.get('system_prompt', '') if 'system_prompt' not in excluded else ''
        description = data.get('description', '') if 'description' not in excluded else ''
        personality = data.get('personality', '') if 'personality' not in excluded else ''
        scenario = data.get('scenario', '') if 'scenario' not in excluded else ''
        examples = data.get('mes_example', '') if 'mes_example' not in excluded else ''

        # Strip whitespace-only values
        system_prompt = system_prompt.strip() if system_prompt else ''
        description = description.strip() if description else ''
        personality = personality.strip() if personality else ''
        scenario = scenario.strip() if scenario else ''
        examples = examples.strip() if examples else ''

        # Merge matched + sticky lore entries (dedup by ID)
        all_lore = list(lore_entries or [])
        if active_sticky_entries:
            matched_ids = set()
            for entry in all_lore:
                entry_id = entry.get('id') or entry.get('name', '')
                if entry_id:
                    matched_ids.add(entry_id)
            for sticky_entry in active_sticky_entries:
                entry_id = sticky_entry.get('id') or sticky_entry.get('name', '')
                if entry_id not in matched_ids:
                    all_lore.append(sticky_entry)

        if all_lore:
            self.logger.log_step(f"build_memory: {len(all_lore)} lore entries ({len(lore_entries or [])} matched, {len(active_sticky_entries or [])} sticky)")

            # Apply token budget
            if token_budget > 0:
                all_lore = self._apply_token_budget(all_lore, token_budget)

        # Group lore entries by position
        before_char = []
        after_char = []
        author_note_top = []
        author_note_bottom = []
        before_example = []
        after_example = []

        position_mapping = {
            0: before_char, 1: after_char,
            2: author_note_top, 3: author_note_bottom,
            4: None, 5: before_example, 6: after_example,
            'before_char': before_char, 'after_char': after_char,
            'an_top': author_note_top, 'an_bottom': author_note_bottom,
            'at_depth': None, 'before_example': before_example, 'after_example': after_example
        }

        for entry in all_lore:
            content = entry.get('content', '')
            if not content:
                continue
            position = entry.get('position', self.default_position)
            target_list = position_mapping.get(position, position_mapping[self.default_position])
            if target_list is not None:
                target_list.append(content)
            else:
                default_list = position_mapping.get(self.default_position, before_char)
                if default_list is not None:
                    default_list.append(content)

        # Assemble memory in canonical order
        memory = system_prompt if system_prompt else ""

        if author_note_top:
            if memory:
                memory += "\n\n"
            memory += "[Author's Note: " + "\n".join(author_note_top) + "]"

        if memory:
            memory += "\n\n"

        if before_char:
            memory += "\n".join(before_char)
            memory += "\n\n"

        if description:
            memory += f"Persona: {description}"

        if after_char:
            memory += "\n\n" + "\n".join(after_char)

        if personality:
            memory += f"\nPersonality: {personality}"
        if scenario:
            memory += f"\nScenario: {scenario}"

        if before_example:
            memory += "\n\n" + "\n".join(before_example)

        if examples:
            memory += f"\n\n{examples}"

        if after_example:
            memory += "\n\n" + "\n".join(after_example)

        if author_note_bottom:
            memory += "\n\n[Author's Note: " + "\n".join(author_note_bottom) + "]"

        # Final pass: resolve {{user}}/{{char}} tokens
        memory = memory.replace('{{user}}', user_name).replace('{{char}}', char_name)

        return memory

    def integrate_lore_into_prompt(self,
                                  character_data: Dict,
                                  matched_entries: List[Dict],
                                  active_sticky_entries: List[Dict] = None,
                                  token_budget: int = 0) -> str:
        """
        Legacy wrapper — delegates to build_memory().

        Args:
            character_data: Character card data
            matched_entries: List of newly matched lore entries
            active_sticky_entries: List of lore entries that are still active from sticky state
            token_budget: Maximum tokens for all lore entries (0 = unlimited)

        Returns:
            Formatted prompt with lore entries
        """
        return self.build_memory(
            character_data,
            lore_entries=matched_entries,
            active_sticky_entries=active_sticky_entries,
            token_budget=token_budget
        )
        
    def _apply_token_budget(self, entries: List[Dict], token_budget: int) -> List[Dict]:
        """
        Apply token budget to lore entries with priority-based discarding.

        SillyTavern activation order:
        1. Constant entries (always included)
        2. Entries sorted by priority (lower number = higher priority = kept longer)
        3. Discard lowest priority entries first when budget exceeded

        Args:
            entries: List of lore entries to filter
            token_budget: Maximum tokens allowed

        Returns:
            Filtered list of entries within budget
        """
        # Separate constant and non-constant entries
        constant_entries = [e for e in entries if e.get('constant', False)]
        non_constant_entries = [e for e in entries if not e.get('constant', False)]

        # Sort non-constant by priority (lower = higher priority = discarded last)
        # Then by insertion_order as tiebreaker
        non_constant_entries.sort(
            key=lambda e: (e.get('priority', 100), e.get('insertion_order', 0))
        )

        # Calculate tokens and accumulate until budget exceeded
        included_entries = []
        total_tokens = 0

        # Always include constant entries first
        for entry in constant_entries:
            content = entry.get('content', '')
            tokens = self.estimate_tokens(content)
            total_tokens += tokens
            included_entries.append(entry)

        self.logger.log_step(f"Constant entries: {len(constant_entries)} entries, {total_tokens} tokens")

        # Add non-constant entries in priority order until budget exhausted
        for entry in non_constant_entries:
            content = entry.get('content', '')
            tokens = self.estimate_tokens(content)

            if total_tokens + tokens <= token_budget:
                total_tokens += tokens
                included_entries.append(entry)
            else:
                # Budget exceeded, stop adding entries
                discarded_count = len(non_constant_entries) - len([e for e in included_entries if not e.get('constant')])
                self.logger.log_step(f"Token budget ({token_budget}) exceeded. Discarded {discarded_count} low-priority entries")
                break

        self.logger.log_step(f"Token budget: {total_tokens}/{token_budget} tokens used, {len(included_entries)}/{len(entries)} entries included")

        return included_entries

    def _create_basic_prompt(self, character_data: Dict) -> str:
        """Create a basic prompt without lore.

        Legacy wrapper — delegates to build_memory() with no lore.
        """
        return self.build_memory(character_data)