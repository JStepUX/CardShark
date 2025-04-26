#!/usr/bin/env python
# Test script for restructured backend
import sys
import os
from pathlib import Path
import subprocess
import time
import requests
import json
import argparse

def print_header(message):
    """Print a header message in a visually distinct way."""
    print("\n" + "=" * 80)
    print(f" {message} ".center(80, "="))
    print("=" * 80 + "\n")

def check_endpoint(base_url, endpoint, method="GET", data=None, expected_status=200):
    """Test an endpoint and report the result."""
    url = f"{base_url}{endpoint}"
    print(f"Testing {method} {endpoint}...", end="")
    
    try:
        if method.upper() == "GET":
            response = requests.get(url, timeout=5)
        elif method.upper() == "POST":
            response = requests.post(url, json=data, timeout=5)
        else:
            print(f"ERROR: Unsupported method {method}")
            return False
        
        if response.status_code == expected_status:
            print(f"SUCCESS ({response.status_code})")
            try:
                # Try to parse JSON response
                json_resp = response.json()
                if "success" in json_resp:
                    print(f"  Response: {json_resp['success']}")
            except:
                # Not JSON or no success field
                pass
            return True
        else:
            print(f"FAILED (Got {response.status_code}, expected {expected_status})")
            try:
                print(f"  Error: {response.json()}")
            except:
                print(f"  Response: {response.text[:100]}...")
            return False
    except Exception as e:
        print(f"ERROR: {str(e)}")
        return False

def run_tests(base_url):
    """Run tests on restructured endpoints."""
    print_header("Testing Restructured Backend")
    
    # Check health endpoint
    check_endpoint(base_url, "/api/health")
    
    # Test character endpoints
    print_header("Testing Character Endpoints")
    if os.path.exists("./characters"):
        check_endpoint(base_url, "/api/characters?directory=./characters")
    
    # Test user endpoints
    print_header("Testing User Endpoints")
    check_endpoint(base_url, "/api/users")
    
    # Test settings endpoints
    print_header("Testing Settings Endpoints")
    check_endpoint(base_url, "/api/settings")
    check_endpoint(base_url, "/api/templates")
    
    # Test world endpoints
    print_header("Testing World Endpoints")
    check_endpoint(base_url, "/api/world-count")
    check_endpoint(base_url, "/api/world-cards")
    
    # Test chat endpoints
    print_header("Testing Chat Endpoints")
    # This requires a character, so we'll just check if the endpoint exists
    data = {"character_data": {"data": {"name": "Test"}}}
    check_endpoint(base_url, "/api/list-character-chats", method="POST", data=data, expected_status=200)
    
    print_header("Testing Complete")

def main():
    """Main entry point for the test script."""
    parser = argparse.ArgumentParser(description="Test restructured CardShark backend")
    parser.add_argument("-u", "--url", default="http://127.0.0.1:8000", help="Base URL of the CardShark server")
    parser.add_argument("-s", "--start", action="store_true", help="Start the server before testing")
    parser.add_argument("-f", "--file", default="main_reorg.py", help="The restructured main file to test")
    args = parser.parse_args()
    
    process = None
    try:
        if args.start:
            print_header("Starting CardShark Server")
            # Run the server in a subprocess
            main_file = Path("backend") / args.file
            if not main_file.exists():
                print(f"ERROR: File {main_file} not found")
                return 1
                
            cmd = [sys.executable, str(main_file)]
            print(f"Running command: {' '.join(cmd)}")
            process = subprocess.Popen(cmd)
            
            # Wait for server to start
            print("Waiting for server to start...")
            for i in range(10):
                try:
                    requests.get(f"{args.url}/api/health", timeout=2)
                    print("Server is up!")
                    break
                except:
                    print(".", end="", flush=True)
                    time.sleep(1)
            print()
        
        # Run tests
        run_tests(args.url)
        
    finally:
        # Clean up
        if process:
            print_header("Shutting down server")
            process.terminate()
            process.wait(timeout=5)
            print("Server shut down")

if __name__ == "__main__":
    sys.exit(main())