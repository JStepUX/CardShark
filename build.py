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
    """Build frontend for production"""
    try:
        frontend_dir = Path('frontend')
        if not frontend_dir.exists():
            log("Frontend directory not found!", "ERROR")
            return False
            
        os.chdir(frontend_dir)
        
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
            
        os.chdir('..')
        return True
        
    except Exception as e:
        log(f"Frontend build failed: {str(e)}", "ERROR")
        log(traceback.format_exc(), "DEBUG")
        return False

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

def create_spec_file():
    """Create PyInstaller spec file with complete dependencies"""
    try:
        log("Creating spec file...")
        spec_content = """# -*- mode: python ; coding: utf-8 -*-
import sys
import os
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

block_cipher = None

a = Analysis(
    ['backend/main.py'],
    pathex=[os.path.abspath('.')],
    binaries=[],
    datas=[
        ('frontend/dist', 'frontend/dist'),
        ('backend/*.py', 'backend')  # Include all backend Python files
    ],
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.loops.auto',
        'uvicorn.protocols.http.auto',
        'uvicorn.lifespan.on',
        'backend',  # Include backend package
        'backend.log_manager',
        'backend.png_handler',
        'backend.json_handler',
        'backend.v2_handler',
        'backend.url_handler'
    ] + collect_submodules('PIL') 
      + collect_submodules('requests')
      + collect_submodules('fastapi')
      + collect_submodules('starlette')
      + collect_submodules('pydantic'),
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
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
    entitlements_file=None
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
        
        if not main_py.exists():
            log(f"Error: main.py not found at {main_py}", "ERROR")
            return False
            
        if not frontend_dist.exists():
            log(f"Error: frontend dist not found at {frontend_dist}", "ERROR")
            return False
            
        log("Creating executable...")
        cmd = f'pyinstaller "{spec_file}" --clean --workpath "{BASE_DIR / "build"}" --distpath "{BASE_DIR / "dist"}"'
        
        result = subprocess.run(
            cmd,
            shell=True,
            capture_output=True,
            text=True,
            cwd=BASE_DIR  # Execute from project root
        )
        
        log_subprocess(cmd, result)
        
        if result.returncode != 0:
            log("PyInstaller failed!", "ERROR")
            return False
            
        exe_path = BASE_DIR / 'dist' / 'CardShark.exe'
        return exe_path.exists()
        
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
        'spec': BASE_DIR / 'CardShark.spec'
    }
    
    for name, path in paths.items():
        if not path.exists():
            raise FileNotFoundError(f"Required path not found: {name} at {path}")
    
    log("All required paths validated")

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
    
    # Step 5: Create Spec File
    log("Creating PyInstaller spec file...", "INFO")
    if not create_spec_file():
        log("Spec file creation failed", "ERROR")
        sys.exit(1)
    log("Spec file created", "INFO")
    
    # Step 6: Build Executable
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