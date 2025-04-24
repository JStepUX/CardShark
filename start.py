import sys
import os
import time
import webbrowser
from threading import Thread
import signal
import uvicorn
import subprocess
from fastapi import FastAPI

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

def main():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    os.environ['PYTHONPATH'] = root_dir  # Set PYTHONPATH

    # Check and launch KoboldCPP using the new manager
    try:
        # Add the backend directory to Python path for imports
        backend_dir = os.path.join(root_dir, 'backend')
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