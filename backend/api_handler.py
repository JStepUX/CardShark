# backend/api_handler.py
# Description: API handler for interacting with LLM API endpoints
import traceback
import requests # type: ignore
import json
import re
from typing import Dict, Optional, Tuple, Generator

class ApiHandler:
    def __init__(self, logger):
        self.logger = logger

    def test_connection(self, url: str, api_key: Optional[str] = None) -> Tuple[bool, Optional[str], Optional[Dict]]:
        """Test connection to LLM API endpoint and detect template."""
        try:
            # Ensure URL has protocol
            if not url.startswith(('http://', 'https://')):
                url = f'http://{url}'
                
            url = url.rstrip('/') + '/v1/chat/completions'
            self.logger.log_step(f"Testing connection to {url}")
            
            headers = {
                'Content-Type': 'application/json'
            }
            if api_key:
                headers['Authorization'] = f'Bearer {api_key}'
            
            # Use our standard test payload
            test_data = {
                "messages": [
                    {"role": "user", "content": "Hi"}
                ],
                "max_tokens": 10,
                "temperature": 0.7
            }
            
            response = requests.post(
                url,
                headers=headers,
                json=test_data,
                timeout=10
            )
            
            if response.status_code == 200:
                try:
                    response_data = response.json()
                    response_text = response_data.get('choices', [{}])[0].get('message', {}).get('content', '')
                    self.logger.log_step(f"Got response text: {response_text}")
                    
                    # Detect template from response
                    template = self._detect_template(response_text)
                    template_name = template['name'] if template else 'Unknown'
                    self.logger.log_step(f"Detected template: {template_name}")
                    
                    return True, None, template
                except Exception as e:
                    self.logger.log_error(f"Template detection failed: {str(e)}")
                    return True, None, None
            else:
                error_msg = f"API returned status {response.status_code}"
                try:
                    error_data = response.json()
                    if 'error' in error_data:
                        error_msg = f"{error_msg}: {error_data['error']}"
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
            
            response = requests.post(endpoint, headers=headers, json=data, timeout=30)
            
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
            generation_settings = api_config.get('generation_settings', {})

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
            
            # Add lore matching to context window if it exists
            context_window = generation_params.get('context_window')
            
            # Handle lore matching if character data is available
            if character_data and 'data' in character_data and 'character_book' in character_data['data']:
                try:
                    from backend.lore_handler import LoreHandler
                    lore_handler = LoreHandler(self.logger)
                    
                    # Get lore entries
                    lore_entries = character_data['data']['character_book'].get('entries', [])
                    
                    if lore_entries:
                        self.logger.log_step(f"Found {len(lore_entries)} lore entries")
                        
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
                            
                        # Match lore entries
                        matched_entries = lore_handler.match_lore_entries(lore_entries, history_text)
                        
                        # Only modify memory if we matched entries
                        if matched_entries:
                            self.logger.log_step(f"Matched {len(matched_entries)} lore entries")
                            # Create new memory with lore
                            memory = lore_handler.integrate_lore_into_prompt(
                                character_data, 
                                matched_entries
                            )
                            # Note this in the context window
                            if context_window is not None and isinstance(context_window, dict):
                                context_window['lore_info'] = {
                                    'matched_count': len(matched_entries),
                                    'entry_keys': [entry.get('keys', [''])[0] for entry in matched_entries 
                                                if entry.get('keys')]
                                }
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
                    
                    # Create context directory if it doesn't exist
                    context_dir = base_dir / 'context'
                    context_dir.mkdir(parents=True, exist_ok=True)
                    
                    # Context file path
                    context_file = context_dir / 'latest_context.json'
                    
                    # Write the context data
                    with open(context_file, 'w', encoding='utf-8') as f:
                        json.dump(context_window, f, indent=2)

                except Exception as e:
                    self.logger.log_error(f"Error saving context window: {str(e)}")
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
            self.logger.log_step(f"Using provider: {provider}")
            
            # OpenRouter-specific streaming handling
            if provider == "OpenRouter":
                self.logger.log_step("Using OpenRouter-specific streaming handling")
                # Send special start message for OpenRouter to initiate streaming properly
                yield f"data: {json.dumps({'content': '', 'streaming_start': True})}\n\n".encode('utf-8')
            
            # Use our adapter system to handle the stream generation
            self.logger.log_step(f"Attempting to call adapter.stream_generate for {provider}...")
            adapter_generator = adapter.stream_generate(
                url,
                api_key,
                prompt,
                memory,
                stop_sequence,
                generation_settings
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
        except Exception as e:
            error_msg = f"Stream generation failed: {str(e)}"
            self.logger.log_error(error_msg)
            self.logger.log_error(traceback.format_exc())
            yield f"data: {json.dumps({'error': {'type': 'ServerError', 'message': error_msg}})}\n\n".encode('utf-8')
