import os
import sys
import shutil
import subprocess
from pathlib import Path

def check_requirements():
    """Check if all required files exist."""
    required_files = {
        'Core Files': [
            'cardshark.py',
            'cardshark.ico',
            'logo.png',
            'icon_edit.png',
            'icon_delete.png',
            'icon_up.png',
            'icon_down.png'
        ]
    }
    
    missing_files = []
    for category, files in required_files.items():
        for file in files:
            if not os.path.exists(file):
                missing_files.append(f"{category}: {file}")
    
    return missing_files

def build_exe():
    """Build CardShark executable with all dependencies."""
    print("Starting CardShark build process...")
    
    # Check requirements
    missing = check_requirements()
    if missing:
        print("\nError: Missing required files:")
        for file in missing:
            print(f"- {file}")
        sys.exit(1)
    
    # Clean previous build
    for dir in ['build', 'dist']:
        if os.path.exists(dir):
            shutil.rmtree(dir)
            print(f"Cleaned {dir} directory")
    
    # Create build directory structure
    os.makedirs('build', exist_ok=True)
    
    # Build PyInstaller command
    data_files = [
        ('logo.png', '.'),
        ('cardshark.ico', '.'),
        ('icon_edit.png', '.'),
        ('icon_delete.png', '.'),
        ('icon_up.png', '.'),
        ('icon_down.png', '.')
    ]
    
    cmd = ['pyinstaller', '--clean', '--noconfirm', '--onefile', '--windowed',
           '--icon=cardshark.ico', '--name=CardShark']
    
    # Add data files
    for src, dst in data_files:
        cmd.append(f'--add-data={src};{dst}')
    
    # Add hidden imports
    cmd.extend([
        '--hidden-import=PIL._tkinter_finder',
        'cardshark.py'
    ])
    
    try:
        subprocess.run(cmd, check=True)
        print("\nBuild completed successfully!")
        
        # Verify output
        exe_path = os.path.join('dist', 'CardShark.exe')
        if os.path.exists(exe_path):
            print(f"\nExecutable created: {exe_path}")
            print(f"Size: {os.path.getsize(exe_path) / 1024 / 1024:.1f} MB")
        else:
            print("\nError: Executable not found after build")
            
    except subprocess.CalledProcessError as e:
        print(f"\nBuild failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    build_exe()