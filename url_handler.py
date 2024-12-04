import json
import urllib.request
import urllib.error
import tempfile
import os
import ssl
from PIL import Image
from io import BytesIO

# Try to import certifi, but don't fail if it's not available
try:
    import certifi # type: ignore
    HAS_CERTIFI = True
except ImportError:
    HAS_CERTIFI = False

class UrlHandler:
    def __init__(self, json_handler, json_text, lore_manager, status_var, logger):
        """Initialize URL Handler with required dependencies."""
        self.json_handler = json_handler
        self.json_text = json_text
        self.lore_manager = lore_manager
        self.status_var = status_var
        self.logger = logger
        self.temp_image_path = None
        
        # Create SSL context
        try:
            if HAS_CERTIFI:
                self.ssl_context = ssl.create_default_context(cafile=certifi.where())
                self.logger.log_step("Using certifi for SSL verification")
            else:
                # Fallback to a context that will work without certificates
                self.ssl_context = ssl.create_default_context()
                self.ssl_context.check_hostname = False
                self.ssl_context.verify_mode = ssl.CERT_NONE
                self.logger.log_step("Warning: certifi not available, SSL verification disabled")
        except Exception as e:
            self.logger.log_step(f"Warning: Could not create SSL context: {e}")
            # Ultimate fallback
            self.ssl_context = ssl._create_unverified_context()

        # Add this method to the UrlHandler class in url_handler.py

    def clean_backyard_url(self, url):
        """Clean and validate a Backyard.ai URL.
        Returns (cleaned_url, error_message). Error message is None if valid."""
        
        if not url:
            return None, "URL cannot be empty"
            
        # Strip whitespace and normalize
        url = url.strip()
        
        # Handle common copy/paste issues
        url = url.replace('\n', '').replace('\r', '')  # Remove newlines
        url = url.split('?')[0]  # Remove query parameters
        url = url.split('#')[0]  # Remove hash fragments
        
        # Extract character ID for validation
        parts = url.split('/')
        if len(parts) < 2:
            return None, "Invalid URL format"
            
        char_id = parts[-1]  # Get last part of URL
        
        # Validate basic URL format
        valid_domains = [
            'backyard.ai',
            'www.backyard.ai',
            'beta.backyard.ai'
        ]
        
        # Check if URL matches expected pattern
        import re
        url_pattern = f"^https?://({'|'.join(valid_domains)})/hub/character/[a-zA-Z0-9]+$"
        if not re.match(url_pattern, url):
            # Try to fix common issues
            if any(domain in url for domain in valid_domains):
                # Missing https
                if not url.startswith('http'):
                    url = 'https://' + url.split('://')[-1]
                # Fix double slashes
                url = re.sub(r'([^:])//+', r'\1/', url)
                # Recheck pattern
                if re.match(url_pattern, url):
                    return url, None
            return None, "Invalid Backyard.ai character URL format"
        
        # Validate character ID format
        if not re.match(r'^[a-zA-Z0-9]{20,32}$', char_id):
            return None, "Invalid character ID format"
            
        return url, None

    def extract_character_data(self, html_content):
        """Extract character data from the HTML response."""
        try:
            # Look for trpcState in the HTML
            start_marker = 'trpcState":'
            end_marker = ',"_sentryTraceData"'
            
            start_idx = html_content.find(start_marker)
            if start_idx == -1:
                raise ValueError("Could not find trpcState in response")
            
            # Find the end of the JSON object
            start_idx += len(start_marker)
            end_idx = html_content.find(end_marker, start_idx)
            if end_idx == -1:
                raise ValueError("Could not find end of trpcState data")
            
            # Extract and parse the JSON
            json_str = html_content[start_idx:end_idx].strip()
            data = json.loads(json_str)
            
            # Log raw data for debugging
            self.logger.log_step("Raw trpcState data:", data)
            
            # Navigate to character data
            queries = data.get('json', {}).get('queries', [])
            character_query = next(
                (q for q in queries if q.get('queryKey', [])[0] == ['hub', 'character', 'getCharacterById']),
                None
            )
            
            if not character_query:
                raise ValueError("Character data not found in response")
            
            character = character_query.get('state', {}).get('data', {}).get('character', {})
            
            # Log character data for debugging
            self.logger.log_step("Character data:", character)
            
            # Collect all image URLs
            image_urls = []
            if character.get('Images'):
                for image in character['Images']:
                    if 'imageUrl' in image:
                        image_urls.append(image['imageUrl'])
                        
            if character.get('backgroundImages'):
                for bg_image in character['backgroundImages']:
                    if 'imageUrl' in bg_image:
                        image_urls.append(bg_image['imageUrl'])
            
            # Log image URLs for debugging
            self.logger.log_step("Collected image URLs:", image_urls)
            
            # Get the first available image URL
            image_url = image_urls[0] if image_urls else None
            
            # Create V2 character data
            v2_data = {
                "spec": "chara_card_v2",
                "spec_version": "2.0",
                "data": {
                    "name": character.get('aiName', ''),
                    "display_name": character.get('aiDisplayName', ''),
                    "description": character.get('basePrompt', ''),
                    "personality": character.get('aiPersona', ''),
                    "first_mes": character.get('firstMessage', ''),
                    "mes_example": character.get('customDialogue', ''),
                    "scenario": character.get('scenario', ''),
                    "creator_notes": character.get('authorNotes', ''),
                    "tags": [tag.get('name') for tag in character.get('Tags', []) if 'name' in tag],
                    "imported_images": image_urls,
                    "character_book": {
                        "entries": [],
                        "name": "",
                        "description": "",
                        "scan_depth": 100,
                        "token_budget": 2048,
                        "recursive_scanning": False,
                        "extensions": {}
                    }
                }
            }
            
            # Log V2 data for debugging
            self.logger.log_step("Created V2 data:", v2_data)
            
            # Convert lorebook items if present
            if 'Lorebook' in character and 'LorebookItems' in character['Lorebook']:
                entries = []
                for idx, item in enumerate(character['Lorebook']['LorebookItems']):
                    entry = {
                        'keys': [k.strip() for k in item['key'].split(',')],
                        'content': item['value'],
                        'enabled': True,
                        'insertion_order': idx,
                        'position': 'after_char',
                        'selective': False,
                        'name': '',
                        'comment': '',
                        'extensions': {}
                    }
                    entries.append(entry)
                v2_data['data']['character_book']['entries'] = entries
            
            return v2_data, image_url
                
        except Exception as e:
            self.logger.log_step(f"Error extracting character data: {str(e)}")
            raise ValueError(f"Failed to extract character data: {str(e)}")
            
    def download_image(self, image_url):
        """Download the character image and save it temporarily."""
        try:
            # Create a Request object with headers
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            request = urllib.request.Request(image_url, headers=headers)
            
            # Download the image using our SSL context
            try:
                with urllib.request.urlopen(request, context=self.ssl_context) as response:
                    image_data = response.read()
            except urllib.error.URLError as e:
                raise ValueError(f"Failed to download image: Network error - {str(e)}")
            except Exception as e:
                raise ValueError(f"Failed to download image: {str(e)}")
                
            # Process image data...
            try:
                image = Image.open(BytesIO(image_data))
            except Exception as e:
                raise ValueError(f"Invalid image format or corrupted download: {str(e)}")
            
            # Convert to RGB if necessary
            try:
                if image.mode in ('RGBA', 'LA') or (image.mode == 'P' and 'transparency' in image.info):
                    background = Image.new('RGB', image.size, (255, 255, 255))
                    if image.mode == 'P':
                        image = image.convert('RGBA')
                    background.paste(image, mask=image.split()[-1])
                    image = background
                elif image.mode != 'RGB':
                    image = image.convert('RGB')
            except Exception as e:
                raise ValueError(f"Failed to convert image format: {str(e)}")
                    
            # Save as PNG
            try:
                with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as temp_file:
                    image.save(temp_file.name, 'PNG', optimize=True)
                    self.temp_image_path = temp_file.name
                    self.logger.log_step(f"Saved converted image to temporary PNG: {temp_file.name}")
                    
                return self.temp_image_path
                
            except Exception as e:
                raise ValueError(f"Failed to save converted image: {str(e)}")
                
        except Exception as e:
            self.logger.log_step(f"Error downloading image: {str(e)}")
            raise ValueError("Could not import character: The image download failed or was corrupted. Please try again later.")

    def import_from_url(self, url):
        """Import character data from a URL."""
        self.logger.start_operation("Import from URL")
        
        try:
            # Validate URL
            if not url.startswith('https://backyard.ai/hub/character/'):
                raise ValueError("Invalid URL. Must be a Backyard.ai character URL")
            
            # Create a Request object with headers
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
            request = urllib.request.Request(url, headers=headers)
            
            # Fetch the page content using our SSL context
            with urllib.request.urlopen(request, context=self.ssl_context) as response:
                html_content = response.read().decode('utf-8')
                
            self.logger.log_step("Successfully fetched URL content")
            
            # Extract character data and image URL
            v2_data, image_url = self.extract_character_data(html_content)
            
            if not v2_data:
                raise ValueError("No character data found")
            
            # Log data before updating UI
            self.logger.log_step("About to update UI with data:", v2_data)
                
            # Update UI with character data
            formatted_json = json.dumps(v2_data, indent=4, ensure_ascii=False)
            self.json_text.delete(1.0, "end-1c")
            self.json_text.insert(1.0, formatted_json)
            
            # Log before updating fields
            self.logger.log_step("About to update specific fields")
            
            # Update specific fields and lore table
            self.json_handler.update_specific_fields(v2_data)
            self.lore_manager.update_lore_table(v2_data)
            
            # Download image if available
            if image_url:
                image_path = self.download_image(image_url)
                
                # Get reference to PNG handler through json_handler
                png_handler = self.json_handler.png_handler
                if png_handler:
                    png_handler.current_file = image_path
                    png_handler.original_metadata = {}  # Reset metadata
                    png_handler.original_mode = 'RGB'  # Set default mode
                    
                self.status_var.set("Character imported successfully from URL")
                return image_path
                    
            self.status_var.set("Character imported successfully (no image)")
                
        except Exception as e:
            self.logger.log_step(f"Error importing from URL: {str(e)}")
            self.status_var.set(f"Error: {str(e)}")
            raise
            
        finally:
            self.logger.end_operation()
            
    def cleanup(self):
        """Clean up temporary files."""
        if self.temp_image_path and os.path.exists(self.temp_image_path):
            try:
                os.remove(self.temp_image_path)
                self.temp_image_path = None
                self.logger.log_step("Cleaned up temporary image file")
            except Exception as e:
                self.logger.log_step(f"Error cleaning up temp file: {str(e)}")