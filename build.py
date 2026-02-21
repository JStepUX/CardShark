import os
import sys
import subprocess
import signal
from pathlib import Path
import shutil
import time
from datetime import datetime
import traceback

BASE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = BASE_DIR / 'backend'
FRONTEND_DIR = BASE_DIR / 'frontend'

def log(message, level="INFO"):
    """Enhanced logging with levels, timestamps, and file logging"""
    timestamp = datetime.now().strftime("%H:%M:%S")
    formatted_message = f"[BUILD][{timestamp}][{level}] {message}"
    
    print(formatted_message)
    
    # Log to file
    log_dir = Path("logs")
    log_dir.mkdir(exist_ok=True)
    log_file = log_dir / f"build_{datetime.now().strftime('%Y%m%d')}.log"
    
    try:
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(formatted_message + "\n")
    except Exception as e:
        print(f"[BUILD][{timestamp}][ERROR] Failed to write to log: {e}")

def log_subprocess(cmd, result, level="DEBUG"):
    """Helper to log subprocess results"""
    log(f"Running command: {cmd}", level)
    if result.stdout:
        log(f"STDOUT:\n{result.stdout}", level)
    if result.stderr:
        log(f"STDERR:\n{result.stderr}", level)
    log(f"Return code: {result.returncode}", level)

def check_npm():
    """Basic npm check"""
    try:
        log("Checking for npm...")
        result = subprocess.run('npm --version', 
                              shell=True,
                              capture_output=True, 
                              text=True,
                              timeout=30)  # Add timeout
        if result.returncode == 0:
            log(f"Found npm version: {result.stdout.strip()}")
            return True
        else:
            log(f"npm check failed: {result.stderr}")
            return False
    except subprocess.TimeoutExpired:
        log("npm check timed out")
        return False
    except Exception as e:
        log(f"npm check failed: {str(e)}")
        return False

def build_frontend(clean=False):
    """Build frontend for production with improved directory handling"""
    original_dir = os.getcwd()
    try:
        # Get absolute path to frontend directory
        frontend_dir = Path('frontend').resolve()
        if not frontend_dir.exists():
            log("Frontend directory not found!", "ERROR")
            return False
            
        # Log current state
        log(f"Building frontend from {frontend_dir}")
        log(f"Current directory before: {os.getcwd()}")
        
        # Change to frontend directory
        os.chdir(frontend_dir)
        log(f"Changed to: {os.getcwd()}")
        
        # Install dependencies
        log("Installing frontend dependencies...")
        install_result = subprocess.run('npm install', 
                                     shell=True,
                                     capture_output=True,
                                     text=True)
        if install_result.returncode != 0:
            log_subprocess('npm install', install_result, "ERROR")
            return False
            
        # Build for production
        log("Building frontend...")
        build_result = subprocess.run('npm run build',
                                    shell=True, 
                                    capture_output=True,
                                    text=True)
        if build_result.returncode != 0:
            log_subprocess('npm run build', build_result, "ERROR")
            return False
            
        # Verify dist directory was created
        dist_dir = frontend_dir / 'dist'
        if not dist_dir.exists():
            log("Frontend build failed - no dist directory created", "ERROR")
            return False
            
        log(f"Frontend build completed. Dist directory: {dist_dir}")
        return True
        
    except Exception as e:
        log(f"Frontend build failed: {str(e)}", "ERROR")
        log(traceback.format_exc(), "DEBUG")
        return False
        
    finally:
        # Always return to original directory
        os.chdir(original_dir)
        log(f"Restored working directory to: {os.getcwd()}")

def serve_dev():
    """Start development server"""
    try:
        frontend_dir = Path('frontend').absolute()
        
        if not frontend_dir.exists():
            log(f"Frontend directory not found at {frontend_dir}")
            return None
            
        # Change to frontend directory
        os.chdir(frontend_dir)
        
        log("Starting development server...")
        env = os.environ.copy()
        env['VITE_PORT'] = '6969'
        
        # Use npm run dev instead of npx vite directly
        process = subprocess.Popen(
            'npm run dev',
            shell=True,
            env=env,
            cwd=frontend_dir
        )
        
        # Give process time to start
        time.sleep(2)
        
        # Verify process is still running
        if process.poll() is not None:
            log("Server failed to start")
            return None
            
        return process
        
    except Exception as e:
        log(f"Development server failed to start: {str(e)}")
        return None

def serve_preview():
    """Start preview server"""
    try:
        frontend_dir = Path('frontend')
        log("Starting preview server...")
        env = os.environ.copy()
        env['VITE_PORT'] = '6969'
        
        process = subprocess.Popen(
            'npx vite preview --port 6969 --config vite.config.ts',
            shell=True,
            cwd=frontend_dir,
            env=env
        )
        return process
    except Exception as e:
        log(f"Preview server failed to start: {str(e)}")
        return None

def install_backend_deps():
    """Install Python backend dependencies"""
    try:
        log("Installing backend dependencies...")
        requirements = Path('backend/requirements.txt')
        
        if not requirements.exists():
            log("requirements.txt not found!")
            return False
            
        result = subprocess.run(
            [sys.executable, '-m', 'pip', 'install', '-r', str(requirements)],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            log(f"pip install failed: {result.stderr}")
            return False
            
        log("Backend dependencies installed successfully")
        return True
        
    except Exception as e:
        log(f"Failed to install backend dependencies: {str(e)}")
        return False

def clean_build():
    """Clean previous build artifacts"""
    try:
        log("Cleaning previous build artifacts...")
        # Clean directories that should be removed
        clean_paths = ['dist', 'build', '__pycache__', 'CardShark.spec']
        
        for path in clean_paths:
            if os.path.exists(path):
                if os.path.isfile(path):
                    os.remove(path)
                else:
                    shutil.rmtree(path)
                log(f"Removed {path}")
                
        return True
    except Exception as e:
        log(f"Clean failed: {str(e)}")
        return False

def discover_gallery_images():
    """Scan gallery_images directory and create manifest"""
    try:
        import json
        log("Discovering gallery images...", "INFO")
        gallery_dir = BASE_DIR / 'gallery_images'

        if not gallery_dir.exists():
            log("No gallery_images directory found, skipping gallery packing", "WARNING")
            return {}

        manifest = {}
        theme_dirs = [d for d in gallery_dir.iterdir() if d.is_dir()]

        for theme_dir in theme_dirs:
            theme_name = theme_dir.name
            images = []

            # Supported image formats
            for ext in ['*.png', '*.jpg', '*.jpeg', '*.webp']:
                images.extend(theme_dir.glob(ext))

            if images:
                manifest[theme_name] = [
                    {
                        'filename': img.name,
                        'path': f'gallery_images/{theme_name}/{img.name}',
                        'size': img.stat().st_size
                    }
                    for img in images
                ]
                log(f"Found {len(images)} images in theme '{theme_name}'", "DEBUG")

        # Write manifest to backend directory
        manifest_path = BASE_DIR / 'backend' / 'gallery_metadata.json'
        with open(manifest_path, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, indent=2)

        log(f"Gallery manifest created: {len(manifest)} themes, total images: {sum(len(v) for v in manifest.values())}", "INFO")
        return manifest

    except Exception as e:
        log(f"Failed to discover gallery images: {str(e)}", "ERROR")
        log(traceback.format_exc(), "ERROR")
        return {}

def create_spec_file():
    """Create PyInstaller spec file with complete dependencies"""
    try:
        log("Creating spec file...")
        spec_content = """# -*- mode: python ; coding: utf-8 -*-

import sys
import os
from pathlib import Path
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

block_cipher = None

# Collect all required data files
frontend_datas = [
    ('frontend/dist/*', 'frontend'),
    ('frontend/dist/assets/*', 'frontend/assets'),
    ('frontend/dist/sounds/*', 'frontend/sounds'),  # Sound effects for combat
]

backend_datas = [
    ('backend/*.py', 'backend'),
    ('backend/endpoints/*.py', 'backend/endpoints'),
    ('backend/handlers/*.py', 'backend/handlers'),
    ('backend/worldcards/*', 'backend/worldcards'),
    ('backend/models/*', 'backend/models'),    ('backend/utils/*', 'backend/utils'),
    ('backend/services/*.py', 'backend/services'),  # Add services directory for character_service
    ('backend/default_room.png', 'backend'),         # Add default room image
    ('backend/assets/defaults/*', 'backend/assets/defaults'),  # Default demo world NPC assets
    ('backend/gallery_metadata.json', 'backend'),    # Add gallery manifest
    ('content_filters/*.json', 'content_filters'),   # Add content filters JSON files
    ('content_filters/builtin/*.json', 'content_filters/builtin'),  # Add builtin filter packages
    ('uploads', 'uploads'),  # Add uploads directory
    # Note: Database file is now created/managed at runtime, not bundled
    # This ensures fresh installations start clean while preserving user data across updates
]

# Create empty KoboldCPP directory structure but don't include existing files
koboldcpp_dir = Path('KoboldCPP')
koboldcpp_dir.mkdir(exist_ok=True)
# No longer include the entire KoboldCPP directory which may contain large files
# koboldcpp_datas = [
#     ('KoboldCPP', 'KoboldCPP'),
# ]

# Collect gallery images dynamically
gallery_datas = []
gallery_dir = Path('gallery_images')
if gallery_dir.exists():
    for theme_dir in gallery_dir.iterdir():
        if theme_dir.is_dir():
            theme_name = theme_dir.name
            gallery_datas.append((f'gallery_images/{theme_name}/*', f'gallery_images/{theme_name}'))

# Combine all data files
all_datas = frontend_datas + backend_datas + gallery_datas

# Verified backend modules that exist in your project
hidden_imports = [    # Core FastAPI and dependencies
    'fastapi',
    'starlette',
    'pydantic',
    'requests',
    'uvicorn',
    'uvicorn.main',
    'uvicorn.config',
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.http.h11_impl',
    'uvicorn.protocols.http.httptools_impl',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.supervisors',
    'uvicorn.supervisors.multiprocess',
    '_strptime', # Explicitly add _strptime for datetime fix
    'datetime',  # Explicitly add datetime
    
    # HTTP libraries
    'h11',
    'h11._connection',
    'h11._events',
    'h11._state',
    'h11._util',
    'httptools',
    'httptools.parser',
    'httptools.parser.errors',# Process and file management
    'psutil',
    'psutil._psutil_windows',
    'psutil._pswindows',
    'psutil._psplatform',
    
    # Backend modules - synced with filesystem 2026-02-12
    'backend',
    'backend.api_handler',
    'backend.api_provider_adapters',
    'backend.background_handler',
    'backend.backyard_handler',
    'backend.batch_converter',
    'backend.character_validator',
    'backend.content_filter_manager',
    'backend.database',
    'backend.database_migrations',
    'backend.dependencies',
    'backend.enhanced_error_handling',
    'backend.error_handlers',
    'backend.errors',
    'backend.kobold_prompt_builder',
    'backend.koboldcpp_handler',
    'backend.koboldcpp_manager',
    'backend.log_manager',
    'backend.logit_shaper',
    'backend.lore_handler',
    'backend.network_server',
    'backend.png_debug_handler',
    'backend.png_handler',
    'backend.png_metadata_handler',
    'backend.response_models',
    'backend.schemas',
    'backend.settings_manager',
    'backend.sql_models',
    'backend.template_handler',
    'backend.world_asset_handler',

    # Endpoint modules (all in backend/endpoints/)
    'backend.endpoints',
    'backend.endpoints.adventure_log_endpoints',
    'backend.endpoints.background_endpoints',
    'backend.endpoints.character_endpoints',
    'backend.endpoints.character_image_endpoints',
    'backend.endpoints.chat_endpoints',
    'backend.endpoints.content_filter_endpoints',
    'backend.endpoints.file_upload_endpoints',
    'backend.endpoints.gallery_endpoints',
    'backend.endpoints.generation_endpoints',
    'backend.endpoints.health_endpoints',
    'backend.endpoints.lore_endpoints',
    'backend.endpoints.npc_room_assignment_endpoints',
    'backend.endpoints.room_card_endpoints',
    'backend.endpoints.room_card_serve_endpoints',
    'backend.endpoints.room_endpoints',
    'backend.endpoints.settings_endpoints',
    'backend.endpoints.template_endpoints',
    'backend.endpoints.user_endpoints',
    'backend.endpoints.world_asset_endpoints',
    'backend.endpoints.world_card_endpoints_v2',
    'backend.endpoints.world_progress_endpoints',

    # Handlers subdirectory
    'backend.handlers',
    'backend.handlers.background_api',
    'backend.handlers.character_image_handler',
    'backend.handlers.room_card_handler',
    'backend.handlers.world_card_chat_handler',
    'backend.handlers.world_chat_handler',

    # Services subdirectory
    'backend.services.adventure_log_service',
    'backend.services.character_indexing_service',
    'backend.services.character_lore_service',
    'backend.services.character_service',
    'backend.services.character_sync_service',
    'backend.services.chat_db_manager',
    'backend.services.chat_models',
    'backend.services.chat_service',
    'backend.services.database_chat_endpoint_adapters',
    'backend.services.default_world_service',
    'backend.services.image_storage_service',
    'backend.services.lore_activation_tracker',
    'backend.services.npc_room_assignment_service',
    'backend.services.reliable_chat_manager_db',
    'backend.services.room_service',
    'backend.services.summarization_service',
    'backend.services.user_profile_service',
    'backend.services.world_card_service',
    'backend.services.world_export_service',
    'backend.services.world_progress_service',
    'backend.services.world_service',

    # Models subdirectory
    'backend.models',
    'backend.models.adventure_log',
    'backend.models.character_data',
    'backend.models.folder_models',
    'backend.models.room_card',
    'backend.models.session_settings',
    'backend.models.world_card',
    'backend.models.world_data',
    'backend.models.world_progress',
    'backend.models.world_state',

    # Utils subdirectory
    'backend.utils',
    'backend.utils.constants',
    'backend.utils.cross_drive_static_files',
    'backend.utils.jsonl_chat_utils',
    'backend.utils.location_extractor',
    'backend.utils.path_utils',
    'backend.utils.user_dirs',
    'backend.utils.worldcard_location_utils',

    # Worldcards subdirectory
    'backend.worldcards',
    'backend.worldcards.errors',
    'backend.worldcards.storage',
    
    # Other important dependencies
    'email_validator',
    'typing_extensions',
    'packaging',
    
    # Database dependencies for migration system
    'sqlalchemy',
    'sqlalchemy.orm',
    'sqlalchemy.ext',
    'sqlalchemy.ext.declarative',
    'sqlalchemy.sql',
    'sqlalchemy.sql.func',
    'sqlite3',
]

# Add collections using collect_submodules
for module in ['PIL', 'requests', 'fastapi', 'starlette', 'pydantic', 'uvicorn', 'sqlalchemy', 'psutil', 'h11', 'httptools']:
    hidden_imports.extend(collect_submodules(module))

a = Analysis(
    ['backend/main.py'],
    pathex=[os.path.abspath('.')],
    binaries=[],
    datas=all_datas,
    hiddenimports=hidden_imports,
    hookspath=[os.path.abspath('.')],
    hooksconfig={},
    runtime_hooks=['hook-clean_old_mei.py', 'rthook_uvicorn_imports.py'],  # <-- Added runtime hooks
    excludes=['tkinter'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False
)

# Remove any duplicate files from the collection
unique_datas = list(set(a.datas))
a.datas = unique_datas

pyz = PYZ(
    a.pure, 
    a.zipped_data,
    cipher=block_cipher
)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,        # Include binaries
    a.zipfiles,        # Include zipfiles
    a.datas,          # Include datas
    [],
    name='CardShark',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='frontend/dist/cardshark.ico'
)"""
        
        with open('CardShark.spec', 'w') as f:
            f.write(spec_content)
        log("Spec file created successfully")
        return True
        
    except Exception as e:
        log(f"Failed to create spec file: {str(e)}")
        return False

def build_executable():
    try:
        main_py = BACKEND_DIR / 'main.py'
        frontend_dist = FRONTEND_DIR / 'dist'
        spec_file = BASE_DIR / 'CardShark.spec'
        content_filters_dir = BASE_DIR / 'content_filters'
        
        # Log the contents of the backend directory
        backend_files = list(BACKEND_DIR.glob('*.py'))
        log(f"Backend directory contents: {[f.name for f in backend_files]}", "DEBUG")
        
        # Check for content filter files
        content_filter_files = list(content_filters_dir.glob('*.json'))
        content_filter_builtin_files = list((content_filters_dir / 'builtin').glob('*.json'))
        log(f"Content filters: {[f.name for f in content_filter_files]}", "DEBUG")
        log(f"Content filters (builtin): {[f.name for f in content_filter_builtin_files]}", "DEBUG")
        
        if not main_py.exists():
            log(f"Error: main.py not found at {main_py}", "ERROR")
            return False
            
        if not frontend_dist.exists():
            log(f"Error: frontend dist not found at {frontend_dist}", "ERROR")
            return False
            
        # Create empty KoboldCPP directory if it doesn't exist
        # but don't include its contents in the build
        koboldcpp_dir = BASE_DIR / 'KoboldCPP'
        koboldcpp_dir.mkdir(exist_ok=True)
        log(f"Ensured KoboldCPP directory exists at {koboldcpp_dir}", "DEBUG")
            
        log("Creating executable...")
        cmd = f'pyinstaller "{spec_file}" --clean --workpath "{BASE_DIR / "build"}" --distpath "{BASE_DIR / "dist"}"'
        
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            cwd=BASE_DIR
        )
        
        log_subprocess(cmd, result)
        
        # Check for single file executable
        exe_path = BASE_DIR / 'dist' / 'CardShark.exe'
        if not exe_path.exists():
            log(f"Executable not found at {exe_path}", "ERROR")
            return False
            
        # Verify no _internal directory was created
        internal_dir = BASE_DIR / 'dist' / '_internal'
        if internal_dir.exists():
            log("Warning: _internal directory was created unexpectedly", "WARNING")
          # Create empty KoboldCPP directory in the dist folder
        dist_koboldcpp_dir = BASE_DIR / 'dist' / 'KoboldCPP'
        dist_koboldcpp_dir.mkdir(exist_ok=True)
        log(f"Created empty KoboldCPP directory in dist folder: {dist_koboldcpp_dir}", "DEBUG")
        
        # Create content_filters directory structure in the dist folder
        dist_content_filters_dir = BASE_DIR / 'dist' / 'content_filters'
        dist_content_filters_builtin_dir = dist_content_filters_dir / 'builtin'
        dist_content_filters_dir.mkdir(exist_ok=True)
        dist_content_filters_builtin_dir.mkdir(exist_ok=True)
        log(f"Created content_filters directories in dist folder", "DEBUG")
            
        log(f"Executable successfully created at {exe_path}")
        return True
        
    except Exception as e:
        log(f"Failed to build executable: {str(e)}", "ERROR")
        log(traceback.format_exc(), "ERROR")
        return False

def check_environment():
    """Enhanced environment checks"""
    try:
        cwd = Path.cwd().absolute()
        log(f"Working directory: {cwd}", "DEBUG")
        
        # Check Python
        log(f"Python: {sys.version}", "DEBUG")
        
        # Check npm
        npm_result = subprocess.run('npm --version', 
                                  shell=True,
                                  capture_output=True,
                                  text=True)
        if npm_result.returncode != 0:
            log("npm not found!", "ERROR")
            return False
            
        # Check PyInstaller  
        pyinstaller_result = subprocess.run('pyinstaller --version',
                                          shell=True,
                                          capture_output=True,
                                          text=True)
        if pyinstaller_result.returncode != 0:
            log("Installing PyInstaller...", "INFO")
            subprocess.run([sys.executable, "-m", "pip", "install", "pyinstaller"])
            
        return True
        
    except Exception as e:
        log(f"Environment check failed: {str(e)}", "ERROR")
        return False

def validate_paths():
    """Validate all paths needed for build"""
    paths = {
        'backend': BACKEND_DIR,
        'frontend': FRONTEND_DIR,
        'frontend_dist': FRONTEND_DIR / 'dist',
        'templates': BACKEND_DIR / 'templates',
        'content_filters': BASE_DIR / 'content_filters',
        'spec': BASE_DIR / 'CardShark.spec'
    }
    
    # Create content_filters directory and builtin subdirectory if they don't exist
    content_filters_dir = BASE_DIR / 'content_filters'
    content_filters_builtin_dir = content_filters_dir / 'builtin'
    
    if not content_filters_dir.exists():
        content_filters_dir.mkdir(exist_ok=True)
        log(f"Created missing content_filters directory at {content_filters_dir}", "INFO")
    
    if not content_filters_builtin_dir.exists():
        content_filters_builtin_dir.mkdir(exist_ok=True)
        log(f"Created missing content_filters/builtin directory at {content_filters_builtin_dir}", "INFO")
    
    for name, path in paths.items():
        if not path.exists():
            raise FileNotFoundError(f"Required path not found: {name} at {path}")
    
    log("All required paths validated")

def get_asset_path(relative_path):
    if getattr(sys, 'frozen', False):
        # Running in PyInstaller bundle
        base_path = sys._MEIPASS
    else:
        # Running in normal Python environment
        base_path = os.path.abspath(".")
    return os.path.join(base_path, relative_path)

icon_path = get_asset_path("frontend/dist/cardshark.ico")
placeholder_path = get_asset_path("frontend/dist/pngPlaceholder.png")

def build():
    """Main build process"""
    try:
        log("Starting build process")
        validate_paths()
        
        # Build frontend
        log("Building frontend...")
        subprocess.run(['npm', 'run', 'build'], cwd=FRONTEND_DIR, check=True)
        
        # Build backend using static spec
        log("Building backend...")
        subprocess.run([
            'pyinstaller',
            '--clean',
            '--noconfirm',
            'CardShark.spec'
        ], check=True)
        
        log("Build completed successfully")
        
    except Exception as e:
        log(f"Build failed: {str(e)}", "ERROR")
        log(traceback.format_exc(), "ERROR")
        sys.exit(1)

def main():
    """Main build process"""
    log("Starting CardShark build process...", "INFO")
    
    # Step 1: Environment Check
    if not check_environment():
        log("Environment check failed", "ERROR")
        sys.exit(1)
    log("Environment check passed", "INFO")
    
    # Step 2: Clean previous build
    if not clean_build():
        log("Clean failed", "ERROR")
        sys.exit(1)
    log("Clean completed", "INFO")
    
    # Step 3: Frontend Build
    log("Starting frontend build...", "INFO")
    if not build_frontend(clean=True):
        log("Frontend build failed", "ERROR")
        sys.exit(1)
    log("Frontend build completed", "INFO")
    
    # Step 4: Backend Dependencies
    log("Installing backend dependencies...", "INFO")
    if not install_backend_deps():
        log("Backend dependencies installation failed", "ERROR")
        sys.exit(1)
    log("Backend dependencies installed", "INFO")

    # Step 5: Discover Gallery Images
    log("Discovering gallery images...", "INFO")
    gallery_manifest = discover_gallery_images()
    if gallery_manifest:
        log(f"Gallery images discovered: {sum(len(v) for v in gallery_manifest.values())} total", "INFO")
    else:
        log("No gallery images found or discovery failed", "WARNING")

    # Step 6: Create Spec File
    log("Creating PyInstaller spec file...", "INFO")
    if not create_spec_file():
        log("Spec file creation failed", "ERROR")
        sys.exit(1)
    log("Spec file created", "INFO")

    # Step 7: Build Executable
    log("Building executable...", "INFO")
    if not build_executable():
        log("Executable build failed", "ERROR")
        sys.exit(1)
    log("Build process completed successfully!", "INFO")

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        log("Build interrupted by user", "WARNING")
        sys.exit(1)
    except Exception as e:
        log(f"Build failed: {str(e)}", "ERROR")
        log(traceback.format_exc(), "DEBUG")
        sys.exit(1)