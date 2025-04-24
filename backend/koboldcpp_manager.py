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
    
    def launch(self) -> Dict[str, Any]:
        """Launch KoboldCPP"""
        try:
            if not self.exe_path or not os.path.isfile(self.exe_path):
                return {'status': 'error', 'message': 'KoboldCPP executable not found'}
            
            if self.is_running():
                return {'status': 'running', 'message': 'KoboldCPP is already running'}
            
            # Launch KoboldCPP
            logger.info(f"Launching KoboldCPP: {self.exe_path}")
            
            # Platform-specific launch configuration
            if platform.system() == 'Windows':
                # On Windows, use subprocess.Popen with detached process group
                self.process = subprocess.Popen(
                    [self.exe_path], 
                    creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
                    cwd=self.koboldcpp_dir,
                    shell=False,  # Don't use shell for security reasons
                    stderr=subprocess.PIPE,  # Capture stderr for debugging
                    stdout=subprocess.PIPE  # Capture stdout for debugging
                )
            else:
                # On Unix-like systems
                self.process = subprocess.Popen(
                    [self.exe_path], 
                    start_new_session=True,
                    cwd=self.koboldcpp_dir,
                    shell=False,  # Don't use shell for security reasons
                    stderr=subprocess.PIPE,  # Capture stderr for debugging
                    stdout=subprocess.PIPE  # Capture stdout for debugging
                )
                
            # Short wait to let the process start
            time.sleep(2)
            
            # Check if process is still running after the wait
            if self.process.poll() is not None:
                # Process terminated quickly - something went wrong
                stdout, stderr = self.process.communicate()
                error_message = stderr.decode('utf-8', errors='replace') if stderr else "Unknown error"
                logger.error(f"KoboldCPP process failed to start: {error_message}")
                return {
                    'status': 'error', 
                    'message': f"KoboldCPP process failed to start: {error_message[:200]}..." if len(error_message) > 200 else error_message
                }
            
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
        """Check if KoboldCPP is installed and running, launch if installed but not running"""
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
        
        # KoboldCPP exists but is not running
        return {
            'status': 'present', 
            'message': 'KoboldCPP is installed but not running', 
            'exe_path': self.exe_path,
            'is_running': False
        }
    
    def get_status(self) -> Dict[str, Any]:
        """Get the current status of KoboldCPP"""
        status = self.check_and_launch()
        return status

# Create a single instance of the manager
manager = KoboldCPPManager()