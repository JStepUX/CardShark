import requests # type: ignore
import json
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

    def stream_generate(self, url: str, api_key: str, prompt: str) -> Generator[bytes, None, None]:
        """Stream generate tokens from the API."""
        try:
            # First try to wake the API
            wake_success, wake_error = self.wake_api(url, api_key)
            if not wake_success:
                error_msg = f"Failed to wake API: {wake_error}"
                self.logger.log_error(error_msg)
                yield f"data: {json.dumps({'error': error_msg})}\n\n".encode('utf-8')
                return

            if not url.startswith(('http://', 'https://')):
                url = f'http://{url}'
            url = url.rstrip('/') + '/v1/chat/completions'
            
            headers = {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream'
            }
            if api_key:
                headers['Authorization'] = f'Bearer {api_key}'

            data = {
                "messages": [
                    {"role": "user", "content": prompt}
                ],
                "max_tokens": 400,
                "temperature": 0.7,
                "stream": True
            }

            self.logger.log_step("Starting streaming request")
            with requests.post(url, headers=headers, json=data, stream=True) as response:
                if response.status_code != 200:
                    error_msg = f"Generation failed with status {response.status_code}"
                    try:
                        error_data = response.json()
                        if 'error' in error_data:
                            error_msg = f"{error_msg}: {error_data['error']}"
                    except:
                        pass
                    self.logger.log_error(error_msg)
                    yield f"data: {json.dumps({'error': error_msg})}\n\n".encode('utf-8')
                    return

                self.logger.log_step("Stream started successfully")
                for line in response.iter_lines():
                    if not line:
                        continue
                        
                    line = line.decode('utf-8')
                    if line.startswith('data: '):
                        try:
                            line = line[6:]  # Remove 'data: ' prefix
                            
                            if line.strip() == '[DONE]':
                                self.logger.log_step("Stream complete")
                                break
                                
                            chunk = json.loads(line)
                            if 'choices' in chunk and len(chunk['choices']) > 0:
                                delta = chunk['choices'][0].get('delta', {})
                                content = delta.get('content', '')
                                
                                if content:
                                    output = f"data: {json.dumps({'content': content})}\n\n"
                                    self.logger.log_step(f"Streaming chunk: {content}")
                                    yield output.encode('utf-8')
                                    
                        except json.JSONDecodeError as e:
                            self.logger.log_error(f"JSON decode error: {str(e)}")
                        except Exception as e:
                            self.logger.log_error(f"Stream processing error: {str(e)}")

        except Exception as e:
            error_msg = f"Stream generation failed: {str(e)}"
            self.logger.log_error(error_msg)
            yield f"data: {json.dumps({'error': error_msg})}\n\n".encode('utf-8')

    def get_model_info(self, url: str, api_key: Optional[str] = None) -> Optional[dict]:
        """Get model information from the API if available."""
        try:
            # Ensure URL has protocol
            if not url.startswith(('http://', 'https://')):
                url = f'http://{url}'
                
            url = url.rstrip('/') + '/v1/models'
            self.logger.log_step(f"Fetching model info from: {url}")
            
            headers = {'Content-Type': 'application/json'}
            if api_key:
                headers['Authorization'] = f'Bearer {api_key}'
            
            response = requests.get(
                url,
                headers=headers,
                timeout=5  # Short timeout since this is optional
            )
            
            self.logger.log_step(f"Models response status: {response.status_code}")
            
            if response.status_code == 200:
                data = response.json()
                self.logger.log_step(f"Models response data: {data}")
                
                if 'data' in data and len(data['data']) > 0:
                    model = data['data'][0]  # Get first/default model
                    model_info = {
                        'id': model.get('id'),
                        'owned_by': model.get('owned_by'),
                        'created': model.get('created')
                    }
                    self.logger.log_step(f"Extracted model info: {model_info}")
                    return model_info
            
            self.logger.log_step("No model info available")
            return None
            
        except requests.exceptions.RequestException as e:
            self.logger.log_step(f"Could not fetch model info: {str(e)}")
            return None
            
        except Exception as e:
            self.logger.log_error(f"Error getting model info: {str(e)}")
            return None