# backend/api_handler.py
# Description: API handler for interacting with LLM API endpoints
import traceback
import requests # type: ignore
import httpx # Add httpx import
import json
import re
import certifi # For SSL certificate bundle
from typing import Dict, Optional, Tuple, Generator

class ApiHandler:
    def __init__(self, logger):
        self.logger = logger

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
                     'dynatemp_exponent', 'smoothing_factor', 'presence_penalty', 'logit_bias',
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
            elif provider in ['OpenAI', 'OpenRouter']:
                content = result.get('choices', [{}])[0].get('message', {}).get('content', '')
            elif provider == 'Claude':
                content = result.get('content', [{}])[0].get('text', '')
            else:
                # Generic fallback
                content = str(result)
                
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
            if provider == 'Featherless':
                self.logger.log_step("Preparing Featherless-specific generation settings.")
                model_name_from_config = api_config.get('model')
                if model_name_from_config:
                    if 'model' not in current_generation_settings:
                        current_generation_settings['model'] = model_name_from_config
                        self.logger.log_step(f"Added 'model': {model_name_from_config} to generation_settings for Featherless from api_config.")
                    elif current_generation_settings.get('model') != model_name_from_config:
                        self.logger.log_warning(
                            f"Model in api_config ('{model_name_from_config}') differs from model in generation_settings "
                            f"('{current_generation_settings.get('model')}'). Using model from generation_settings."
                        )
                    else:
                        self.logger.log_step(f"Model '{model_name_from_config}' already present in generation_settings for Featherless.")
                else:
                    self.logger.log_warning("No 'model' found in api_config for Featherless provider.")
            
            # Log what we're using
            self.logger.log_step(f"Using API URL: {url}")
            self.logger.log_step(f"Using templateId: {templateId}")
            if template_format:
                self.logger.log_step(f"Using template: {template_format.get('name', 'Unknown')}")
                self.logger.log_step(f"Template format: {template_format}")

            # Extract basic required parameters
            prompt = generation_params.get('prompt')
            memory = generation_params.get('memory')
            stop_sequence = generation_params.get('stop_sequence', [
                "<|im_end|>\n<|im_start|>user",
                "<|im_end|>\n<|im_start|>assistant",
                "</s>",
                "User:",
                "Assistant:"
            ])
            quiet = generation_params.get('quiet', True)
            
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
              # Handle lore matching if character data is available
            if character_data and character_data.get('data') and character_data.get('data', {}).get('character_uuid'):
                try:
                    from backend.lore_handler import LoreHandler
                    from backend.services.character_service import CharacterService
                    from backend.dependencies import get_db
                    
                    lore_handler = LoreHandler(self.logger)
                    
                    # Get character UUID from the minimal character data
                    character_uuid = character_data.get('data', {}).get('character_uuid')
                    
                    if character_uuid:
                        self.logger.log_step(f"Loading lore for character UUID: {character_uuid}")
                        
                        # Load character with lore from database instead of using payload data
                        # We'll create a minimal DB session for this lookup
                        try:
                            # Import required database components
                            from backend.database import SessionLocal
                            from backend.sql_models import Character as CharacterModel, LoreBook as LoreBookModel, LoreEntry as LoreEntryModel
                            import json
                            
                            db = SessionLocal()
                            try:
                                # Query character with lore book
                                character_db = db.query(CharacterModel).filter(
                                    CharacterModel.character_uuid == character_uuid
                                ).first()
                                
                                if character_db and character_db.lore_books:
                                    lore_book = character_db.lore_books[0]  # Assuming one lore book per character
                                    lore_entries = []
                                    
                                    for db_entry in lore_book.entries:
                                        if db_entry.enabled:  # Only include enabled entries
                                            entry_dict = {
                                                'content': db_entry.content,
                                                'keys': json.loads(db_entry.keys_json) if db_entry.keys_json else [],
                                                'enabled': db_entry.enabled,
                                                'position': db_entry.position,
                                                'insertion_order': db_entry.insertion_order,
                                                'case_sensitive': False,  # Default value
                                                'name': db_entry.comment or '',  # Use comment as name fallback
                                                'has_image': bool(db_entry.image_uuid),
                                                'image_uuid': db_entry.image_uuid or ''
                                            }
                                            lore_entries.append(entry_dict)
                                    
                                    if lore_entries:
                                        self.logger.log_step(f"Loaded {len(lore_entries)} lore entries from database")
                                        
                                        # Create text for matching
                                        history_text = ''
                                        for msg in chat_history:
                                            role = msg.get('role', '')
                                            content = msg.get('content', '')
                                            if role == 'user':
                                                history_text += f"User: {content}\n"
                                            else:
                                                char_name = character_data.get('data', {}).get('name', 'Character')
                                                history_text += f"{char_name}: {content}\n"
                                        
                                        # Add current message
                                        if current_message:
                                            history_text += f"User: {current_message}"
                                            
                                        # Match lore entries against chat history
                                        matched_entries = lore_handler.match_lore_entries(lore_entries, history_text)
                                        
                                        # Only modify memory if we matched entries
                                        if matched_entries:
                                            self.logger.log_step(f"Matched {len(matched_entries)} lore entries")
                                            # Create new memory with lore
                                            memory = lore_handler.integrate_lore_into_prompt(
                                                character_data, 
                                                matched_entries
                                            )                                            # Note this in the context window
                                            if context_window is not None and isinstance(context_window, dict):
                                                context_window['lore_info'] = {
                                                    'matched_count': len(matched_entries),
                                                    'entry_keys': [entry.get('keys', [''])[0] for entry in matched_entries 
                                                                if entry.get('keys')]
                                                }
                                        else:
                                            self.logger.log_step("No lore entries matched the chat history")
                                    else:
                                        self.logger.log_step("No enabled lore entries found for character")
                                else:
                                    self.logger.log_step("Character not found in database or has no lore book")
                            finally:
                                db.close()
                        except Exception as db_error:
                            self.logger.log_error(f"Error loading lore from database: {str(db_error)}")
                            # Continue without lore if database lookup fails
                    else:
                        self.logger.log_step("No character UUID provided, skipping lore matching")
                except Exception as e:
                    self.logger.log_error(f"Error processing lore: {str(e)}")
                    # Continue with generation even if lore processing fails
            
            # Add </s> to stop sequences if not already present
            if "</s>" not in stop_sequence:
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
                    # Regular content chunk
                    if chunk_count % 50 == 0:  # Log every 50 chunks
                        self.logger.log_step(f"Yielding chunk {chunk_count} from adapter generator...")
                    yield chunk
                    has_yielded_content = True
            self.logger.log_step(f"Finished iterating adapter generator. Total chunks yielded: {chunk_count}")
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
