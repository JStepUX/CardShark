# .backend/ollama_handler.py
# OllamaHandler class for interacting with Ollama models
# Not yet wired up to the main app
import os
import sys
import requests
import json
import io
from typing import Dict, Optional, List, Generator, Any, Union
import asyncio
from pathlib import Path

class OllamaHandler:
    """Handles interactions with locally running Ollama models"""
    
    def __init__(self, logger):
        self.logger = logger
        self.base_url = "http://localhost:11434"  # Default Ollama API address
        self.api_version = "v1"
        
    def set_base_url(self, url: str) -> None:
        """Update the base URL for the Ollama API"""
        self.base_url = url.rstrip('/')
        self.logger.log_step(f"Ollama base URL set to: {self.base_url}")
    
    def get_api_url(self, endpoint: str) -> str:
        """Get the full URL for an API endpoint"""
        return f"{self.base_url}/api/{self.api_version}/{endpoint}"
    
    def list_models(self) -> Dict:
        """List all available models from Ollama"""
        try:
            url = self.get_api_url("tags")
            self.logger.log_step(f"Requesting models from Ollama at: {url}")
            
            response = requests.get(url, timeout=10)
            response.raise_for_status()
            
            data = response.json()
            self.logger.log_step(f"Found {len(data.get('models', []))} models")
            
            # Clean up model data to match our expected format
            models = []
            for model in data.get('models', []):
                models.append({
                    'id': model.get('name'),
                    'name': model.get('name'),
                    'modified_at': model.get('modified_at'),
                    'size': model.get('size'),
                    'digest': model.get('digest'),
                    'details': {
                        'family': model.get('family', 'unknown'),
                        'format': model.get('format', 'unknown'),
                        'parameter_size': model.get('parameter_size', 'unknown')
                    }
                })
            
            return {
                'success': True,
                'models': models
            }
            
        except requests.RequestException as e:
            self.logger.log_error(f"Error listing Ollama models: {str(e)}")
            return {
                'success': False,
                'error': str(e),
                'models': []
            }
    
    def test_connection(self) -> Dict:
        """Test connection to Ollama API"""
        try:
            # First check if we can connect to the base URL
            url = self.get_api_url("tags")
            self.logger.log_step(f"Testing connection to Ollama at: {url}")
            
            response = requests.get(url, timeout=5)
            response.raise_for_status()
            
            # Get model information
            models_data = response.json()
            model_count = len(models_data.get('models', []))
            
            self.logger.log_step(f"Successfully connected to Ollama. Found {model_count} models.")
            
            return {
                'success': True,
                'message': f"Connection successful. Found {model_count} models.",
                'model_count': model_count,
                'models': models_data.get('models', [])
            }
            
        except requests.RequestException as e:
            self.logger.log_error(f"Error connecting to Ollama: {str(e)}")
            return {
                'success': False,
                'message': f"Failed to connect to Ollama: {str(e)}"
            }
    
    def stream_generate(self, request_data: Dict) -> Generator[bytes, None, None]:
        """
        Stream generation from Ollama API with synchronous requests
        """
        try:
            # Extract parameters from request data
            api_config = request_data.get('api_config', {})
            generation_params = request_data.get('generation_params', {})
            
            model = api_config.get('model', 'mistral')
            temperature = api_config.get('generation_settings', {}).get('temperature', 0.7)
            prompt = generation_params.get('prompt', '')
            memory = generation_params.get('memory', '')
            stop_sequences = generation_params.get('stop_sequence', [])
            
            # Format prompt with system prompt (memory) if provided
            if memory:
                full_prompt = f"{memory}\n\n{prompt}"
            else:
                full_prompt = prompt
            
            # Prepare Ollama-specific generation parameters
            ollama_params = {
                "model": model,
                "prompt": full_prompt,
                "stream": True,
                "options": {
                    "temperature": temperature,
                    "stop": stop_sequences
                }
            }
            
            # Add other parameters based on generation_settings
            gen_settings = api_config.get('generation_settings', {})
            if 'top_p' in gen_settings:
                ollama_params["options"]["top_p"] = gen_settings.get('top_p')
            if 'top_k' in gen_settings:
                ollama_params["options"]["top_k"] = gen_settings.get('top_k')
            if 'max_length' in gen_settings:
                ollama_params["options"]["num_predict"] = gen_settings.get('max_length')
            
            self.logger.log_step(f"Sending generation request to Ollama for model: {model}")
            self.logger.log_step(f"Parameters: temperature={temperature}")
            
            url = self.get_api_url("generate")
            
            # Make streaming request using requests instead of aiohttp
            with requests.post(url, json=ollama_params, stream=True) as response:
                if response.status_code != 200:
                    error_msg = f"Generation failed with status {response.status_code}"
                    error_json = json.dumps({'error': {'message': error_msg}})
                    yield f"data: {error_json}\n\n".encode('utf-8')
                    return
                
                # Process streaming response
                buffer = ""
                for line in response.iter_lines():
                    if not line:
                        continue
                        
                    try:
                        line_text = line.decode('utf-8').strip()
                        if not line_text:
                            continue
                            
                        # Parse the JSON response from Ollama
                        data = json.loads(line_text)
                        
                        # Extract token text if present
                        if 'response' in data:
                            token = data['response']
                            buffer += token
                            
                            # Format as SSE with our expected format
                            formatted_content = {'content': token}
                            yield f"data: {json.dumps(formatted_content)}\n\n".encode('utf-8')
                        
                        # Handle completion
                        if data.get('done', False):
                            # Send final message with metadata
                            metadata = {
                                'total_duration': data.get('total_duration', 0),
                                'load_duration': data.get('load_duration', 0),
                                'sample_count': data.get('sample_count', 0),
                                'sample_duration': data.get('sample_duration', 0),
                                'prompt_tokens': data.get('prompt_eval_count', 0),
                                'completion_tokens': data.get('eval_count', 0)
                            }
                            
                            self.logger.log_step(f"Generation complete: {metadata['completion_tokens']} tokens")
                            self.logger.log_step(f"Total duration: {metadata['total_duration']/1e9:.2f}s")
                            
                            # Send completion message
                            yield b"data: [DONE]\n\n"
                            break
                            
                    except Exception as e:
                        self.logger.log_error(f"Error processing Ollama response: {str(e)}")
                        error_json = json.dumps({'error': {'message': f"Processing error: {str(e)}"}})
                        yield f"data: {error_json}\n\n".encode('utf-8')
                        continue
                        
        except Exception as e:
            self.logger.log_error(f"Stream generation failed: {str(e)}")
            error_json = json.dumps({'error': {'type': 'OllamaError', 'message': str(e)}})
            yield f"data: {error_json}\n\n".encode('utf-8')
            
    def pull_model(self, model_name: str) -> Dict:
        """
        Pull a model from Ollama's registry
        """
        try:
            url = self.get_api_url("pull")
            
            self.logger.log_step(f"Pulling model: {model_name}")
            
            # Make the request to pull the model
            response = requests.post(
                url, 
                json={"name": model_name},
                timeout=30  # Longer timeout as pulls can take time
            )
            
            if response.status_code == 200:
                self.logger.log_step(f"Started pulling model: {model_name}")
                return {
                    'success': True,
                    'message': f"Started pulling model: {model_name}"
                }
            else:
                error_text = response.text
                self.logger.log_error(f"Failed to pull model: {error_text}")
                return {
                    'success': False,
                    'message': f"Failed to pull model: {error_text}"
                }
                
        except Exception as e:
            self.logger.log_error(f"Error pulling model: {str(e)}")
            return {
                'success': False,
                'message': f"Error pulling model: {str(e)}"
            }
    
    def get_model_info(self, model_name: str) -> Dict:
        """
        Get detailed information about a specific model
        """
        try:
            # First check if model exists in list
            models_response = self.list_models()
            
            if not models_response['success']:
                return {
                    'success': False,
                    'message': "Failed to retrieve model list"
                }
            
            # Find the specific model
            model_info = None
            for model in models_response.get('models', []):
                if model.get('id') == model_name:
                    model_info = model
                    break
            
            if not model_info:
                return {
                    'success': False,
                    'message': f"Model '{model_name}' not found"
                }
            
            return {
                'success': True,
                'model': model_info
            }
            
        except Exception as e:
            self.logger.log_error(f"Error getting model info: {str(e)}")
            return {
                'success': False,
                'message': f"Error getting model info: {str(e)}"
            }