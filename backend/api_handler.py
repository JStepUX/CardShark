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

    def stream_generate(self, request_data: Dict) -> Generator[bytes, None, None]:
        """Stream generate tokens from the API."""
        try:
            # Extract API config and generation params from the request
            api_config = request_data.get('api_config', {})
            generation_params = request_data.get('generation_params', {})

            # Extract from API config - using templateId consistently
            url = api_config.get('url')
            api_key = api_config.get('apiKey')
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
            
            # Add </s> to stop sequences if not already present
            if "</s>" not in stop_sequence:
                stop_sequence.append("</s>")
            
            # Save context window for debugging if provided
            context_window = generation_params.get('context_window')
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

            # Prepare headers
            headers = {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream'
            }
            if api_key:
                headers['Authorization'] = f'Bearer {api_key}'

            # Ensure URL has protocol and correct endpoint
            if not url.startswith(('http://', 'https://')):
                url = f'http://{url}'
                
            # Different endpoints for different APIs
            if '/api/extra/generate/stream' not in url and '/api/generate' not in url:
                # Append the appropriate endpoint if not already there
                url = url.rstrip('/') + '/api/extra/generate/stream'

            # Prepare request data by combining generation settings with required fields
            # Get generation settings from api_config or use defaults from generation_params
            combined_settings = {**generation_settings}
            # Add required parameters
            data = {
                **combined_settings,
                "prompt": prompt,
                "memory": memory,
                "stop_sequence": stop_sequence,
                "quiet": quiet,
                "trim_stop": True  # Add trim_stop parameter to ensure clean output
            }
            
            # Log the request data for debugging
            self.logger.log_step("Request data prepared with generation settings")
            self.logger.log_step(f"Prompt length: {len(prompt) if prompt else 0} chars")
            self.logger.log_step(f"Memory length: {len(memory) if memory else 0} chars")
            self.logger.log_step(f"Using settings: max_length={data.get('max_length')}, temperature={data.get('temperature')}, top_p={data.get('top_p')}")
            self.logger.log_step(f"API URL: {url}")
            self.logger.log_step(f"Streaming to URL: {url}")
            
            # Make the streaming request
            with requests.post(url, headers=headers, json=data, stream=True) as response:
                if response.status_code != 200:
                    error_msg = f"Generation failed with status {response.status_code}"
                    yield f"data: {json.dumps({'error': {'message': error_msg}})}\n\n".encode('utf-8')
                    self.logger.log_error(error_msg)
                    try:
                        error_body = response.text
                        self.logger.log_error(f"Error response: {error_body}")
                    except:
                        pass
                    return

                for line in response.iter_lines():
                    if not line:
                        continue
                        
                    try:
                        line_text = line.decode('utf-8')
                        if line_text.startswith('data: '):
                            # Extract the data portion (after "data: ")
                            data_portion = line_text[6:]
                            
                            # Parse the response to ensure it's valid JSON
                            try:
                                content = json.loads(data_portion)
                                
                                # Pass through the content directly without cleaning
                                # This prevents slowdowns from unnecessary text processing
                                if isinstance(content, str):
                                    formatted_content = {'content': content}
                                else:
                                    formatted_content = content
                                    
                                # Send properly formatted SSE without any extra processing
                                yield f"data: {json.dumps(formatted_content)}\n\n".encode('utf-8')
                                
                            except json.JSONDecodeError:
                                # If not valid JSON, just pass through the raw content
                                # This is probably plain text from KoboldCPP
                                formatted_content = {'content': data_portion}
                                yield f"data: {json.dumps(formatted_content)}\n\n".encode('utf-8')
                            
                    except Exception as e:
                        self.logger.log_error(f"Error processing line: {e}")
                        continue

                # Send completion message
                yield b"data: [DONE]\n\n"

        except ValueError as ve:
            error_msg = str(ve)
            self.logger.log_error(error_msg)
            yield f"data: {json.dumps({'error': {'type': 'ValueError', 'message': error_msg}})}\n\n".encode('utf-8')
        except Exception as e:
            error_msg = f"Stream generation failed: {str(e)}"
            self.logger.log_error(error_msg)
            yield f"data: {json.dumps({'error': {'type': 'ServerError', 'message': error_msg}})}\n\n".encode('utf-8')