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
            
        # Different endpoints for different versions
        if '/api/extra/generate/stream' not in base_url and '/api/generate' not in base_url:
            # Append the appropriate endpoint if not already there
            return base_url.rstrip('/') + '/api/extra/generate/stream'
        return base_url
        
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
        # Combine generation settings with required fields
        data = {
            **generation_settings,
            "prompt": prompt,
            "memory": memory if memory else "",
            "stop_sequence": stop_sequence,
            "quiet": True,
            "trim_stop": True
        }
        return data
        
    def parse_streaming_response(self, line: bytes) -> Optional[Dict[str, Any]]:
        """Parse a streaming response line from KoboldCPP"""
        try:
            line_text = line.decode('utf-8')
            if line_text.startswith('data: '):
                # Extract the data portion (after "data: ")
                data_portion = line_text[6:]
                
                # Parse the response to ensure it's valid JSON
                try:
                    content = json.loads(data_portion)
                    
                    # Handle different response formats
                    if isinstance(content, str):
                        return {'content': content}
                    else:
                        return content
                except json.JSONDecodeError:
                    # If not valid JSON, just pass through the raw content
                    return {'content': data_portion}
            return None
        except Exception as e:
            self.logger.log_error(f"Error parsing KoboldCPP response: {e}")
            return None


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


def get_provider_adapter(provider: str, logger) -> ApiProviderAdapter:
    """Factory function to get the appropriate adapter for a provider"""
    adapters = {
        'KoboldCPP': KoboldCppAdapter,
        'OpenAI': OpenAIAdapter,
        'Claude': ClaudeAdapter,
        'OpenRouter': OpenRouterAdapter,
        # Add more adapters as needed
    }
    
    adapter_class = adapters.get(provider)
    if not adapter_class:
        logger.log_warning(f"Unsupported provider: {provider}, falling back to KoboldCPP")
        adapter_class = KoboldCppAdapter
        
    return adapter_class(logger)