import sys
import os
import time
import webbrowser
from threading import Thread
import signal
import uvicorn
import subprocess
import shutil  # Import shutil for rmtree
from fastapi import FastAPI
import tempfile  # Import tempfile for getting temp directory

app = FastAPI()

@app.get("/api/health")
async def health_check():
    return {"status": "ok"}

def check_npm():
    try:
        # Print current working directory for debugging
        print(f"Checking npm from: {os.getcwd()}")
        result = subprocess.run(["npm", "--version"], 
                              stdout=subprocess.PIPE, 
                              stderr=subprocess.PIPE, 
                              check=True,
                              shell=True)  # Add shell=True for Windows
        print(f"npm version: {result.stdout.decode().strip()}")
        return True
    except Exception as e:
        print(f"Error checking npm: {str(e)}")
        return False

def install_frontend_deps(root_dir):
    frontend_dir = os.path.join(root_dir, "frontend")
    if not os.path.exists(os.path.join(frontend_dir, "node_modules")):
        print("Installing frontend dependencies...")
        os.chdir(frontend_dir)
        subprocess.run(["npm", "install"], check=True)
        os.chdir(root_dir)

def install_backend_deps(root_dir):
    backend_dir = os.path.join(root_dir, "backend")
    requirements_file = os.path.join(backend_dir, "requirements.txt")
    if os.path.exists(requirements_file):
        print("Installing backend dependencies...")
        subprocess.run([sys.executable, "-m", "pip", "install", "-r", requirements_file], check=True)

def run_backend():
    try:
        # Change to backend directory
        backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend')
        os.chdir(backend_dir)
        
        # Add to Python path
        if backend_dir not in sys.path:
            sys.path.insert(0, backend_dir)
        
        # Run uvicorn with correct module path
        uvicorn.run(
            "main:app",
            host="127.0.0.1",
            port=9696,
            reload=False
        )
    except Exception as e:
        print(f"Backend server error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

def run_frontend(root_dir):
    frontend_dir = os.path.join(root_dir, "frontend")
    os.chdir(frontend_dir)
    subprocess.run(["npm", "run", "dev"], shell=True, check=True)

def signal_handler(signum, frame):
    print("\nShutting down...")
    sys.exit(0)

def clean_pycache(directory):
    """Recursively find and remove __pycache__ directories."""
    for root, dirs, files in os.walk(directory):
        if "__pycache__" in dirs:
            pycache_path = os.path.join(root, "__pycache__")
            print(f"Removing cache directory: {pycache_path}")
            try:
                shutil.rmtree(pycache_path)
            except OSError as e:
                print(f"Error removing {pycache_path}: {e}")

def clean_mei_folders(max_age_hours=1):
    """Find and remove _MEI folders in the temp directory that are older than specified hours."""
    try:
        temp_dir = tempfile.gettempdir()
        print(f"Checking for old _MEI folders in: {temp_dir}")
        now = time.time()
        count = 0
        
        for item in os.listdir(temp_dir):
            if item.startswith("_MEI"):
                folder_path = os.path.join(temp_dir, item)
                if os.path.isdir(folder_path):
                    # Check if folder is older than max_age_hours
                    modified_time = os.path.getmtime(folder_path)
                    age_hours = (now - modified_time) / 3600  # Convert seconds to hours
                    
                    if age_hours > max_age_hours:
                        print(f"Removing old _MEI folder: {folder_path} (Age: {age_hours:.1f} hours)")
                        try:
                            shutil.rmtree(folder_path)
                            count += 1
                        except (PermissionError, OSError) as e:
                            print(f"Could not remove {folder_path}: {e}")
        
        if count > 0:
            print(f"Removed {count} old _MEI folder(s)")
        else:
            print("No old _MEI folders found to clean up")
            
    except Exception as e:
        print(f"Error while cleaning _MEI folders: {e}")

def main():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    os.environ['PYTHONPATH'] = root_dir  # Set PYTHONPATH
    backend_dir = os.path.join(root_dir, 'backend') # Define backend_dir earlier

    # Clean _MEI folders from temp directory
    print("Cleaning old _MEI folders...")
    clean_mei_folders(max_age_hours=1)
    
    # Clean __pycache__ directories before starting
    print("Cleaning Python bytecode cache...")
    clean_pycache(backend_dir)
    print("Cache cleaning complete.")

    # Check and launch KoboldCPP using the new manager
    try:
        # Add the backend directory to Python path for imports
        # backend_dir = os.path.join(root_dir, 'backend') # Moved up
        if backend_dir not in sys.path:
            sys.path.insert(0, backend_dir)
            
        # Import and use the new KoboldCPP manager
        from backend.koboldcpp_manager import manager
        print("Checking KoboldCPP status...")
        status = manager.check_and_launch()
        
        if status['status'] == 'running':
            print("KoboldCPP is running")
        elif status['status'] == 'present':
            print(f"KoboldCPP is present but not running. {status.get('message', '')}")
        else:  # missing
            print("KoboldCPP is not installed. You can download it from the app settings.")
    except Exception as e:
        print(f"Error checking KoboldCPP: {e}")

    # Start backend
    backend_thread = Thread(target=run_backend)
    backend_thread.daemon = True
    backend_thread.start()
    
    print("Starting backend server...")
    time.sleep(2)  # Wait for backend
    
    # Open browser
    webbrowser.open('http://localhost:6969')
    
    # Run frontend (blocking)
    try:
        run_frontend(root_dir)
    except KeyboardInterrupt:
        print("\nShutting down...")
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    signal.signal(signal.SIGINT, lambda s, f: sys.exit(0))
    main()