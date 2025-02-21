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
                    
                    # Detect template from response (this is handled elsewhere)
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

    def stream_generate(self, request_data: Dict) -> Generator[bytes, None, None]:
        """Stream generate tokens from the API."""
        try:
            api_config = request_data.get('api_config', {})
            generation_params = request_data.get('generation_params', {})

            url = api_config.get('url')
            api_key = api_config.get('apiKey')
            template = api_config.get('template')

            # Extract generation parameters with defaults
            prompt = generation_params.get('prompt')
            memory = generation_params.get('memory')
            n = generation_params.get('n', 1)
            max_context_length = generation_params.get('max_context_length', 6144)
            max_length = generation_params.get('max_length', 220)
            temperature = generation_params.get('temperature', 1.05)
            top_p = generation_params.get('top_p', 0.92)
            top_k = generation_params.get('top_k', 100)
            typical = generation_params.get('typical', 1)
            tfs = generation_params.get('tfs', 1)
            rep_pen = generation_params.get('rep_pen', 1.07)
            rep_pen_range = generation_params.get('rep_pen_range', 360)
            rep_pen_slope = generation_params.get('rep_pen_slope', 0.7)
            sampler_order = generation_params.get('sampler_order', [6, 0, 1, 3, 4, 2, 5])
            trim_stop = generation_params.get('trim_stop', True)
            min_p = generation_params.get('min_p', 0)
            dynatemp_range = generation_params.get('dynatemp_range', 0.45)
            dynatemp_exponent = generation_params.get('dynatemp_exponent', 1)
            smoothing_factor = generation_params.get('smoothing_factor', 0)
            banned_tokens = generation_params.get('banned_tokens', [])
            logit_bias = generation_params.get('logit_bias', {})
            presence_penalty = generation_params.get('presence_penalty', 0)
            render_special = generation_params.get('render_special', False)
            logprobs = generation_params.get('logprobs', False)
            use_default_badwordsids = generation_params.get('use_default_badwordsids', False)
            bypass_eos = generation_params.get('bypass_eos', False)
            stop_sequence = generation_params.get('stop_sequence', [
                "<|im_end|>\n<|im_start|>user",
                "<|im_end|>\n<|im_start|>assistant",
                "User:",
                "Assistant:"
            ])
            quiet = generation_params.get('quiet', True)

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

            # Prepare request data
            data = {
                "prompt": prompt,
                "memory": memory,
                "n": n,
                "max_context_length": max_context_length,
                "max_length": max_length,
                "temperature": temperature,
                "top_p": top_p,
                "top_k": top_k,
                "typical": typical,
                "tfs": tfs,
                "rep_pen": rep_pen,
                "rep_pen_range": rep_pen_range,
                "rep_pen_slope": rep_pen_slope,
                "sampler_order": sampler_order,
                "trim_stop": trim_stop,
                "min_p": min_p,
                "dynatemp_range": dynatemp_range,
                "dynatemp_exponent": dynatemp_exponent,
                "smoothing_factor": smoothing_factor,
                "banned_tokens": banned_tokens,
                "logit_bias": logit_bias,
                "presence_penalty": presence_penalty,
                "render_special": render_special,
                "logprobs": logprobs,
                "use_default_badwordsids": use_default_badwordsids,
                "bypass_eos": bypass_eos,
                "stop_sequence": stop_sequence,
                "quiet": quiet
            }

            self.logger.log_step("Starting streaming request with new payload format")
            
            # Make the streaming request
            with requests.post(url, headers=headers, json=data, stream=True) as response:
                if response.status_code != 200:
                    error_msg = f"Generation failed with status {response.status_code}"
                    yield f"data: {json.dumps({'error': {'message': error_msg}})}\n\n".encode('utf-8')
                    return

                for line in response.iter_lines():
                    if not line:
                        continue
                        
                    try:
                        line_text = line.decode('utf-8')
                        if line_text.startswith('data: '):
                            # Parse the response to ensure it's valid JSON
                            content = json.loads(line_text[6:])
                            # Format it consistently
                            if isinstance(content, str):
                                formatted_content = {'content': content}
                            else:
                                formatted_content = content
                                
                            # Send properly formatted SSE
                            yield f"data: {json.dumps(formatted_content)}\n\n".encode('utf-8')
                            
                    except json.JSONDecodeError as e:
                        self.logger.log_error(f"JSON decode error on line: {line_text}")
                        continue
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