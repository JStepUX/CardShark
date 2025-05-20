import os
import sys
import subprocess
import time
from pathlib import Path

def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

def test_executable():
    """Test the CardShark executable."""
    print("Testing CardShark executable...")
    print("1. Starting the CardShark executable")
    
    # Get the executable path
    exe_path = Path("dist/CardShark.exe")
    if not exe_path.exists():
        print(f"Error: Executable not found at {exe_path.absolute()}")
        return False
    
    # Start the executable as a separate process
    try:
        print(f"Starting: {exe_path}")
        process = subprocess.Popen(str(exe_path), shell=True)
        print("Executable started. Process ID:", process.pid)
        
        # Give the server a few seconds to start
        print("Waiting for the server to start...")
        time.sleep(5)
        
        # Run a curl command to test the API
        print("2. Testing API connection")
        health_check = subprocess.run(
            "curl -s http://localhost:8000/api/health",
            shell=True,
            capture_output=True,
            text=True
        )
        
        if health_check.returncode == 0 and "status" in health_check.stdout:
            print("Health check successful:")
            print(health_check.stdout)
        else:
            print("Health check failed:")
            print("Return code:", health_check.returncode)
            print("Output:", health_check.stdout)
            print("Error:", health_check.stderr)
            return False
        
        # Test character endpoints
        print("3. Testing character endpoints")
        characters_check = subprocess.run(
            "curl -s http://localhost:8000/api/characters",
            shell=True,
            capture_output=True,
            text=True
        )
        
        if characters_check.returncode == 0:
            print("Characters endpoint check successful")
        else:
            print("Characters endpoint check failed:")
            print("Return code:", characters_check.returncode)
            print("Output:", characters_check.stdout)
            print("Error:", characters_check.stderr)
            return False
        
        # Kill the process to clean up
        print("4. Shutting down the executable")
        process.terminate()
        time.sleep(2)
        
        # Check if process is still running
        if process.poll() is None:
            print("Process did not terminate gracefully, force killing...")
            process.kill()
            time.sleep(1)
        
        print("Test completed successfully!")
        return True
        
    except Exception as e:
        print(f"Error during test: {e}")
        return False

if __name__ == "__main__":
    clear_screen()
    test_executable()
