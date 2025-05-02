"""
KoboldCPP Manager - Handles detection, download, and launch of KoboldCPP
"""
import os
import sys
import subprocess
import signal
import requests
import zipfile
import shutil
import time
import json
import psutil
from pathlib import Path
from typing import Dict, Any, List, Optional, Tuple, Callable
import threading
import logging
import platform
import re

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("KoboldCPP Manager")

class KoboldCPPManager:
    """Manager for KoboldCPP integration"""
    
    def __init__(self):
        self.base_dir = self._get_base_dir()
        self.koboldcpp_dir = os.path.join(self.base_dir, 'KoboldCPP')
        self.models_dir = None  # Will be set when scan_models is called
        self.available_models = []  # List of available model files
        self.exe_path = None
        self.process = None
        self.current_version = None
        self.latest_version = None
        self.last_version_check = 0
        self.version_check_interval = 3600  # Check for updates once per hour
        
        # Platform-specific download URL
        try:
            self.latest_release_info = self._get_latest_release_info()
        except Exception as e:
            logger.warning(f"Could not fetch latest release info: {e}")
            self.latest_release_info = None
            
        self.download_url = self._get_platform_download_url()
        
        # Possible executable names, in order of preference
        self.exe_names = self._get_platform_exe_names()
        
        # Ensure KoboldCPP directory exists
        os.makedirs(self.koboldcpp_dir, exist_ok=True)
        
        # Find existing installation
        self._find_executable()
        
        # Get installed version
        if self.exe_path:
            self._get_installed_version()

    def _get_latest_release_info(self) -> Dict[str, Any]:
        """Get information about the latest release from GitHub"""
        try:
            response = requests.get(
                "https://api.github.com/repos/LostRuins/koboldcpp/releases/latest", 
                timeout=10
            )
            response.raise_for_status()
            release_info = response.json()
            self.latest_version = release_info['tag_name'].lstrip('v')
            logger.info(f"Latest KoboldCPP version: {self.latest_version}")
            self.last_version_check = time.time()
            return release_info
        except Exception as e:
            logger.warning(f"Failed to get latest release info: {e}")
            return None
    
    def _get_installed_version(self) -> str:
        """Get the installed version of KoboldCPP"""
        if not self.exe_path:
            self.current_version = None
            return None
            
        # Try to get version by running the executable with --version flag
        try:
            if platform.system() == 'Windows':
                # On Windows, use CREATE_NO_WINDOW to prevent console window from showing
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                result = subprocess.run(
                    [self.exe_path, "--version"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                    startupinfo=startupinfo,
                    cwd=self.koboldcpp_dir
                )
            else:
                result = subprocess.run(
                    [self.exe_path, "--version"],
                    capture_output=True,
                    text=True,
                    timeout=5,
                    cwd=self.koboldcpp_dir
                )
                
            if result.returncode == 0 and result.stdout:
                # Parse version from output like "KoboldCpp v1.89"
                match = re.search(r'v(\d+\.\d+(?:\.\d+)?)', result.stdout)
                if match:
                    self.current_version = match.group(1)
                    logger.info(f"Current KoboldCPP version: {self.current_version}")
                    return self.current_version
        except (subprocess.SubprocessError, Exception) as e:
            logger.warning(f"Could not determine installed version: {e}")
            
        # If running with --version fails, try to parse version from filename or default to None
        try:
            # For filenames like koboldcpp_1.89.exe
            match = re.search(r'(\d+\.\d+(?:\.\d+)?)', os.path.basename(self.exe_path))
            if match:
                self.current_version = match.group(1)
                logger.info(f"Parsed KoboldCPP version from filename: {self.current_version}")
                return self.current_version
        except Exception:
            pass
            
        self.current_version = None
        return None
        
    def check_for_updates(self, force: bool = False) -> Dict[str, Any]:
        """Check if updates are available for KoboldCPP"""
        now = time.time()
        
        # Check if we should query for updates (respect rate limiting)
        if force or self.latest_version is None or (now - self.last_version_check) > self.version_check_interval:
            self.latest_release_info = self._get_latest_release_info()
        
        # If we couldn't get version info
        if not self.latest_version or not self.current_version:
            return {
                'update_available': False,
                'current_version': self.current_version,
                'latest_version': self.latest_version,
                'can_check': self.latest_version is not None
            }
        
        # Compare versions (simple numeric comparison)
        try:
            current_parts = [int(p) for p in self.current_version.split('.')]
            latest_parts = [int(p) for p in self.latest_version.split('.')]
            
            # Pad with zeros if needed
            while len(current_parts) < len(latest_parts):
                current_parts.append(0)
            while len(latest_parts) < len(current_parts):
                latest_parts.append(0)
                
            update_available = latest_parts > current_parts
            
            return {
                'update_available': update_available,
                'current_version': self.current_version,
                'latest_version': self.latest_version,
                'can_check': True
            }
        except Exception as e:
            logger.warning(f"Error comparing versions: {e}")
            return {
                'update_available': False,
                'current_version': self.current_version,
                'latest_version': self.latest_version,
                'can_check': True,
                'error': str(e)
            }

    def _get_platform_download_url(self) -> str:
        """Get platform-specific download URL"""
        # Check GitHub API for latest release
        try:
            response = requests.get("https://api.github.com/repos/LostRuins/koboldcpp/releases/latest", timeout=10)
            response.raise_for_status()
            latest_release = response.json()
            latest_version = latest_release['tag_name']
            logger.info(f"Found latest KoboldCPP version: {latest_version}")
        except Exception as e:
            logger.warning(f"Could not determine latest version: {e}, using direct links")
            latest_version = "latest"  # Fallback
        
        # Get direct download links based on platform
        base_url = f"https://github.com/LostRuins/koboldcpp/releases/download/{latest_version}"
        
        if platform.system() == 'Windows':
            return f"{base_url}/koboldcpp.exe"
        elif platform.system() == 'Darwin':  # macOS
            if platform.machine() == 'arm64':  # Apple Silicon
                return f"{base_url}/koboldcpp_macos_arm64"
            else:  # Intel Mac
                return f"{base_url}/koboldcpp_macos"
        else:  # Linux
            return f"{base_url}/koboldcpp_linux"
    
    def _get_platform_exe_names(self) -> List[str]:
        """Get platform-specific executable names"""
        if platform.system() == 'Windows':
            return ['koboldcpp.exe', 'koboldcpp_win.exe', 'koboldcpp_x64.exe']
        elif platform.system() == 'Darwin':  # macOS
            return ['koboldcpp', 'koboldcpp_macos']
        else:  # Linux
            return ['koboldcpp', 'koboldcpp_linux']

    def _get_base_dir(self) -> str:
        """Get the base directory for the application"""
        if getattr(sys, 'frozen', False):
            # Running as compiled executable
            return os.path.dirname(sys.executable)
        else:
            # Running in development
            return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    
    def _find_executable(self) -> Optional[str]:
        """Find KoboldCPP executable in the installation directory"""
        for exe_name in self.exe_names:
            path = os.path.join(self.koboldcpp_dir, exe_name)
            if os.path.isfile(path):
                self.exe_path = path
                logger.info(f"Found KoboldCPP at: {path}")
                return path
        
        logger.info("KoboldCPP executable not found")
        return None
    
    def is_running(self) -> bool:
        """Check if KoboldCPP is currently running"""
        if not self.exe_path:
            return False
            
        # First, try to check with API endpoint
        try:
            response = requests.get("http://localhost:5001/api/v1/model", timeout=2)
            if response.status_code == 200:
                logger.info("KoboldCPP is running (API check)")
                return True
        except:
            # API not responding, check process list
            pass
            
        # Check for running process
        exe_name = os.path.basename(self.exe_path)
        
        for proc in psutil.process_iter(['name']):
            try:
                if proc.info['name'] and proc.info['name'].lower() == exe_name.lower():
                    logger.info(f"Found KoboldCPP process: {exe_name}")
                    return True
            except (psutil.NoSuchProcess, psutil.AccessDenied):
                continue
        
        return False
    
    def download(self, callback: Optional[Callable[[Dict[str, Any]], None]] = None) -> Dict[str, Any]:
        """
        Download and install KoboldCPP
        
        Callback function receives progress updates as:
        {
            'status': 'downloading'|'completed'|'error',
            'bytes_downloaded': int,
            'total_bytes': int,
            'percent': float
        }
        """
        try:
            # Delete any existing directory or file that would conflict
            if os.path.exists(self.koboldcpp_dir):
                try:
                    # Attempt to delete any existing files in the directory
                    for item in os.listdir(self.koboldcpp_dir):
                        item_path = os.path.join(self.koboldcpp_dir, item)
                        if os.path.isfile(item_path) or os.path.islink(item_path):
                            os.unlink(item_path)
                        elif os.path.isdir(item_path):
                            shutil.rmtree(item_path)
                    logger.info("Cleared existing KoboldCPP directory")
                except Exception as e:
                    logger.error(f"Error clearing KoboldCPP directory: {e}")
                    return {'status': 'error', 'error': f"Could not clear existing KoboldCPP directory: {str(e)}"}
            
            # Create the directory
            os.makedirs(self.koboldcpp_dir, exist_ok=True)
            
            # Determine target filename based on platform
            if platform.system() == 'Windows':
                target_filename = 'koboldcpp.exe'
            else:
                target_filename = 'koboldcpp'
                
            target_path = os.path.join(self.koboldcpp_dir, target_filename)
            
            # Download the executable directly
            logger.info(f"Downloading KoboldCPP from {self.download_url}")
            
            try:
                response = requests.get(self.download_url, stream=True, timeout=30)
                response.raise_for_status()
            except requests.exceptions.RequestException as e:
                logger.error(f"Error downloading KoboldCPP: {e}")
                return {'status': 'error', 'error': f"Download failed: {str(e)}"}
            
            total_length = int(response.headers.get('content-length', 0))
            downloaded = 0
            
            # Save the executable directly to the target path
            with open(target_path, 'wb') as f:
                for chunk in response.iter_content(chunk_size=4096):
                    if chunk:
                        f.write(chunk)
                        downloaded += len(chunk)
                        percent = 100 * downloaded / total_length if total_length > 0 else 0
                        
                        # Call the callback with progress info
                        if callback:
                            callback({
                                'status': 'downloading',
                                'bytes_downloaded': downloaded,
                                'total_bytes': total_length,
                                'percent': percent
                            })
                        
                        logger.debug(f"Downloaded {downloaded} of {total_length} bytes ({percent:.2f}%)")
            
            # Set permissions on Unix-like systems
            if platform.system() != 'Windows':
                try:
                    os.chmod(target_path, 0o755)  # rwxr-xr-x
                    logger.info(f"Set executable permissions on {target_path}")
                except Exception as e:
                    logger.error(f"Failed to set executable permissions: {e}")
                    return {'status': 'error', 'error': f"Failed to set executable permissions: {str(e)}"}
            
            # Update executable path
            self.exe_path = target_path
            
            logger.info("KoboldCPP downloaded and installed successfully")
            
            if callback:
                callback({
                    'status': 'completed', 
                    'exe_path': self.exe_path,
                    'percent': 100
                })
                
            return {
                'status': 'completed',
                'exe_path': self.exe_path
            }
            
        except Exception as e:
            logger.error(f"Error downloading KoboldCPP: {str(e)}")
            if callback:
                callback({'status': 'error', 'error': str(e)})
            return {'status': 'error', 'error': str(e)}
    
    def launch(self, model: Optional[str] = None, additional_params: Optional[List[str]] = None) -> Dict[str, Any]:
        """Launch KoboldCPP with optional model and additional parameters"""
        try:
            if not self.exe_path or not os.path.isfile(self.exe_path):
                return {'status': 'error', 'message': 'KoboldCPP executable not found'}
            
            if self.is_running():
                return {'status': 'running', 'message': 'KoboldCPP is already running'}
            
            # Get the KoboldCPP directory
            kobold_dir = os.path.dirname(self.exe_path)
            
            # Use absolute path for the executable to avoid any path resolution issues
            command = [self.exe_path]
            
            # Add model if specified
            if model:
                command += ["--model", model]
            
            # Add any additional parameters
            if additional_params:
                command += additional_params
            
            logger.info(f"Launching KoboldCPP with command: {' '.join(command)}")
            logger.info(f"Working directory: {kobold_dir}")
            
            # Platform-specific launch configuration
            if platform.system() == 'Windows':
                # On Windows, use subprocess.Popen with CREATE_NEW_CONSOLE flag to show the console
                # but don't capture output which can cause the process to hang
                self.process = subprocess.Popen(
                    command, 
                    creationflags=subprocess.CREATE_NEW_CONSOLE,
                    cwd=kobold_dir,  # Set working directory to KoboldCPP directory
                    shell=False,  # Don't use shell for security reasons
                    stderr=None,  # Don't capture stderr to avoid blocking
                    stdout=None   # Don't capture stdout to avoid blocking
                )
            else:
                # On Unix-like systems
                self.process = subprocess.Popen(
                    command, 
                    start_new_session=True,
                    cwd=kobold_dir,  # Set working directory to KoboldCPP directory
                    shell=False,  # Don't use shell for security reasons
                    stderr=None,  # Don't capture stderr
                    stdout=None   # Don't capture stdout
                )
                
            # Short wait to let the process start
            time.sleep(2)
            
            # Check if process is still running after the wait
            if self.process.poll() is not None:
                logger.error("KoboldCPP process failed to start or exited too quickly")
                return {
                    'status': 'error', 
                    'message': "KoboldCPP process failed to start or exited too quickly"
                }
            
            # Wait a bit longer to see if the API becomes available
            max_attempts = 10
            for attempt in range(max_attempts):
                try:
                    response = requests.get("http://localhost:5001/api/v1/model", timeout=2)
                    if response.status_code == 200:
                        logger.info(f"KoboldCPP API is responding after {attempt + 1} attempts")
                        break
                except:
                    logger.info(f"Waiting for KoboldCPP API to become available (attempt {attempt + 1}/{max_attempts})")
                    time.sleep(3)  # Wait 3 seconds between attempts
                
            logger.info("KoboldCPP launched successfully")
            return {
                'status': 'launched', 
                'message': 'KoboldCPP launched successfully',
                'pid': self.process.pid
            }
            
        except Exception as e:
            logger.error(f"Error launching KoboldCPP: {str(e)}")
            return {'status': 'error', 'message': f"Error launching KoboldCPP: {str(e)}"}
    
    def check_and_launch(self) -> Dict[str, Any]:
        """Check if KoboldCPP is installed and running, but don't auto-launch it"""
        # Check if executable exists
        if not self.exe_path:
            return {
                'status': 'missing', 
                'message': 'KoboldCPP is not installed', 
                'exe_path': '', 
                'is_running': False
            }
        
        # Check if already running
        if self.is_running():
            return {
                'status': 'running', 
                'message': 'KoboldCPP is running', 
                'exe_path': self.exe_path, 
                'is_running': True
            }
        
        # KoboldCPP exists but is not running - return status without launching
        return {
            'status': 'present', 
            'message': 'KoboldCPP is installed but not running', 
            'exe_path': self.exe_path,
            'is_running': False,
        }
    
    def get_status(self) -> Dict[str, Any]:
        """Get the current status of KoboldCPP"""
        status = self.check_and_launch()
        return status
    
    def scan_models_directory(self, models_dir: str) -> List[Dict[str, Any]]:
        """
        Scan a directory for compatible model files
        
        Args:
            models_dir: Path to the directory containing model files
            
        Returns:
            List of dictionaries with model information
        """
        logger.info(f"Scanning directory for models: {models_dir}")
        self.models_dir = models_dir
        self.available_models = []
        
        if not os.path.isdir(models_dir):
            logger.warning(f"Models directory does not exist: {models_dir}")
            return []
        
        # Common model extensions
        model_extensions = ['.gguf', '.bin', '.ggml', '.safetensors']
        
        # Walk through the directory and find model files
        for root, _, files in os.walk(models_dir):
            for file in files:
                file_path = os.path.join(root, file)
                file_ext = os.path.splitext(file_path)[1].lower()
                
                if file_ext in model_extensions:
                    relative_path = os.path.relpath(file_path, models_dir)
                    model_size_bytes = os.path.getsize(file_path)
                    model_size_gb = model_size_bytes / (1024 * 1024 * 1024)  # Convert to GB
                    
                    # Get last modified time
                    mod_time = os.path.getmtime(file_path)
                    mod_time_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(mod_time))
                    
                    model_info = {
                        'name': file,
                        'path': file_path,
                        'relative_path': relative_path,
                        'size_bytes': model_size_bytes,
                        'size_gb': round(model_size_gb, 2),
                        'last_modified': mod_time_str,
                        'extension': file_ext
                    }
                    
                    self.available_models.append(model_info)
                    logger.debug(f"Found model: {file} ({round(model_size_gb, 2)} GB)")
        
        logger.info(f"Found {len(self.available_models)} models")
        return self.available_models
    
    def get_available_models(self) -> List[Dict[str, Any]]:
        """Get the list of available models"""
        return self.available_models
    
    def launch_with_model(self, model_path: str, config: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Launch KoboldCPP with a specific model and configuration
        
        Args:
            model_path: Path to the model file
            config: Dictionary of configuration options
                Supported keys:
                - contextsize: int - Context size for the model
                - threads: int - Number of threads to use
                - gpulayers: int - Number of GPU layers to use
                - usecublas: bool - Whether to use CuBLAS for GPU acceleration
                - usevulkan: bool - Whether to use Vulkan for GPU acceleration
                - usecpu: bool - Whether to use CPU only
                - port: int - Port to listen on
                - defaultgenamt: int - Default generation amount
                - multiuser: int - Max number of users for multiuser mode
                
        Returns:
            Dictionary with status information
        """
        # Import settings manager here to avoid circular imports
        try:
            from backend.main import settings_manager
            api_settings = settings_manager.get_setting("apis")
            
            # Try to find KoboldCPP API settings
            kobold_config = None
            if api_settings and isinstance(api_settings, dict):
                for api_id, api_config in api_settings.items():
                    # Fix: Check for both "kobold" and "KoboldCPP" provider names (case-insensitive)
                    provider = api_config.get("provider", "").lower()
                    if provider == "kobold" or provider == "koboldcpp":
                        kobold_config = api_config
                        break
            
            # Get generation settings if available
            if kobold_config and kobold_config.get("generation_settings"):
                gen_settings = kobold_config["generation_settings"]
                # Default configuration with values from API settings
                default_config = {
                    'contextsize': gen_settings.get("max_context_length", 4096),
                    'port': 5001,
                    'defaultgenamt': gen_settings.get("max_length", 128)
                }
                logger.info(f"Using API settings for KoboldCPP: contextsize={default_config['contextsize']}, defaultgenamt={default_config['defaultgenamt']}")
            else:
                # Fallback to defaults if settings not found
                default_config = {
                    'contextsize': 4096,
                    'port': 5001,
                    'defaultgenamt': 128
                }
                logger.info("Using default settings for KoboldCPP")
        except Exception as e:
            logger.warning(f"Could not load API settings: {e}, using defaults")
            # Default configuration
            default_config = {
                'contextsize': 4096,
                'port': 5001,
                'defaultgenamt': 128
            }
        
        # Merge with provided config - if config is provided, it overrides the API settings
        params = default_config.copy()
        if config:
            # Only update with non-None values from config
            for key, value in config.items():
                if value is not None:
                    params[key] = value
            logger.info(f"Using merged configuration settings: {params}")
        
        # Build command-line arguments
        additional_params = []
        
        # Add all parameters
        for key, value in params.items():
            if isinstance(value, bool) and value:
                additional_params.append(f"--{key}")
            elif not isinstance(value, bool) and value is not None:
                additional_params.append(f"--{key}")
                additional_params.append(str(value))
        
        # Add skiplauncher parameter to avoid GUI
        if '--skiplauncher' not in additional_params:
            additional_params.append('--skiplauncher')
        
        # Launch with model and additional parameters
        return self.launch(model=model_path, additional_params=additional_params)
    
    def get_recommended_config(self, model_size_gb: float) -> Dict[str, Any]:
        """
        Get recommended configuration settings based on model size
        
        Args:
            model_size_gb: Size of the model in GB
            
        Returns:
            Dictionary with recommended configuration settings
        """
        config = {}
        
        # Context size recommendations
        if model_size_gb <= 4:
            config['contextsize'] = 8192
        elif model_size_gb <= 7:
            config['contextsize'] = 4096
        elif model_size_gb <= 13:
            config['contextsize'] = 2048
        else:
            config['contextsize'] = 1024
            
        # GPU acceleration based on model size
        if model_size_gb > 10:
            # Try to use GPU acceleration for larger models if possible
            config['usevulkan'] = True
            config['gpulayers'] = -1  # Auto-detect
        
        # Thread recommendations based on system
        import multiprocessing
        cpu_count = multiprocessing.cpu_count()
        config['threads'] = min(8, max(4, cpu_count - 2))  # Leave some cores for the system
        
        # Generation amount based on context
        config['defaultgenamt'] = min(256, config['contextsize'] // 16)
        
        return config

    def cleanup_orphaned_mei_directories(self) -> Dict[str, Any]:
        """
        Clean up orphaned _MEI directories in temp folder
        
        Returns:
            Dictionary with status information including number of directories cleaned
        """
        try:
            import tempfile
            import shutil
            import time
            
            now = time.time()
            tmp_dir = tempfile.gettempdir()
            logger.info(f"Cleaning orphaned _MEI folders in: {tmp_dir}")

            cleaned_count = 0
            skipped_count = 0
            
            for folder in os.listdir(tmp_dir):
                if folder.startswith("_MEI"):
                    path = os.path.join(tmp_dir, folder)
                    try:
                        if os.path.isdir(path):
                            # We'll clean up all _MEI folders regardless of age 
                            # since we're explicitly doing this before launching KoboldCPP
                            logger.info(f"Removing orphaned folder: {path}")
                            shutil.rmtree(path)
                            cleaned_count += 1
                    except FileNotFoundError:
                        # Folder might have been deleted by another process
                        logger.debug(f"Folder not found during cleanup (likely already removed): {path}")
                    except PermissionError:
                        # If folder is in use, skip it
                        logger.debug(f"Permission denied trying to remove: {path} (likely in use)")
                        skipped_count += 1
                    except Exception as e:
                        # Catch other potential errors during removal
                        logger.warning(f"Error removing {path}: {e}")
                        skipped_count += 1
            
            logger.info(f"Cleaned up {cleaned_count} orphaned _MEI folders. Skipped {skipped_count} folders.")
            
            return {
                'success': True,
                'cleaned_count': cleaned_count,
                'skipped_count': skipped_count,
                'message': f"Cleaned up {cleaned_count} orphaned _MEI folders."
            }
        except Exception as e:
            logger.error(f"Error during cleanup process: {e}")
            return {
                'success': False,
                'error': str(e),
                'message': f"Error cleaning up orphaned _MEI folders: {str(e)}"
            }

# Create a single instance of the manager
manager = KoboldCPPManager()