# backend/api_handler.py
# Description: API handler for interacting with LLM API endpoints
import traceback
import requests # type: ignore
import httpx # Add httpx import
import json
import re
import certifi # For SSL certificate bundle
from typing import Dict, Optional, Tuple, Generator


class ThinkingTagFilter:
    """Streaming state machine that strips <think>...</think> and <thinking>...</thinking> tags.

    Two states: NORMAL and INSIDE_THINKING.
    Buffers partial tag prefixes to avoid false positives on characters like '<'.
    """

    OPEN_TAGS = ['<think>', '<thinking>']
    CLOSE_TAGS = ['</think>', '</thinking>']
    ALL_TAGS = OPEN_TAGS + CLOSE_TAGS
    MAX_TAG_LEN = max(len(t) for t in ALL_TAGS)  # 12 for '</thinking>'

    _STRIP_RE = re.compile(r'<think(?:ing)?>[\s\S]*?</think(?:ing)?>', re.DOTALL)

    def __init__(self):
        self._state = 'NORMAL'  # 'NORMAL' or 'INSIDE_THINKING'
        self._buffer = ''

    def _is_prefix_of_any_tag(self, text: str, tags: list) -> bool:
        """Check if text is a prefix of any tag in the list."""
        for tag in tags:
            if tag.startswith(text):
                return True
        return False

    def process(self, token: str) -> str:
        """Feed a token in, get filtered text out. May return empty string."""
        self._buffer += token
        output = ''

        while self._buffer:
            if self._state == 'NORMAL':
                # Look for potential open tag start
                tag_pos = self._buffer.find('<')
                if tag_pos == -1:
                    # No '<' at all — emit everything
                    output += self._buffer
                    self._buffer = ''
                else:
                    # Emit everything before the '<'
                    output += self._buffer[:tag_pos]
                    self._buffer = self._buffer[tag_pos:]

                    # Check if buffer matches a complete open tag
                    matched_tag = None
                    for tag in self.OPEN_TAGS:
                        if self._buffer.startswith(tag):
                            matched_tag = tag
                            break

                    if matched_tag:
                        # Transition to INSIDE_THINKING, consume the tag
                        self._buffer = self._buffer[len(matched_tag):]
                        self._state = 'INSIDE_THINKING'
                    elif self._is_prefix_of_any_tag(self._buffer, self.OPEN_TAGS):
                        # Could be a partial open tag — wait for more tokens
                        break
                    else:
                        # Not a tag prefix — emit the '<' and continue
                        output += self._buffer[0]
                        self._buffer = self._buffer[1:]

            else:  # INSIDE_THINKING
                # Look for potential close tag
                tag_pos = self._buffer.find('<')
                if tag_pos == -1:
                    # No '<' — swallow everything
                    self._buffer = ''
                else:
                    # Discard everything before the '<'
                    self._buffer = self._buffer[tag_pos:]

                    # Check if buffer matches a complete close tag
                    matched_tag = None
                    for tag in self.CLOSE_TAGS:
                        if self._buffer.startswith(tag):
                            matched_tag = tag
                            break

                    if matched_tag:
                        # Transition back to NORMAL, consume the close tag
                        self._buffer = self._buffer[len(matched_tag):]
                        self._state = 'NORMAL'
                    elif self._is_prefix_of_any_tag(self._buffer, self.CLOSE_TAGS):
                        # Could be a partial close tag — wait for more tokens
                        break
                    else:
                        # Not a close tag prefix — discard the '<' and continue swallowing
                        self._buffer = self._buffer[1:]

        return output

    def flush(self) -> str:
        """End-of-stream cleanup. Emit remaining buffer if NORMAL, discard if INSIDE_THINKING."""
        if self._state == 'NORMAL':
            result = self._buffer
            self._buffer = ''
            return result
        else:
            self._buffer = ''
            return ''

    @staticmethod
    def strip_thinking_tags(text: str) -> str:
        """One-shot regex strip for non-streaming path."""
        return ThinkingTagFilter._STRIP_RE.sub('', text).strip()


class ApiHandler:
    def __init__(self, logger):
        self.logger = logger

    def _apply_thinking_filter(self, chunk: bytes, thinking_filter: ThinkingTagFilter) -> Optional[bytes]:
        """Apply thinking tag filter to a streaming SSE chunk.

        Returns filtered chunk bytes, or None if the chunk should be swallowed entirely.
        """
        try:
            chunk_str = chunk.decode('utf-8')
        except UnicodeDecodeError:
            return chunk  # Pass through non-UTF-8 chunks unchanged

        # Process each SSE data line in the chunk
        lines = chunk_str.split('\n')
        output_lines = []

        for line in lines:
            if not line.startswith('data: '):
                output_lines.append(line)
                continue

            data_str = line[6:]  # Strip 'data: ' prefix

            # Pass through [DONE] and non-JSON data
            if data_str.strip() == '[DONE]':
                output_lines.append(line)
                continue

            try:
                data = json.loads(data_str)
            except (json.JSONDecodeError, ValueError):
                output_lines.append(line)
                continue

            # Pass through non-content data (errors, streaming signals, etc.)
            if 'streaming_start' in data or 'streaming_active' in data or 'error' in data:
                output_lines.append(line)
                continue

            # Extract text content from various provider formats
            text = None
            content_key = None

            if 'content' in data:
                text = data['content']
                content_key = 'content'
            elif 'token' in data:
                text = data['token']
                content_key = 'token'
            elif 'choices' in data:
                # OpenAI/OpenRouter streaming format
                choices = data.get('choices', [])
                if choices:
                    delta = choices[0].get('delta', {})
                    if 'content' in delta:
                        text = delta['content']
                        # We'll reconstruct this format after filtering

            if text is None:
                output_lines.append(line)
                continue

            # Apply the thinking filter
            filtered = thinking_filter.process(text)

            if not filtered:
                # Content was swallowed (inside thinking tags) — skip this data line
                continue

            # Reconstruct the JSON with filtered text
            if 'choices' in data and data.get('choices'):
                data['choices'][0]['delta']['content'] = filtered
            elif content_key:
                data[content_key] = filtered

            output_lines.append(f"data: {json.dumps(data)}")

        result = '\n'.join(output_lines)

        # If result is empty or only whitespace/newlines, swallow the chunk
        if not result.strip():
            return None

        return result.encode('utf-8')

    def test_connection(self, url: str, api_key: Optional[str] = None, provider: Optional[str] = None) -> Tuple[bool, Optional[str], Optional[Dict]]:
        """Test connection to LLM API endpoint and detect template."""
        try:
            # Ensure URL has protocol
            if not url.startswith(('http://', 'https://')):
                url = f'http://{url}'

            headers = {
                'Content-Type': 'application/json'
            }
            if api_key:
                headers['Authorization'] = f'Bearer {api_key}'

            if provider == 'Featherless':
                # Featherless AI specific test: GET /models
                # The URL from config is typically https://api.featherless.ai/v1
                test_url = url.rstrip('/') + '/models'
                self.logger.log_step(f"Testing Featherless AI connection to {test_url}")
                response = requests.get(
                    test_url,
                    headers=headers,
                    timeout=10
                )
                if response.status_code == 200:
                    try:
                        # Try to parse JSON to confirm it's a valid model list
                        response.json()
                        # For Featherless, we don't detect a template this way,
                        # model info can be extracted if needed, but for now, just success.
                        # We can return a dummy model_info or specific success indicator.
                        model_info_data = {"id": "featherless_models_ok", "name": "Featherless Models Accessible"}
                        return True, None, {"model_info": model_info_data}
                    except json.JSONDecodeError:
                        self.logger.log_warning("Featherless /models endpoint did not return valid JSON.")
                        return False, "Featherless /models endpoint did not return valid JSON.", None
                else:
                    error_msg = f"Featherless API returned status {response.status_code} for /models"
                    try:
                        error_data = response.json()
                        if isinstance(error_data, dict) and 'message' in error_data: # Featherless errors are often {"message": "..."}
                             error_msg = f"{error_msg}: {error_data['message']}"
                        elif isinstance(error_data, dict) and 'error' in error_data: # OpenAI style error
                             error_msg = f"{error_msg}: {error_data['error']}"
                    except:
                        pass
                    self.logger.log_warning(error_msg)
                    return False, error_msg, None
            else:
                # Generic provider test: POST /v1/chat/completions
                test_url = url.rstrip('/') + '/v1/chat/completions'
                # For KoboldCPP, the base URL might not have /v1, so ensure it's added if not OpenAI-like
                if provider == 'KoboldCPP' and not test_url.endswith('/v1/chat/completions'):
                     # This case should ideally be handled by provider-specific URL construction
                     # but this is a fallback. Kobold doesn't use /v1/chat/completions typically.
                     # The generic test might fail for Kobold if it expects /api/generate.
                     # For now, let the generic test proceed, it might work for some Kobold setups.
                     # A better Kobold test would be to hit /api/v1/model
                     pass


                self.logger.log_step(f"Testing generic connection to {test_url}")
                test_data = {
                    "messages": [
                        {"role": "user", "content": "Hi"}
                    ],
                    "max_tokens": 10,
                    "temperature": 0.7
                }
                if provider == 'Claude': # Claude uses a different payload structure
                    test_data = {
                        "prompt": "Human: Hi\n\nAssistant:",
                        "max_tokens_to_sample": 10,
                        "temperature": 0.7,
                        "model": "claude-instant-1" # A default model for testing
                    }
                    # Claude endpoint is often just /v1/complete or /v1/messages, not /v1/chat/completions
                    # The URL from config should be the full path.
                    # For Claude, the test_url should be just `url.rstrip('/')` if it's the full messages endpoint.
                    # This generic test might need more provider-specific paths.
                    # Let's assume `url` is the correct full endpoint for Claude for now.
                    test_url = url.rstrip('/')


                response = requests.post(
                    test_url,
                    headers=headers,
                    json=test_data,
                    timeout=10
                )
                
                if response.status_code == 200:
                    try:
                        response_data = response.json()
                        # Extract model info if available (e.g., from OpenAI response headers or body)
                        # This part is highly provider-dependent.
                        # For now, we focus on connectivity and basic response.
                        # The 'template' detection is also very basic.
                        model_info_data = None
                        if provider == 'OpenAI' or provider == 'OpenRouter':
                             model_name = response_data.get('model')
                             if model_name:
                                 model_info_data = {"id": model_name, "name": model_name}
                        
                        # Simplified template detection or pass-through
                        # The old _detect_template was very basic.
                        # For now, we'll just return success.
                        # A more robust solution would involve provider-specific template logic.
                        return True, None, {"model_info": model_info_data} # Returning model_info in the third slot
                    except Exception as e:
                        self.logger.log_error(f"Response parsing failed: {str(e)}")
                        return True, None, None # Connected, but couldn't parse/get details
                else:
                    error_msg = f"API returned status {response.status_code}"
                    try:
                        error_data = response.json()
                        if isinstance(error_data, dict) and 'error' in error_data:
                             # OpenAI, OpenRouter style
                            if isinstance(error_data['error'], dict) and 'message' in error_data['error']:
                                error_msg = f"{error_msg}: {error_data['error']['message']}"
                            else:
                                error_msg = f"{error_msg}: {error_data['error']}"
                        elif isinstance(error_data, dict) and 'message' in error_data:
                            # Claude, Featherless style
                            error_msg = f"{error_msg}: {error_data['message']}"
                    except:
                        pass
                    self.logger.log_warning(error_msg)
                    return False, error_msg, None
                    
        except requests.exceptions.ConnectionError:
            error = "Could not connect to server"
            self.logger.log_warning(error)
            return False, error, None
            
        except requests.exceptions.Timeout:
            error = "Connection timed out"
            self.logger.log_warning(error)
            return False, error, None
                
        except Exception as e:
            error = f"Unexpected error: {str(e)}"
            self.logger.log_error(error)
            return False, error, None
    
    def _detect_template(self, response_text: str) -> Optional[Dict]:
        """Simple template detection from response text."""
        try:
            if '<|im_start|>' in response_text or '<|im_end|>' in response_text:
                return {'name': 'ChatML', 'id': 'chatml'}
            elif '[/INST]' in response_text:
                return {'name': 'Mistral', 'id': 'mistral'}
            elif '</s>' in response_text:
                return {'name': 'Mistral', 'id': 'mistral'}
            else:
                return None
        except Exception as e:
            self.logger.log_error(f"Template detection error: {str(e)}")
            return None
        
    def wake_api(self, url: str, api_key: Optional[str] = None) -> Tuple[bool, Optional[str]]:
        """Light-weight check to wake up API if sleeping."""
        try:
            if not url.startswith(('http://', 'https://')):
                url = f'http://{url}'
            url = url.rstrip('/') + '/v1/chat/completions'
            
            headers = {
                'Content-Type': 'application/json'
            }
            if api_key:
                headers['Authorization'] = f'Bearer {api_key}'
            
            wake_data = {
                "messages": [
                    {"role": "user", "content": "Hi"}
                ],
                "max_tokens": 1,
                "temperature": 0.1
            }
            
            self.logger.log_step("Sending wake request...")
            response = requests.post(
                url,
                headers=headers,
                json=wake_data,
                timeout=5
            )
            
            if response.status_code == 200:
                self.logger.log_step("API wake successful")
                return True, None
            else:
                error_msg = f"API returned status {response.status_code}"
                try:
                    error_data = response.json()
                    if 'error' in error_data:
                        error_msg = f"{error_msg}: {error_data['error']}"
                except:
                    pass
                self.logger.log_warning(error_msg)
                return False, error_msg
                
        except requests.exceptions.Timeout:
            error = "Wake attempt timed out"
            self.logger.log_warning(error)
            return False, error
            
        except Exception as e:
            error = f"Wake attempt failed: {str(e)}"
            self.logger.log_error(error)
            return False, error

    # This function is removed as we want to pass through API responses unmodified
    # The templates and stop sequences should handle this instead
    # def clean_response_text(self, text: str) -> str:
    #    """Clean response text from artifacts and special characters."""
    #    # Remove any non-ascii characters at the end (like "ρκε" in the example)
    #    text = re.sub(r'[^\x00-\x7F]+$', '', text)
    #
    #    # Remove any trailing special tokens like </s>
    #    text = re.sub(r'</s>$', '', text)
    #
    #    # Trim whitespace
    #    text = text.strip()
    #
    #    return text

    async def generate_with_config(self, api_config: Dict, generation_params: Dict) -> Dict:
        """Generate a response from the API without streaming."""
        try:
            from backend.api_provider_adapters import get_provider_adapter
            
            provider = api_config.get('provider', 'KoboldCPP')
            url = api_config.get('url')
            api_key = api_config.get('apiKey')
            generation_settings = api_config.get('generation_settings', {})
            
            if not url:
                raise ValueError("API URL is missing in api_config")
                
            prompt = generation_params.get('prompt')
            memory = generation_params.get('memory')
            stop_sequence = generation_params.get('stop_sequence', [])
            
            if not prompt:
                raise ValueError("Prompt is missing in generation_params")
                
            # Use requests directly for non-streaming request
            adapter = get_provider_adapter(provider, self.logger)
            # Construct the non-streaming endpoint directly for KoboldCPP
            # Assuming '/api/extra/generate' is the correct non-streaming endpoint
            # The adapter might incorrectly return the streaming URL here.
            # Use the standard KoboldCPP non-streaming endpoint
            endpoint = url.rstrip('/') + '/api/generate'
            headers = adapter.prepare_headers(api_key)
            # --- Construct payload specifically for non-streaming ---
            if provider == 'KoboldCPP':
                 # For KoboldCPP non-streaming, build a specific payload.
                 # Filter generation_settings to known valid non-streaming params.
                 self.logger.log_step("Constructing specific payload for KoboldCPP non-streaming")
                 known_params = [
                     'n', 'max_context_length', 'max_length', 'rep_pen', 'temperature',
                     'top_p', 'top_k', 'top_a', 'typical', 'tfs', 'rep_pen_range',
                     'rep_pen_slope', 'sampler_order', 'min_p', 'dynatemp_range',
                     'dynatemp_exponent', 'smoothing_factor', 'presence_penalty', 'frequency_penalty', 'logit_bias',
                     'use_default_badwordsids', 'mirostat', 'mirostat_tau', 'mirostat_eta' # Add other known params
                 ]
                 relevant_settings = {k: v for k, v in generation_settings.items() if k in known_params}

                 data = {
                     **relevant_settings,
                     "prompt": prompt, # Prompt already contains memory context
                     "stop_sequence": stop_sequence,
                     "stream": False, # Explicitly false
                     "quiet": True,
                     "trim_stop": True
                     # DO NOT include the explicit "memory" field here for non-streaming
                 }
                 self.logger.log_step(f"KoboldCPP non-streaming payload keys: {list(data.keys())}")
            else:
                 # For other providers, use the adapter's preparation but ensure stream=False
                 data = adapter.prepare_request_data(prompt, memory, stop_sequence, generation_settings)
                 data['stream'] = False # Ensure stream is explicitly false

            # --- End payload construction ---
            self.logger.log_step(f"Making non-streaming request to {endpoint}")
            
            async with httpx.AsyncClient(verify=certifi.where()) as client:
                response = await client.post(endpoint, headers=headers, json=data, timeout=30)
            
            if response.status_code != 200:
                raise ValueError(f"API returned error {response.status_code}: {response.text}")
                
            # Log the raw response text for debugging
            raw_response_text = response.text
            self.logger.log_step(f"Raw response text from non-streaming endpoint: {raw_response_text[:500]}...") # Log first 500 chars
            
            result = response.json()
            
            # Extract content based on provider
            content = ""
            if provider == 'KoboldCPP':
                # Correctly extract text from KoboldCPP non-streaming response
                # Extract text from the 'response' key for KoboldCPP /api/generate
                content = result.get('response', '')
            elif provider in ['OpenAI', 'OpenRouter', 'Ollama']:
                content = result.get('choices', [{}])[0].get('message', {}).get('content', '')
            elif provider == 'Claude':
                content = result.get('content', [{}])[0].get('text', '')
            else:
                # Generic fallback
                content = str(result)

            # Strip thinking tags from non-streaming responses
            content = ThinkingTagFilter.strip_thinking_tags(content)

            return {
                'content': content,
                'provider': provider,
                'model': result.get('model', api_config.get('model', 'unknown'))
            }
            
        except Exception as e:
            self.logger.log_error(f"Error in generate_with_config: {str(e)}")
            self.logger.log_error(traceback.format_exc())
            return {'error': str(e)}

    def stream_generate(self, request_data: Dict) -> Generator[bytes, None, None]:
        """Stream generate tokens from the API."""
        try:
            self.logger.log_step("Backend: Entered api_handler.stream_generate")
            from backend.api_provider_adapters import get_provider_adapter
            
            # Extract API config and generation params from the request
            api_config = request_data.get('api_config', {})
            generation_params = request_data.get('generation_params', {})

            # Extract from API config
            url = api_config.get('url')
            api_key = api_config.get('apiKey')
            provider = api_config.get('provider', 'KoboldCPP')
            templateId = api_config.get('templateId')  # Use templateId, not template
            template_format = api_config.get('template_format')  # Get template format information
            original_generation_settings = api_config.get('generation_settings', {})
 
            # Prepare generation settings for the adapter
            current_generation_settings = original_generation_settings.copy()
            if provider in ('Featherless', 'Ollama'):
                self.logger.log_step(f"Preparing {provider}-specific generation settings.")
                model_name_from_config = api_config.get('model')
                if model_name_from_config:
                    if 'model' not in current_generation_settings:
                        current_generation_settings['model'] = model_name_from_config
                        self.logger.log_step(f"Added 'model': {model_name_from_config} to generation_settings for {provider} from api_config.")
                    elif current_generation_settings.get('model') != model_name_from_config:
                        self.logger.log_warning(
                            f"Model in api_config ('{model_name_from_config}') differs from model in generation_settings "
                            f"('{current_generation_settings.get('model')}'). Using model from generation_settings."
                        )
                    else:
                        self.logger.log_step(f"Model '{model_name_from_config}' already present in generation_settings for {provider}.")
                else:
                    self.logger.log_warning(f"No 'model' found in api_config for {provider} provider.")

            # Auto-scale token budget for reasoning models
            if current_generation_settings.get('reasoning_model'):
                current_max = current_generation_settings.get('max_length', 220)
                REASONING_MIN_LENGTH = 4096
                if current_max < REASONING_MIN_LENGTH:
                    self.logger.log_step(f"Reasoning model: scaling max_length {current_max} → {REASONING_MIN_LENGTH}")
                    current_generation_settings['max_length'] = REASONING_MIN_LENGTH

            # Log what we're using
            self.logger.log_step(f"Using API URL: {url}")
            self.logger.log_step(f"Using templateId: {templateId}")
            if template_format:
                self.logger.log_step(f"Using template: {template_format.get('name', 'Unknown')}")
                self.logger.log_step(f"Template format: {template_format}")

            # Extract basic required parameters
            prompt = generation_params.get('prompt')
            # Backend owns memory building — ignore frontend memory field
            memory = ''
            excluded_fields = generation_params.get('excluded_fields', [])
            user_name = generation_params.get('user_name', 'User') or 'User'

            # Use provider-appropriate default stop sequences
            from backend.kobold_prompt_builder import is_kobold_provider
            is_kobold = is_kobold_provider(api_config)

            if is_kobold:
                stop_sequence = generation_params.get('stop_sequence', [
                    "User:",
                    "Assistant:"
                ])
            else:
                stop_sequence = generation_params.get('stop_sequence', [
                    "<|im_end|>\n<|im_start|>user",
                    "<|im_end|>\n<|im_start|>assistant",
                    "</s>",
                    "User:",
                    "Assistant:"
                ])
            quiet = generation_params.get('quiet', True)

            # system_instruction is prepended to memory AFTER build_memory() runs
            # For KoboldCPP: handled via fold_system_instruction in the kobold path
            system_instruction = generation_params.get('system_instruction')

            # Process lore if character data is available
            character_data = generation_params.get('character_data')
            chat_history = generation_params.get('chat_history', [])
            current_message = generation_params.get('current_message', '')
            
            # Extract current message from chat_history if not provided explicitly
            # The last message in chat_history should be the user's current message
            if not current_message and chat_history:
                last_message = chat_history[-1]
                if last_message.get('role') == 'user':
                    current_message = last_message.get('content', '')
                    self.logger.log_step(f"Extracted current message from chat_history: {current_message[:100]}...")
                else:
                    self.logger.log_step("Last message in chat_history is not from user, no current_message extracted")
            
            # Add lore matching to context window if it exists
            context_window = generation_params.get('context_window')

            # Lore matching + unified memory building
            matched_entries = []
            active_sticky_entries = []
            token_budget = 0

            if character_data and character_data.get('data') and character_data.get('data', {}).get('character_uuid'):
                try:
                    from backend.lore_handler import LoreHandler

                    lore_handler = LoreHandler(self.logger)
                    character_uuid = character_data.get('data', {}).get('character_uuid')

                    if character_uuid:
                        self.logger.log_step(f"Loading lore for character UUID: {character_uuid}")

                        try:
                            from backend.database import SessionLocal
                            from backend.sql_models import Character as CharacterModel, LoreBook as LoreBookModel, LoreEntry as LoreEntryModel
                            import json

                            db = SessionLocal()
                            try:
                                character_db = db.query(CharacterModel).filter(
                                    CharacterModel.character_uuid == character_uuid
                                ).first()

                                if character_db and character_db.lore_books:
                                    lore_book = character_db.lore_books[0]
                                    lore_entries = []

                                    for db_entry in lore_book.entries:
                                        if db_entry.enabled:
                                            extensions = {}
                                            if db_entry.extensions_json:
                                                try:
                                                    extensions = json.loads(db_entry.extensions_json) if isinstance(db_entry.extensions_json, str) else db_entry.extensions_json
                                                except:
                                                    extensions = {}

                                            entry_dict = {
                                                'id': db_entry.id,
                                                'content': db_entry.content,
                                                'keys': json.loads(db_entry.keys_json) if db_entry.keys_json else [],
                                                'secondary_keys': json.loads(db_entry.secondary_keys_json) if db_entry.secondary_keys_json else [],
                                                'enabled': db_entry.enabled,
                                                'position': db_entry.position,
                                                'insertion_order': db_entry.insertion_order,
                                                'case_sensitive': extensions.get('case_sensitive', False),
                                                'use_regex': False,
                                                'name': db_entry.comment or '',
                                                'has_image': bool(db_entry.image_uuid),
                                                'image_uuid': db_entry.image_uuid or '',
                                                'priority': extensions.get('priority', 100),
                                                'constant': extensions.get('constant', False),
                                                'selective': db_entry.selective,
                                                'extensions': {
                                                    'match_whole_words': extensions.get('match_whole_words', True),
                                                    'sticky': extensions.get('sticky', 2),
                                                    'cooldown': extensions.get('cooldown', 0),
                                                    'delay': extensions.get('delay', 0),
                                                    'scan_depth': extensions.get('scan_depth', None),
                                                }
                                            }
                                            lore_entries.append(entry_dict)

                                    if lore_entries:
                                        self.logger.log_step(f"Loaded {len(lore_entries)} lore entries from database")

                                        chat_session_uuid = generation_params.get('chat_session_uuid')
                                        activation_tracker = None

                                        if chat_session_uuid:
                                            try:
                                                from backend.services.lore_activation_tracker import LoreActivationTracker
                                                activation_tracker = LoreActivationTracker(db, chat_session_uuid)

                                                active_lore_ids = activation_tracker.get_active_lore_entry_ids()
                                                if active_lore_ids:
                                                    active_sticky_entries = [e for e in lore_entries if e.get('id') in active_lore_ids]
                                                    self.logger.log_step(f"Found {len(active_sticky_entries)} active sticky lore entries")
                                            except Exception as tracker_error:
                                                self.logger.log_warning(f"Could not initialize lore activation tracker: {tracker_error}")

                                        character_book_data = character_data.get('data', {}).get('character_book', {})
                                        scan_depth = character_book_data.get('scan_depth', 3)

                                        matched_entries = lore_handler.match_lore_entries(
                                            lore_entries=lore_entries,
                                            chat_messages=chat_history,
                                            scan_depth=scan_depth
                                        )

                                        if matched_entries and activation_tracker:
                                            message_number = len(chat_history)
                                            for entry in matched_entries:
                                                entry_id = entry.get('id')
                                                if entry_id and not activation_tracker.is_in_cooldown(entry_id):
                                                    sticky = entry.get('extensions', {}).get('sticky', 2)
                                                    cooldown = entry.get('extensions', {}).get('cooldown', 0)
                                                    delay = entry.get('extensions', {}).get('delay', 0)
                                                    activation_tracker.activate(
                                                        lore_entry_id=entry_id,
                                                        character_uuid=character_uuid,
                                                        message_number=message_number,
                                                        sticky=sticky,
                                                        cooldown=cooldown,
                                                        delay=delay
                                                    )

                                        token_budget = character_book_data.get('token_budget', 0)

                                        # Note lore info in context window
                                        if (matched_entries or active_sticky_entries) and context_window is not None and isinstance(context_window, dict):
                                            total_active = len(set([e.get('id') for e in matched_entries + active_sticky_entries if e.get('id')]))
                                            context_window['lore_info'] = {
                                                'matched_count': len(matched_entries),
                                                'sticky_count': len(active_sticky_entries),
                                                'total_count': total_active,
                                                'entry_keys': [entry.get('keys', [''])[0] for entry in matched_entries if entry.get('keys')]
                                            }
                                    else:
                                        self.logger.log_step("No enabled lore entries found for character")
                                else:
                                    self.logger.log_step("Character not found in database or has no lore book")
                            finally:
                                db.close()
                        except Exception as db_error:
                            self.logger.log_error(f"Error loading lore from database: {str(db_error)}")
                    else:
                        self.logger.log_step("No character UUID provided, skipping lore matching")
                except Exception as e:
                    self.logger.log_error(f"Error processing lore: {str(e)}")

            # Backend always builds memory from character_data (single source of truth)
            if character_data and character_data.get('data'):
                from backend.lore_handler import LoreHandler
                lore_handler = LoreHandler(self.logger)
                char_name = character_data['data'].get('name', 'Character')
                memory = lore_handler.build_memory(
                    character_data,
                    excluded_fields=excluded_fields,
                    char_name=char_name,
                    user_name=user_name,
                    lore_entries=matched_entries,
                    active_sticky_entries=active_sticky_entries,
                    token_budget=token_budget
                )
                self.logger.log_step(f"Built memory from character_data ({len(memory)} chars, {len(matched_entries)} matched lore, {len(active_sticky_entries)} sticky, {len(excluded_fields)} excluded fields)")

            # Inject user persona block at end of memory (after character identity, before system_instruction)
            user_persona = generation_params.get('user_persona', '')
            if user_persona and user_persona.strip():
                persona_block = f"\n\n[About {user_name}]\n{user_persona.strip()}\n[End About {user_name}]"
                memory = (memory or '') + persona_block
                self.logger.log_step(f"Injected user persona for '{user_name}' ({len(user_persona.strip())} chars)")

            # Prepend system_instruction to memory for non-KoboldCPP providers
            # (KoboldCPP uses fold_system_instruction in its own path below)
            if system_instruction and not is_kobold:
                self.logger.log_step(f"Prepending system_instruction to memory ({len(system_instruction)} chars)")
                if memory:
                    memory = f"{system_instruction}\n\n{memory}"
                else:
                    memory = system_instruction

            # KoboldCPP story-mode rebuild: fold system instruction,
            # rebuild prompt from raw chat_history, set clean stop sequences
            if is_kobold:
                from backend.kobold_prompt_builder import (
                    fold_system_instruction, build_story_prompt,
                    build_story_stop_sequences, extract_block
                )

                char_data = character_data.get('data', {}) if character_data else {}
                char_name = char_data.get('name', 'Character')

                # build_memory() already resolved {{user}}/{{char}} and skips empty fields,
                # so clean_memory() and token resolution are no longer needed here.

                # Fold system_instruction into memory as narrative framing
                if system_instruction:
                    memory = fold_system_instruction(system_instruction, memory)

                # Append *** separator between memory and prompt
                if memory and not memory.rstrip().endswith('***'):
                    memory = memory.rstrip() + '\n***'

                # Rebuild prompt from chat_history (main chat flow)
                raw_history = generation_params.get('chat_history', [])
                if raw_history:
                    original_prompt = prompt or ''
                    session_notes = extract_block(original_prompt, '[Session Notes]', '[End Session Notes]')
                    compressed = extract_block(original_prompt, '[Previous Events Summary]', '[End Summary')
                    continuation_text = generation_params.get('continuation_text', '')

                    prompt = ''
                    if compressed:
                        prompt += compressed + '\n\n'
                    if session_notes:
                        prompt += f'[Session Notes]\n{session_notes}\n[End Session Notes]\n\n'
                    prompt += build_story_prompt(raw_history, char_name, user_name, continuation_text)

                # Set clean stop sequences
                stop_sequence = build_story_stop_sequences(char_name, user_name)

                # ── Context Budget Debugger ──────────────────────────────────
                # Estimate tokens (~4 chars per token) and log per-field breakdown
                def _est_tokens(text: str) -> int:
                    return len(text) // 4 if text else 0

                ctx_max = original_generation_settings.get('max_context_length', 8192)
                ctx_memory_tok = _est_tokens(memory)
                ctx_compressed_tok = _est_tokens(compressed) if raw_history and compressed else 0
                ctx_notes_tok = _est_tokens(session_notes) if raw_history and session_notes else 0
                ctx_history_tok = _est_tokens(build_story_prompt(raw_history, char_name, user_name)) if raw_history else _est_tokens(prompt)
                ctx_total_tok = ctx_memory_tok + ctx_compressed_tok + ctx_notes_tok + ctx_history_tok

                self.logger.log_step(
                    f"KoboldCPP Context Budget (est. tokens, ~4 chars/token):\n"
                    f"  Memory (card+lore+sys): {ctx_memory_tok:>6} tokens  ({len(memory or ''):>8} chars)\n"
                    f"  Compressed summary:     {ctx_compressed_tok:>6} tokens\n"
                    f"  Session notes:          {ctx_notes_tok:>6} tokens\n"
                    f"  Chat history:           {ctx_history_tok:>6} tokens  ({len(raw_history) if raw_history else 0} messages)\n"
                    f"  ─────────────────────────────────\n"
                    f"  TOTAL:                  {ctx_total_tok:>6} tokens  /  {ctx_max} limit  "
                    f"({ctx_total_tok * 100 // ctx_max}% used)"
                )
                if ctx_total_tok > ctx_max:
                    self.logger.log_warning(
                        f"CONTEXT OVERFLOW: Sending ~{ctx_total_tok} tokens but limit is {ctx_max}. "
                        f"KoboldCPP will silently truncate from the front, losing character card and system context. "
                        f"Overflow: ~{ctx_total_tok - ctx_max} tokens over budget."
                    )
                elif ctx_total_tok > ctx_max * 0.85:
                    self.logger.log_warning(
                        f"CONTEXT WARNING: Using {ctx_total_tok * 100 // ctx_max}% of context budget "
                        f"({ctx_total_tok}/{ctx_max}). Approaching overflow."
                    )
                # ── End Context Budget Debugger ──────────────────────────────

                self.logger.log_step(f"KoboldCPP story-mode rebuild complete. Memory: {len(memory)} chars, Prompt: {len(prompt) if prompt else 0} chars")
                self.logger.log_step(f"KoboldCPP stop_sequence: {stop_sequence}")

            # Add </s> to stop sequences if not already present (skip for KoboldCPP)
            if not is_kobold and "</s>" not in stop_sequence:
                stop_sequence.append("</s>")
            
            # Save context window for debugging if provided
            if context_window:
                self.logger.log_step("Saving context window for debugging")
                try:
                    # Get base directory
                    import sys
                    import os
                    from pathlib import Path
                    
                    base_dir = Path(sys._MEIPASS) if getattr(sys, 'frozen', False) else Path.cwd()
                    self.logger.log_info(f"Context saving: base_dir = {str(base_dir)}")
                    
                    # Create context directory if it doesn't exist
                    context_dir = base_dir / 'context'
                    self.logger.log_info(f"Context saving: context_dir = {str(context_dir)}")
                    
                    self.logger.log_step(f"Attempting to create directory: {str(context_dir)}")
                    context_dir.mkdir(parents=True, exist_ok=True)
                    self.logger.log_step(f"Successfully created or ensured directory exists: {str(context_dir)}")
                    
                    # Context file path
                    context_file = context_dir / 'latest_context.json'
                    self.logger.log_info(f"Context saving: context_file = {str(context_file)}")
                    
                    # Write the context data
                    self.logger.log_step(f"Attempting to open and write to: {str(context_file)}")
                    with open(context_file, 'w', encoding='utf-8') as f:
                        json.dump(context_window, f, indent=2)
                    self.logger.log_step(f"Successfully wrote to: {str(context_file)}")

                except Exception as e:
                    self.logger.log_error(f"Error saving context window: {str(e)}")
                    self.logger.log_error(traceback.format_exc()) # Add full traceback for context saving error
            # Validate required fields
            if not url:
                raise ValueError("API URL is missing in api_config")
            if not prompt:
                raise ValueError("Prompt is missing in generation_params")

            # Get the appropriate adapter for this provider
            adapter = get_provider_adapter(provider, self.logger)
            self.logger.log_step(f"Using adapter for provider: {provider}")

            # Use the adapter to stream the response
            self.logger.log_step("Request data prepared with generation settings")
            self.logger.log_step(f"Prompt length: {len(prompt) if prompt else 0} chars")
            self.logger.log_step(f"Memory length: {len(memory) if memory else 0} chars")
            self.logger.log_step(f"Current message: {current_message[:100] if current_message else 'None'}...")
            self.logger.log_step(f"Chat history length: {len(chat_history)} messages")
            self.logger.log_step(f"Using provider: {provider}")
            
            # Log the actual prompt being sent for debugging
            if prompt:
                self.logger.log_step(f"Prompt preview (first 200 chars): {prompt[:200]}...")
                self.logger.log_step(f"Prompt preview (last 200 chars): ...{prompt[-200:]}")
            
            # OpenRouter-specific streaming handling
            if provider == "OpenRouter":
                self.logger.log_step("Using OpenRouter-specific streaming handling")
                # Send special start message for OpenRouter to initiate streaming properly
                yield f"data: {json.dumps({'content': '', 'streaming_start': True})}\n\n".encode('utf-8')
            elif provider == "Featherless": # Add similar handling for Featherless
                self.logger.log_step("Using Featherless-specific streaming start handling")
                yield f"data: {json.dumps({'content': '', 'streaming_start': True})}\n\n".encode('utf-8')
            
            # ── LogitShaper: inject word-level bans for KoboldCPP ────────
            logit_shaper = None
            chat_session_uuid = generation_params.get('chat_session_uuid')
            if is_kobold and chat_session_uuid:
                try:
                    from backend.logit_shaper import get_or_create_shaper
                    logit_shaper = get_or_create_shaper(chat_session_uuid)
                    shaper_bans = logit_shaper.get_banned_tokens()
                    if shaper_bans:
                        existing_bans = current_generation_settings.get('banned_tokens', [])
                        merged = list(set(existing_bans + shaper_bans))
                        current_generation_settings['banned_tokens'] = merged
                        self.logger.log_step(f"LogitShaper: injected {len(shaper_bans)} bans → {shaper_bans}")
                except Exception as shaper_err:
                    self.logger.log_warning(f"LogitShaper pre-gen error: {shaper_err}")
            # ── End LogitShaper pre-gen ───────────────────────────────────

            # Use our adapter system to handle the stream generation
            self.logger.log_step(f"Attempting to call adapter.stream_generate for {provider}...")
            adapter_generator = adapter.stream_generate(
                url,
                api_key,
                prompt,
                memory,
                stop_sequence,
                current_generation_settings # Use the potentially modified settings
            )
            self.logger.log_step(f"Adapter call returned generator: {type(adapter_generator)}")

            # Explicitly iterate over the adapter's generator and yield chunks
            self.logger.log_step("Iterating over adapter generator in api_handler...")
            chunk_count = 0
            has_yielded_content = False
            thinking_filter = ThinkingTagFilter()
            response_text_parts = []  # LogitShaper: accumulate full response text

            for chunk in adapter_generator:
                chunk_count += 1

                # For OpenRouter, handle empty chunks and role-only chunks specially
                if provider == "OpenRouter" and b'{"content":""}' in chunk:
                    # OpenRouter is sending a role-only chunk, ensure streaming continues
                    self.logger.log_step("Processing OpenRouter empty content chunk")
                    if not has_yielded_content:
                        # This is to ensure the frontend knows we're actively streaming
                        yield f"data: {json.dumps({'content': '', 'streaming_active': True})}\n\n".encode('utf-8')
                        has_yielded_content = True
                else:
                    # Apply thinking tag filter to content chunks
                    filtered_chunk = self._apply_thinking_filter(chunk, thinking_filter)
                    if filtered_chunk is not None:
                        if chunk_count % 50 == 0:  # Log every 50 chunks
                            self.logger.log_step(f"Yielding chunk {chunk_count} from adapter generator...")
                        # LogitShaper: extract text content from SSE chunk for post-stream analysis
                        if logit_shaper is not None:
                            try:
                                chunk_str = filtered_chunk.decode('utf-8') if isinstance(filtered_chunk, bytes) else filtered_chunk
                                for sse_line in chunk_str.split('\n'):
                                    if sse_line.startswith('data: '):
                                        sse_data = sse_line[6:]
                                        if sse_data.strip() and sse_data.strip() != '[DONE]':
                                            try:
                                                parsed = json.loads(sse_data)
                                                text_fragment = parsed.get('content') or parsed.get('token') or ''
                                                if text_fragment:
                                                    response_text_parts.append(text_fragment)
                                            except (json.JSONDecodeError, ValueError):
                                                pass
                            except Exception:
                                pass  # Never interfere with streaming
                        yield filtered_chunk
                        has_yielded_content = True

            # Flush any remaining buffered content from the thinking filter
            flush_text = thinking_filter.flush()
            if flush_text:
                yield f"data: {json.dumps({'content': flush_text})}\n\n".encode('utf-8')

            self.logger.log_step(f"Finished iterating adapter generator. Total chunks yielded: {chunk_count}")

            # ── LogitShaper: analyze completed response ──────────────────
            if logit_shaper is not None and response_text_parts:
                try:
                    full_response = ''.join(response_text_parts)
                    gen_type = generation_params.get('generation_type', 'generate')
                    is_regen = gen_type in ('regenerate', 'continue')
                    logit_shaper.analyze_output(full_response, is_regeneration=is_regen)
                    active_bans = logit_shaper.get_banned_tokens()
                    self.logger.log_step(
                        f"LogitShaper: analyzed {len(full_response)} chars (type={gen_type}), "
                        f"turn={logit_shaper.current_turn_number}, "
                        f"active_bans={active_bans if active_bans else '(none)'}"
                    )
                except Exception as shaper_err:
                    self.logger.log_warning(f"LogitShaper post-gen error: {shaper_err}")
            # ── End LogitShaper post-gen ──────────────────────────────────

            # No explicit return needed here as yielding handles the generator response
            
        except ValueError as ve:
            error_msg = str(ve)
            self.logger.log_error(error_msg)
            yield f"data: {json.dumps({'error': {'type': 'ValueError', 'message': error_msg}})}\n\n".encode('utf-8')
        except requests.exceptions.RequestException as e:
            # Special handling for connection errors
            error_msg = f"Connection error: {str(e)}"
            self.logger.log_error(error_msg)
            
            # Add provider info to help frontend identify API that failed
            error_data = {
                'error': {
                    'type': 'ConnectionError',
                    'message': error_msg,
                    'provider': provider
                }
            }
            yield f"data: {json.dumps(error_data)}\n\n".encode('utf-8')
            
            # Add provider info to help frontend identify API that failed
            error_data = {
                'error': {
                    'type': 'ConnectionError',
                    'message': error_msg,
                    'provider': provider
                }
            }
            yield f"data: {json.dumps(error_data)}\n\n".encode('utf-8')
            
        except Exception as e:
            error_msg = f"Stream generation failed: {str(e)}"
            self.logger.log_error(error_msg)
            self.logger.log_error(traceback.format_exc())
            yield f"data: {json.dumps({'error': {'type': 'ServerError', 'message': error_msg}})}\n\n".encode('utf-8')
