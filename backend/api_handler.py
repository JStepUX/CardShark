import requests # type: ignore
from typing import Dict, Optional, Tuple

class ApiHandler:
    def __init__(self, logger):
        self.logger = logger
        
    def test_connection(self, url: str, api_key: Optional[str] = None) -> Tuple[bool, Optional[str]]:
        """Test connection to KoboldCPP API."""
        try:
            # Ensure URL has protocol
            if not url.startswith(('http://', 'https://')):
                url = f'http://{url}'
                
            self.logger.log_step(f"Testing connection to {url}")
            
            # Prepare headers
            headers = {}
            if api_key:
                headers['Authorization'] = f'Bearer {api_key}'
            
            response = requests.get(f'{url}/api/v1/model', headers=headers, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                self.logger.log_step(f"Connection successful. Model info: {data}")
                return True, None
            else:
                error = f"Connection failed with status {response.status_code}"
                self.logger.log_warning(error)
                return False, error
                
        except requests.RequestException as e:
            error = f"Connection error: {str(e)}"
            self.logger.log_error(error)
            return False, error
            
        except Exception as e:
            error = f"Unexpected error: {str(e)}"
            self.logger.log_error(error)
            return False, error
            
    def format_message(self, template: str, message: str, context: Optional[Dict] = None) -> str:
        """Format message according to selected template."""
        # Will implement template formatting here once we have the template formats
        # For now, return basic format
        return f"Please help me with this: {message}"