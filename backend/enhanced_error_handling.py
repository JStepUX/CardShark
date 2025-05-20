"""
Enhanced error handling for API providers
"""
import json
import requests

def create_connection_error_response(error_msg, provider=None):
    """
    Create a standardized connection error response with provider information
    
    Args:
        error_msg: The error message
        provider: The API provider that encountered the error
        
    Returns:
        Bytes formatted as SSE data
    """
    error_data = {
        'error': {
            'type': 'ConnectionError',
            'message': error_msg
        }
    }
    
    # Add provider info if available
    if provider:
        error_data['error']['provider'] = provider
    
    # Prefix with an explicit event type so the browser can dispatch `message` vs `error` separately
    return (
        f"event: error\n"
        f"data: {json.dumps(error_data, ensure_ascii=False)}\n\n"
    ).encode("utf-8")
