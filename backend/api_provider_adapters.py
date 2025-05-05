# backend/api_provider_adapters.py
# Adapter system for different API providers

import requests
import json
import re
from typing import Dict, List, Optional, Generator, Any, Tuple, Protocol
import traceback

class ApiProviderAdapter:
    """Base class for API provider adapters
    
    This class defines the interface for all API provider adapters and provides
    common functionality for handling requests, errors, and response parsing.
    
    Each provider adapter should inherit from this class and implement the
    required methods to handle provider-specific behavior.
    """
    
    def __init__(self, logger):
        """Initialize the adapter with a logger instance.
        
        Args:
            logger: Logger instance for recording operations and errors
        """
        self.logger = logger
        
    def validate(self) -> Tuple[bool, Optional[str]]:
        """Validate that the adapter is properly configured
        
        Returns:
            Tuple containing (success boolean, error message if any)
        """
        return True, None
        
    def get_endpoint_url(self, base_url: str) -> str:
        """Get the endpoint URL for the provider
        
        Args:
            base_url: Base URL for the API service
            
        Returns:
            Complete endpoint URL for the API
            
        Raises:
            NotImplementedError: Must be implemented by subclasses
        """
        raise NotImplementedError
        
    def prepare_headers(self, api_key: Optional[str]) -> Dict[str, str]:
        """Prepare headers for the API request
        
        Args:
            api_key: Optional API key for authentication
            
        Returns:
            Dictionary of HTTP headers
            
        Raises:
            NotImplementedError: Must be implemented by subclasses
        """
        raise NotImplementedError
    
    def _handle_error(self, response: requests.Response) -> str:
        """Extract error information from a failed API response
        
        Args:
            response: The HTTP response object
            
        Returns:
            Formatted error message
        """
        error_msg = f"API returned status {response.status_code}"
        try:
            error_data = response.json()
            if isinstance(error_data, dict) and 'error' in error_data:
                if isinstance(error_data['error'], dict) and 'message' in error_data['error']:
                    error_msg = f"{error_msg}: {error_data['error']['message']}"
                else:
                    error_msg = f"{error_msg}: {error_data['error']}"
        except:
            if response.text:
                error_msg = f"{error_msg}: {response.text[:200]}..."
        return error_msg
        
    def prepare_request_data(self, 
                            prompt: str, 
                            memory: Optional[str],
                            stop_sequence: List[str],
                            generation_settings: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare the request data for the provider's API"""
        raise NotImplementedError
        
    def parse_streaming_response(self, line: bytes) -> Optional[Dict[str, Any]]:
        """Parse a streaming response line from the provider's API"""
        raise NotImplementedError
        
    def stream_generate(self, 
                       base_url: str, 
                       api_key: Optional[str], 
                       prompt: str,
                       memory: Optional[str],
                       stop_sequence: List[str],
                       generation_settings: Dict[str, Any]) -> Generator[bytes, None, None]:
        """Generate a streaming response from the provider's API"""
        try:
            self.logger.log_step("Adapter: Entered base stream_generate method") # <<< ADDED LOG
            # Get the endpoint URL
            url = self.get_endpoint_url(base_url)
            self.logger.log_step(f"Using endpoint URL: {url}")
            
            # Prepare headers
            headers = self.prepare_headers(api_key)
            
            # Log headers with API key presence check for debugging
            has_auth = False
            auth_header = None
            
            if 'Authorization' in headers:
                has_auth = True
                auth_header = 'Authorization'
            elif 'x-api-key' in headers:
                has_auth = True
                auth_header = 'x-api-key'
                
            self.logger.log_step(f"Headers prepared. Auth header present: {has_auth}")
            if has_auth and auth_header:
                # Log a few characters of the auth value for debugging without revealing the full key
                auth_value = headers[auth_header]
                mask_value = f"{auth_value[:7]}...{auth_value[-5:]}" if len(auth_value) > 15 else "[REDACTED]"
                self.logger.log_step(f"Auth format: {auth_header}: {mask_value}")
            else:
                self.logger.log_step("Warning: No authentication header found")
                
            # Add additional debugging for OpenRouter specifically
            if self.__class__.__name__ == 'OpenRouterAdapter':
                self.logger.log_step("OpenRouter specific debug info:")
                self.logger.log_step(f"API key provided: {api_key is not None and len(api_key) > 0}")
                self.logger.log_step(f"Headers keys: {', '.join(headers.keys())}")
            
            # Prepare request data
            self.logger.log_step("Attempting to call adapter.prepare_request_data...") # Log before
            data = self.prepare_request_data(prompt, memory, stop_sequence, generation_settings)
            self.logger.log_step("adapter.prepare_request_data finished.") # Log after
            # Log length separately in case str(data) fails
            try:
                data_len = len(str(data))
                self.logger.log_step(f"Prepared request data length: {data_len} chars")
            except Exception as e:
                 self.logger.log_error(f"Error calculating length of prepared data: {e}")
                 # Optionally re-raise or handle if this error is critical
            
            
            # Make the streaming request
            self.logger.log_step(f"Attempting to POST stream request to: {url}") # Log before request
            # Add a specific timeout (e.g., 60 seconds)
            with requests.post(url, headers=headers, json=data, stream=True, timeout=60) as response:
                self.logger.log_step(f"POST stream request returned status: {response.status_code}") # Log after request returns
                if response.status_code != 200:
                    error_msg = self._handle_error(response)
                    self.logger.log_error(f"API error: {error_msg}")
                    
                    # Enhanced error logging for auth issues
                    if response.status_code == 401:
                        self.logger.log_error("Authentication error (401): API key may be invalid or missing")
                    elif response.status_code == 403:
                        self.logger.log_error("Authorization error (403): API key may not have permission")
                    
                    yield f"data: {json.dumps({'error': {'message': error_msg}})}\n\n".encode('utf-8')
                    return
                
                # Process streaming response
                for line in response.iter_lines():
                    if not line:
                        continue
                        
                    try:
                        # Parse the streaming response line
                        parsed_content = self.parse_streaming_response(line)
                        if parsed_content:
                            yield f"data: {json.dumps(parsed_content)}\n\n".encode('utf-8')
                    except Exception as e:
                        self.logger.log_error(f"Error processing line: {e}")
                        continue
                
                # Send completion message
                yield b"data: [DONE]\n\n"
                
        except Exception as e:
            error_msg = f"Stream generation failed: {str(e)}"
            self.logger.log_error(error_msg)
            self.logger.log_error(traceback.format_exc())
            yield f"data: {json.dumps({'error': {'type': 'ServerError', 'message': error_msg}})}\n\n".encode('utf-8')


class KoboldCppAdapter(ApiProviderAdapter):
    """Adapter for KoboldCPP API"""
    
    def get_endpoint_url(self, base_url: str) -> str:
        """Get the endpoint URL for KoboldCPP"""
        # Ensure URL has protocol
        if not base_url.startswith(('http://', 'https://')):
            base_url = f'http://{base_url}'
            
        # Log the original URL for debugging
        self.logger.log_step(f"KoboldCPP adapter received base URL: {base_url}")
            
        # First check if the URL already has a known endpoint pattern
        if '/api/extra/generate/stream' in base_url or '/api/generate' in base_url:
            self.logger.log_step(f"Using existing endpoint in URL: {base_url}")
            return base_url
        
        # Try the streaming endpoint first, which is preferred
        stream_url = base_url.rstrip('/') + '/api/extra/generate/stream'
        self.logger.log_step(f"Using streaming endpoint: {stream_url}")
        return stream_url
        
    def prepare_headers(self, api_key: Optional[str]) -> Dict[str, str]:
        """Prepare headers for KoboldCPP"""
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream'
        }
        if api_key:
            headers['Authorization'] = f'Bearer {api_key}'
        return headers
    
    def prepare_request_data(self, 
                           prompt: str, 
                           memory: Optional[str],
                           stop_sequence: List[str],
                           generation_settings: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare the request data for KoboldCPP"""
        # Extract KoboldCPP-specific settings or use defaults
        max_tokens = generation_settings.get('max_length', 220)
        temperature = generation_settings.get('temperature', 0.7)
        top_p = generation_settings.get('top_p', 0.9)
        top_k = generation_settings.get('top_k', 40)
        typical_p = generation_settings.get('typical_p', 1.0)
        repetition_penalty = generation_settings.get('repetition_penalty', 1.1)
        
        # Log the preparation
        self.logger.log_step(f"Preparing KoboldCPP request data with max_tokens={max_tokens}")
        
        # Create full prompt including memory if provided
        full_prompt = ""
        if memory:
            full_prompt = memory + "\n\n" + prompt
        else:
            full_prompt = prompt
            
        # Create the KoboldCPP request format
        data = {
            "prompt": full_prompt,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": top_p,
            "top_k": top_k,
            "typical_p": typical_p,
            "rep_pen": repetition_penalty,
            "stopping_strings": stop_sequence
        }
        
        return data
        
    def parse_streaming_response(self, line: bytes) -> Optional[Dict[str, Any]]:
        """Parse a streaming response line from KoboldCPP
        
        KoboldCPP sends data in Server-Sent Events (SSE) format with alternating
        'event: message' and 'data: {...}' lines. We need to handle both formats.
        """
        try:
            line_text = line.decode('utf-8').strip()
            
            # Skip processing empty lines
            if not line_text:
                return None
                
            # Log the raw line for debugging (truncated for readability)
            self.logger.log_step(f"KoboldCPP raw response: {line_text[:200]}")
            
            # Handle event lines - these indicate a message is coming but don't contain content
            if line_text.startswith('event:'):
                # Just log that we received an event line but don't treat it as an error
                self.logger.log_step(f"KoboldCPP event line received: {line_text}")
                return None
            
            # Handle data lines with JSON content
            if line_text.startswith('data:'):
                # Extract the JSON part after 'data: '
                json_text = line_text[5:].strip()
                
                try:
                    data = json.loads(json_text)
                    
                    # Extract token from the JSON content
                    if 'token' in data:
                        token = data.get('token', '')
                        self.logger.log_step(f"KoboldCPP token received: '{token}'")
                        return {'content': token}
                    
                    # Check for text format (standard endpoint)
                    elif 'text' in data:
                        text = data.get('text', '')
                        self.logger.log_step(f"KoboldCPP text received: '{text[:50]}...'")
                        return {'content': text}
                    
                    # Check for results format (batch endpoint)
                    elif 'results' in data and isinstance(data['results'], list) and len(data['results']) > 0:
                        result = data['results'][0]
                        if 'text' in result:
                            text = result.get('text', '')
                            self.logger.log_step(f"KoboldCPP results/text received: '{text[:50]}...'")
                            return {'content': text}
                    
                    # If we have a finish reason, return empty content to signal completion
                    if 'finish_reason' in data and data['finish_reason'] is not None:
                        self.logger.log_step(f"KoboldCPP finish reason: {data['finish_reason']}")
                        return {'content': ''}
                    
                    # As a fallback, for any response that has no recognizable format
                    # but is a valid JSON object, return an empty content to keep the stream alive
                    self.logger.log_step(f"Unknown KoboldCPP data format: {json_text[:100]}")
                    return {'content': ''}
                    
                except json.JSONDecodeError:
                    self.logger.log_step(f"Non-JSON data received: {json_text[:100]}")
                    # Even if it's not valid JSON, don't treat it as an error
                    # Just return the raw text as content
                    return {'content': json_text}
            
            # For other non-event, non-data lines, try to extract useful content
            try:
                # Try to parse as JSON directly
                data = json.loads(line_text)
                
                if 'token' in data:
                    token = data.get('token', '')
                    self.logger.log_step(f"KoboldCPP direct token received: '{token}'")
                    return {'content': token}
                elif 'text' in data:
                    text = data.get('text', '')
                    self.logger.log_step(f"KoboldCPP direct text received: '{text[:50]}...'")
                    return {'content': text}
                
                # Return empty content for unrecognized but valid JSON
                return {'content': ''}
            except json.JSONDecodeError:
                # Not JSON and not a recognized line format
                # Log this but don't treat as an error - just return None to skip this line
                self.logger.log_step(f"Skipping unrecognized line format: {line_text[:100]}")
                return None
                
        except Exception as e:
            # Only log actual exceptions as errors
            self.logger.log_error(f"Error parsing KoboldCPP response: {e}")
            return None
        
    def stream_generate(self, 
                       base_url: str, 
                       api_key: Optional[str], 
                       prompt: str,
                       memory: Optional[str],
                       stop_sequence: List[str],
                       generation_settings: Dict[str, Any]) -> Generator[bytes, None, None]:
        """Generate a streaming response from KoboldCPP API with fallback support
        
        This implementation tries the streaming endpoint first, and falls back to
        the standard endpoint if the streaming endpoint returns a 404.
        """
        try:
            self.logger.log_step("KoboldCPP: Entered stream_generate method")
            
            # First try the streaming endpoint
            url = self.get_endpoint_url(base_url)
            self.logger.log_step(f"KoboldCPP: Using primary endpoint URL: {url}")
            
            # Prepare headers and data
            headers = self.prepare_headers(api_key)
            data = self.prepare_request_data(prompt, memory, stop_sequence, generation_settings)
            
            # Make the streaming request
            self.logger.log_step(f"KoboldCPP: Attempting POST to streaming endpoint: {url}")
            try:
                with requests.post(url, headers=headers, json=data, stream=True, timeout=60) as response:
                    if response.status_code == 404:
                        # Streaming endpoint not found, try the standard endpoint
                        self.logger.log_step("KoboldCPP: Streaming endpoint returned 404, trying standard endpoint")
                        standard_url = base_url.rstrip('/') + '/api/generate'
                        self.logger.log_step(f"KoboldCPP: Trying standard endpoint: {standard_url}")
                        
                        # Make a non-streaming request to the standard endpoint
                        standard_response = requests.post(standard_url, headers=headers, json=data, timeout=60)
                        
                        if standard_response.status_code != 200:
                            error_msg = self._handle_error(standard_response)
                            self.logger.log_error(f"KoboldCPP API error on standard endpoint: {error_msg}")
                            yield f"data: {json.dumps({'error': {'message': error_msg}})}\n\n".encode('utf-8')
                            return
                            
                        # Parse the standard response
                        try:
                            result = standard_response.json()
                            text = result.get('results', [{}])[0].get('text', '')
                            
                            # Yield the response as a single chunk to simulate streaming
                            self.logger.log_step(f"KoboldCPP: Got response from standard endpoint, length: {len(text)}")
                            yield f"data: {json.dumps({'content': text})}\n\n".encode('utf-8')
                            yield b"data: [DONE]\n\n"
                            return
                        except Exception as e:
                            self.logger.log_error(f"Error processing standard response: {e}")
                            yield f"data: {json.dumps({'error': {'message': f'Failed to parse response: {str(e)}'}})}\n\n".encode('utf-8')
                            return
                    
                    # If not a 404, process the streaming response as before
                    self.logger.log_step(f"KoboldCPP: Streaming endpoint returned status: {response.status_code}")
                    if response.status_code != 200:
                        error_msg = self._handle_error(response)
                        self.logger.log_error(f"KoboldCPP API error: {error_msg}")
                        yield f"data: {json.dumps({'error': {'message': error_msg}})}\n\n".encode('utf-8')
                        return
                    
                    # Process streaming response
                    for line in response.iter_lines():
                        if not line:
                            continue
                            
                        try:
                            # Parse the streaming response line
                            parsed_content = self.parse_streaming_response(line)
                            if parsed_content:
                                yield f"data: {json.dumps(parsed_content)}\n\n".encode('utf-8')
                        except Exception as e:
                            self.logger.log_error(f"Error processing line: {e}")
                            continue
                    
                    # Send completion message
                    yield b"data: [DONE]\n\n"
                    
            except requests.exceptions.RequestException as e:
                self.logger.log_error(f"KoboldCPP request failed: {str(e)}")
                error_msg = f"Failed to connect to KoboldCPP: {str(e)}"
                yield f"data: {json.dumps({'error': {'message': error_msg}})}\n\n".encode('utf-8')
                
        except Exception as e:
            error_msg = f"KoboldCPP stream generation failed: {str(e)}"
            self.logger.log_error(error_msg)
            self.logger.log_error(traceback.format_exc())
            yield f"data: {json.dumps({'error': {'type': 'ServerError', 'message': error_msg}})}\n\n".encode('utf-8')


class OpenAIAdapter(ApiProviderAdapter):
    """Adapter for OpenAI API"""
    
    def get_endpoint_url(self, base_url: str) -> str:
        """Get the endpoint URL for OpenAI"""
        # Ensure URL has protocol
        if not base_url.startswith(('http://', 'https://')):
            base_url = f'https://{base_url}'
            
        # Ensure the endpoint is correct
        if not base_url.endswith('/chat/completions'):
            return base_url.rstrip('/') + '/v1/chat/completions'
        return base_url
        
    def prepare_headers(self, api_key: Optional[str]) -> Dict[str, str]:
        """Prepare headers for OpenAI"""
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream'
        }
        if api_key:
            headers['Authorization'] = f'Bearer {api_key}'
        return headers
        
    def prepare_request_data(self, 
                           prompt: str, 
                           memory: Optional[str],
                           stop_sequence: List[str],
                           generation_settings: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare the request data for OpenAI"""
        # Extract OpenAI-specific settings or use defaults
        max_tokens = generation_settings.get('max_length', 220)
        temperature = generation_settings.get('temperature', 0.7)
        top_p = generation_settings.get('top_p', 0.9)
        presence_penalty = generation_settings.get('presence_penalty', 0)
        model = generation_settings.get('model', 'gpt-3.5-turbo')
        
        # Create the OpenAI request format
        data = {
            "model": model,
            "messages": [{"role": "system", "content": memory if memory else ""}],
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": top_p,
            "presence_penalty": presence_penalty,
            "stop": stop_sequence,
            "stream": True
        }
        
        # Add the prompt as a user message
        data["messages"].append({"role": "user", "content": prompt})
        
        return data
        
    def parse_streaming_response(self, line: bytes) -> Optional[Dict[str, Any]]:
        """Parse a streaming response line from OpenAI"""
        try:
            line_text = line.decode('utf-8')
            if line_text.startswith('data: '):
                data_portion = line_text[6:]
                
                # Check for completion message
                if data_portion.strip() == "[DONE]":
                    return None
                
                try:
                    content = json.loads(data_portion)
                    
                    # Extract the delta content from OpenAI's format
                    if 'choices' in content and len(content['choices']) > 0:
                        choice = content['choices'][0]
                        if 'delta' in choice and 'content' in choice['delta']:
                            return {'content': choice['delta']['content']}
                    
                    return None
                except json.JSONDecodeError:
                    self.logger.log_error(f"Invalid JSON in OpenAI response: {data_portion}")
                    return None
            return None
        except Exception as e:
            self.logger.log_error(f"Error parsing OpenAI response: {e}")
            return None


class ClaudeAdapter(ApiProviderAdapter):
    """Adapter for Anthropic Claude API"""
    
    def get_endpoint_url(self, base_url: str) -> str:
        """Get the endpoint URL for Claude"""
        # Ensure URL has protocol
        if not base_url.startswith(('http://', 'https://')):
            base_url = f'https://{base_url}'
            
        # Ensure the endpoint is correct
        if not base_url.endswith('/messages'):
            return base_url.rstrip('/') + '/v1/messages'
        return base_url
        
    def prepare_headers(self, api_key: Optional[str]) -> Dict[str, str]:
        """Prepare headers for Claude"""
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
            'Anthropic-Version': '2023-06-01'
        }
        if api_key:
            headers['x-api-key'] = api_key
        return headers
        
    def prepare_request_data(self, 
                           prompt: str, 
                           memory: Optional[str],
                           stop_sequence: List[str],
                           generation_settings: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare the request data for Claude"""
        # Extract Claude-specific settings or use defaults
        max_tokens = generation_settings.get('max_length', 220)
        temperature = generation_settings.get('temperature', 0.7)
        top_p = generation_settings.get('top_p', 0.9)
        model = generation_settings.get('model', 'claude-3-sonnet-20240229')
        
        # Create system message if memory exists
        system = memory if memory else None
        
        # Create the Claude request format
        data = {
            "model": model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": top_p,
            "messages": [{"role": "user", "content": prompt}],
            "stream": True
        }
        
        # Add system message if provided
        if system:
            data["system"] = system
        
        # Add stop sequences if provided
        if stop_sequence:
            data["stop_sequences"] = stop_sequence
            
        return data
        
    def parse_streaming_response(self, line: bytes) -> Optional[Dict[str, Any]]:
        """Parse a streaming response line from Claude"""
        try:
            line_text = line.decode('utf-8')
            if line_text.startswith('data: '):
                data_portion = line_text[6:]
                
                # Check for completion message
                if data_portion.strip() == "[DONE]":
                    return None
                
                try:
                    content = json.loads(data_portion)
                    
                    # Extract the content from Claude's format
                    if 'type' in content and content['type'] == 'content_block_delta':
                        if 'delta' in content and 'text' in content['delta']:
                            return {'content': content['delta']['text']}
                    
                    return None
                except json.JSONDecodeError:
                    self.logger.log_error(f"Invalid JSON in Claude response: {data_portion}")
                    return None
            return None
        except Exception as e:
            self.logger.log_error(f"Error parsing Claude response: {e}")
            return None


class OpenRouterAdapter(ApiProviderAdapter):
    """Adapter for OpenRouter API"""
    
    def get_endpoint_url(self, base_url: str) -> str:
        """Get the endpoint URL for OpenRouter"""
        # Ensure URL has protocol
        if not base_url.startswith(('http://', 'https://')):
            base_url = f'https://{base_url}'
        
        # Fix the URL to avoid duplicating /v1/ segments
        # First, normalize the base URL by removing trailing slash
        base_url = base_url.rstrip('/')
        
        # Check if URL already has the completions endpoint
        if '/v1/chat/completions' in base_url or base_url.endswith('/chat/completions'):
            return base_url
            
        # Handle different URL patterns for OpenRouter
        if base_url.endswith('/api/v1'):
            return f"{base_url}/chat/completions"
        elif '/api/v1' in base_url:
            # Make sure we don't add another /v1 if it's already there
            return f"{base_url}/chat/completions"
        else:
            # Standard case - append the full path
            return f"{base_url}/api/v1/chat/completions"
    
    def prepare_headers(self, api_key: Optional[str]) -> Dict[str, str]:
        """Prepare headers for OpenRouter"""
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
            'HTTP-Referer': 'https://cardshark.ai',  # Required by OpenRouter
            'X-Title': 'CardShark'  # Required by OpenRouter
        }
        
        if api_key:
            # Clean the API key and ensure proper format
            api_key = api_key.strip()
            
            if not api_key.startswith('Bearer '):
                headers['Authorization'] = f'Bearer {api_key}'
                self.logger.log_step("Added Bearer prefix to OpenRouter API key")
            else:
                # Key already has Bearer prefix
                headers['Authorization'] = api_key
                self.logger.log_step("Using API key with existing Bearer prefix")
                
            self.logger.log_step(f"OpenRouter auth header length: {len(headers['Authorization'])}")
        else:
            self.logger.log_warning("No API key provided for OpenRouter - authentication will fail")
        
        return headers
    
    def prepare_request_data(self, 
                           prompt: str, 
                           memory: Optional[str],
                           stop_sequence: List[str],
                           generation_settings: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare the request data for OpenRouter"""
        # Extract settings or use defaults
        max_tokens = generation_settings.get('max_length', 220)
        temperature = generation_settings.get('temperature', 0.7)
        top_p = generation_settings.get('top_p', 0.9)
        
        # Enhanced model selection logic with better logging and prioritization
        model = None
        
        # First, explicitly check if there's a direct model provided
        if 'model' in generation_settings and generation_settings['model']:
            model = generation_settings['model']
            self.logger.log_step(f"Using explicitly selected model: {model}")
        
        # Check for OpenRouter specific format only if model is still None
        elif 'openrouter_model' in generation_settings and generation_settings['openrouter_model']:
            model = generation_settings['openrouter_model']
            self.logger.log_step(f"Using model from openrouter_model setting: {model}")
            
        # Default fallback
        if not model:
            model = 'openai/gpt-3.5-turbo'  # Default model
            self.logger.log_step(f"No model specified in settings, using default: {model}")
            
        # Create the OpenRouter request format (similar to OpenAI)
        messages = []
        
        # Special handling for greeting generation
        is_greeting = False
        if prompt and (prompt.startswith("You are tasked with crafting a new, engaging first message") or 
                     "craft a new introductory message" in prompt.lower()):
            is_greeting = True
            self.logger.log_step("Detected greeting generation request")
            
            # For greeting generation, we need to format the prompt differently for OpenRouter
            if memory and memory.strip():
                # First add memory as system message
                messages.append({"role": "system", "content": memory})
            
            # Add prompt as user message
            messages.append({"role": "user", "content": prompt})
        else:
            # Standard message handling
            # Add system message if memory is provided
            if memory and memory.strip():
                messages.append({"role": "system", "content": memory})
            
            # Add the prompt as a user message
            messages.append({"role": "user", "content": prompt})
        
        data = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": top_p,
            "stop": stop_sequence,
            "stream": True
        }
        
        # Log the constructed request for debugging
        self.logger.log_step(f"OpenRouter request to model: {model}")
        self.logger.log_step(f"Request contains {len(messages)} messages")
        
        return data
    
    def parse_streaming_response(self, line: bytes) -> Optional[Dict[str, Any]]:
        """Parse a streaming response line from OpenRouter"""
        try:
            line_text = line.decode('utf-8')
            
            # Add debug logging for the first few chunks and special cases
            if line_text.startswith(':'):
                # OpenRouter sends ":" lines as keep-alive
                self.logger.log_step(f"OpenRouter keep-alive line received: {line_text}")
                return None
            
            if line_text.startswith('data: '):
                data_portion = line_text[6:]
                
                # Check for completion message
                if data_portion.strip() == "[DONE]":
                    self.logger.log_step("OpenRouter [DONE] marker received")
                    return None
                
                try:
                    # Handle potentially incomplete JSON by trying to fix common issues
                    try:
                        content = json.loads(data_portion)
                    except json.JSONDecodeError:
                        # Try to fix incomplete JSON by adding closing brackets
                        # This happens when large responses are chunked mid-JSON
                        if '"delta": {' in data_portion and not '"content":' in data_portion:
                            self.logger.log_step("Detected incomplete delta object, assuming role-only message")
                            return {'token': '', 'delta_type': 'role'}
                            
                        self.logger.log_error(f"Incomplete JSON received: {data_portion}")
                        return None
                    
                    # Extract the delta content from OpenRouter's format (similar to OpenAI)
                    if 'choices' in content and len(content['choices']) > 0:
                        choice = content['choices'][0]
                        
                        # Check if there's a delta with content
                        if 'delta' in choice and 'content' in choice['delta']:
                            chunk_content = choice['delta']['content'] or ""
                            # Return token instead of content for better streaming in frontend
                            return {'token': chunk_content, 'model': content.get('model', '')}
                        
                        # Handle the case where delta contains only role info (first message)
                        elif 'delta' in choice and 'role' in choice['delta']:
                            self.logger.log_step(f"Received role-only delta with role: {choice['delta']['role']}")
                            # Return empty token with delta_type to indicate role info
                            return {'token': '', 'delta_type': 'role', 'role': choice['delta']['role']}
                        
                        # Handle the case where 'text' might be used instead
                        elif 'text' in choice and choice['text']:
                            return {'token': choice['text'], 'model': content.get('model', '')}
                            
                        # If delta exists but has no content (could be an empty delta)
                        elif 'delta' in choice:
                            self.logger.log_step("Delta exists but has no content field")
                            # Return empty token to keep the stream alive
                            return {'token': '', 'delta_type': 'empty_delta'}
                    
                    # Sometimes OpenRouter sends metadata or processing info
                    if content.get('processing', False) or content.get('created', False):
                        self.logger.log_step("Received OpenRouter processing info")
                        return {'token': '', 'delta_type': 'processing'}
                    
                    # If we couldn't extract content in any recognized format, log it
                    self.logger.log_step(f"OpenRouter response format not recognized: {json.dumps(content)[:100]}...")
                    return None
                    
                except Exception as e:
                    self.logger.log_error(f"Error processing OpenRouter response: {str(e)}")
                    self.logger.log_error(f"Problematic data: {data_portion}")
                    return None
            return None
        except Exception as e:
            self.logger.log_error(f"Error parsing OpenRouter response: {e}")
            return None
        
    def list_models(self, base_url: str, api_key: Optional[str]) -> Dict[str, Any]:
        """Fetch available models from OpenRouter
        
        Args:
            base_url: Base URL for OpenRouter API
            api_key: API key for authentication
            
        Returns:
            Dictionary containing available models or error information
        """
        try:
            # Ensure URL has protocol
            if not base_url.startswith(('http://', 'https://')):
                base_url = f'https://{base_url}'
                
            # Normalize the base URL
            base_url = base_url.rstrip('/')
            
            # Build the models endpoint URL - OpenRouter models are at /api/v1/models
            if base_url.endswith('/api/v1'):
                url = f"{base_url}/models"
            elif '/api/v1' in base_url:
                url = f"{base_url.split('/api/v1')[0]}/api/v1/models"
            else:
                url = f"{base_url}/api/v1/models"
                
            self.logger.log_step(f"Fetching OpenRouter models from: {url}")
            
            # Prepare headers
            headers = self.prepare_headers(api_key)
            
            # Make request
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code != 200:
                error_msg = self._handle_error(response)
                self.logger.log_error(f"Failed to fetch models: {error_msg}")
                return {"success": False, "error": error_msg}
                
            # Parse response
            models_data = response.json()
            if not isinstance(models_data, dict) or 'data' not in models_data:
                self.logger.log_error("Invalid models response format")
                return {"success": False, "error": "Invalid response format"}
                
            # Format models for the frontend
            formatted_models = []
            for model in models_data.get('data', []):
                model_id = model.get('id')
                if not model_id:
                    continue
                    
                formatted_models.append({
                    "id": model_id,
                    "name": model.get('name', model_id),
                    "description": model.get('description', ''),
                    "context_length": model.get('context_length'),
                    "pricing": {
                        "prompt": model.get('pricing', {}).get('prompt'),
                        "completion": model.get('pricing', {}).get('completion')
                    }
                })
                
            return {
                "success": True,
                "models": formatted_models
            }
            
        except Exception as e:
            error_msg = f"Error fetching models: {str(e)}"
            self.logger.log_error(error_msg)
            self.logger.log_error(traceback.format_exc())
            return {"success": False, "error": error_msg}


class FeatherlessAdapter(ApiProviderAdapter):
    """Adapter for Featherless.ai API
    
    Featherless.ai is a serverless AI inference platform providing access to
    over 4,200 Llama-based and other open-weight models via an OpenAI-compatible API.
    """
    
    def get_endpoint_url(self, base_url: str) -> str:
        """Get the endpoint URL for Featherless"""
        # Ensure URL has protocol
        if not base_url.startswith(('http://', 'https://')):
            base_url = f'https://{base_url}'
            
        # Check if URL already contains the path segment we need to add
        if '/chat/completions' in base_url:
            return base_url
            
        # Special handling to avoid duplicate /v1 segments
        if base_url.endswith('/v1'):
            return f"{base_url}/chat/completions"
        else:
            # Strip trailing slash and add the path
            return base_url.rstrip('/') + '/v1/chat/completions'
        
    def prepare_headers(self, api_key: Optional[str]) -> Dict[str, str]:
        """Prepare headers for Featherless"""
        headers = {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
            'HTTP-Referer': 'https://cardshark.ai',  # Client attribution
            'X-Title': 'CardShark'  # Client attribution
        }
        
        if api_key:
            # Clean the API key and ensure proper format
            api_key = api_key.strip()
            
            if not api_key.startswith('Bearer '):
                headers['Authorization'] = f'Bearer {api_key}'
                self.logger.log_step("Added Bearer prefix to Featherless API key")
            else:
                # Key already has Bearer prefix
                headers['Authorization'] = api_key
                self.logger.log_step("Using API key with existing Bearer prefix")
                
            self.logger.log_step(f"Featherless auth header length: {len(headers['Authorization'])}")
        else:
            self.logger.log_warning("No API key provided for Featherless - authentication will fail")
            
        return headers
        
    def prepare_request_data(self, 
                           prompt: str, 
                           memory: Optional[str],
                           stop_sequence: List[str],
                           generation_settings: Dict[str, Any]) -> Dict[str, Any]:
        """Prepare the request data for Featherless"""
        # Extract settings or use defaults
        max_tokens = generation_settings.get('max_length', 220)
        temperature = generation_settings.get('temperature', 0.7)
        top_p = generation_settings.get('top_p', 0.9)
        presence_penalty = generation_settings.get('presence_penalty', 0)
        frequency_penalty = generation_settings.get('frequency_penalty', 0)
        
        # Enhanced model selection logic with better error handling
        model = None
        
        # First, explicitly check if there's a direct model provided
        if 'model' in generation_settings and generation_settings['model']:
            model = generation_settings['model']
            self.logger.log_step(f"Using explicitly selected model: {model}")
        
        # Check for Featherless specific format
        elif 'featherless_model' in generation_settings and generation_settings['featherless_model']:
            model = generation_settings['featherless_model']
            self.logger.log_step(f"Using model from featherless_model setting: {model}")
            
        # Default fallback to a commonly available model
        if not model:
            model = 'meta-llama/Meta-Llama-3-8B-Instruct'  # Default model
            self.logger.log_step(f"No model specified in settings, using default: {model}")
        
        # Create the message structure
        messages = []
        
        # Add system message if memory is provided
        if memory and memory.strip():
            messages.append({"role": "system", "content": memory})
        
        # Add the prompt as a user message
        messages.append({"role": "user", "content": prompt})
        
        # Create the request data
        data = {
            "model": model,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "top_p": top_p,
            "presence_penalty": presence_penalty,
            "frequency_penalty": frequency_penalty,
            "stop": stop_sequence,
            "stream": True
        }
        
        # Log the request details
        self.logger.log_step(f"Featherless request to model: {model}")
        self.logger.log_step(f"Request contains {len(messages)} messages")
        
        return data
        
    def parse_streaming_response(self, line: bytes) -> Optional[Dict[str, Any]]:
        """Parse a streaming response line from Featherless"""
        try:
            line_text = line.decode('utf-8')
            if line_text.startswith('data: '):
                data_portion = line_text[6:]
                
                # Check for completion message
                if data_portion.strip() == "[DONE]":
                    return None
                
                try:
                    content = json.loads(data_portion)
                    
                    # Extract the delta content from OpenAI-compatible format
                    if 'choices' in content and len(content['choices']) > 0:
                        choice = content['choices'][0]
                        if 'delta' in choice and 'content' in choice['delta']:
                            return {'content': choice['delta']['content']}
                    
                    return None
                except json.JSONDecodeError:
                    self.logger.log_error(f"Invalid JSON in Featherless response: {data_portion}")
                    return None
            return None
        except Exception as e:
            self.logger.log_error(f"Error parsing Featherless response: {e}")
            return None
            
    def list_models(self, base_url: str, api_key: Optional[str], available_on_current_plan: Optional[bool] = None) -> Dict[str, Any]:
        """Fetch available models from Featherless
        
        Args:
            base_url: Base URL for Featherless API
            api_key: API key for authentication
            available_on_current_plan: Optional filter for available models on current plan
                                      None: Return all models
                                      True: Return only models available on current plan
                                      False: Return only models not available on current plan
            
        Returns:
            Dictionary containing available models or error information
        """
        try:
            # Ensure URL has protocol
            if not base_url.startswith(('http://', 'https://')):
                base_url = f'https://{base_url}'
                
            # Normalize the base URL
            base_url = base_url.rstrip('/')
            
            # Build the models endpoint URL, avoiding duplicate v1 paths
            if base_url.endswith('/v1'):
                url = f"{base_url}/models"
            else:
                url = f"{base_url}/v1/models"
            
            # Add query parameter for available_on_current_plan if specified
            if available_on_current_plan is not None:
                # Convert boolean to integer (0 for False, 1 for True) as per API docs
                param_value = 1 if available_on_current_plan else 0
                url = f"{url}?available_on_current_plan={param_value}"
            
            self.logger.log_step(f"Fetching Featherless models from: {url}")
            
            # Prepare headers
            headers = self.prepare_headers(api_key)
            
            # Make request
            response = requests.get(url, headers=headers, timeout=10)
            
            if response.status_code != 200:
                error_msg = self._handle_error(response)
                self.logger.log_error(f"Failed to fetch models: {error_msg}")
                return {"success": False, "error": error_msg}
                
            # Parse response
            models_data = response.json()
            if not isinstance(models_data, dict) or 'data' not in models_data:
                # Try standard OpenAI format which might just be a list under 'data'
                data = models_data.get('data', [])
                if not isinstance(data, list):
                    self.logger.log_error("Invalid models response format")
                    return {"success": False, "error": "Invalid response format"}
            else:
                data = models_data.get('data', [])
                
            # Format models for the frontend
            formatted_models = []
            for model in data:
                model_id = model.get('id')
                if not model_id:
                    continue
                    
                # Build model info with all relevant properties from the API docs
                model_info = {
                    "id": model_id,
                    "name": model.get('name', model_id),
                    "model_class": model.get('model_class', ''),
                    "context_length": model.get('context_length'),
                    "max_tokens": model.get('max_completion_tokens'),
                }
                
                # Only include these fields if they exist
                if 'description' in model:
                    model_info["description"] = model.get('description', '')
                    
                # Include gating info if present
                if 'is_gated' in model:
                    model_info["is_gated"] = model.get('is_gated', False)
                    
                # Include plan availability if present (only returned for authenticated requests)
                if 'available_on_current_plan' in model:
                    model_info["available_on_current_plan"] = model.get('available_on_current_plan')
                
                formatted_models.append(model_info)
                
            return {
                "success": True,
                "models": formatted_models
            }
            
        except Exception as e:
            error_msg = f"Error fetching models: {str(e)}"
            self.logger.log_error(error_msg)
            self.logger.log_error(traceback.format_exc())
            return {"success": False, "error": error_msg}


def get_provider_adapter(provider: str, logger) -> ApiProviderAdapter:
    """Factory function to get the appropriate adapter for a provider"""
    adapters = {
        'KoboldCPP': KoboldCppAdapter,
        'OpenAI': OpenAIAdapter,
        'Claude': ClaudeAdapter,
        'OpenRouter': OpenRouterAdapter,
        'Featherless': FeatherlessAdapter,
        # Add more adapters as needed
    }
    
    adapter_class = adapters.get(provider)
    if not adapter_class:
        logger.log_warning(f"Unsupported provider: {provider}, falling back to KoboldCPP")
        adapter_class = KoboldCppAdapter
        
    return adapter_class(logger)