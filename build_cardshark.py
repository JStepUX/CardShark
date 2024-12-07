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
            '.ExifTool_config',
            'icon_edit.png',
            'icon_delete.png',
            'icon_up.png',
            'icon_down.png'
        ],
        'ExifTool Files': [
            os.path.join('exiftool_files', 'exiftool.pl'),
            os.path.join('exiftool_files', 'perl.exe'),
            os.path.join('exiftool_files', 'perl532.dll'),
            os.path.join('exiftool_files', 'libgcc_s_dw2-1.dll'),
            os.path.join('exiftool_files', 'liblzma-5_.dll'),
            # Add MinGW DLL dependencies
            os.path.join('exiftool_files', 'libwinpthread-1.dll'),
            os.path.join('exiftool_files', 'libstdc++-6.dll')
        ]
    }
    
    missing_files = []
    for category, files in required_files.items():
        for file in files:
            if not os.path.exists(file):
                missing_files.append(f"{category}: {file}")
    
    return missing_files

def download_mingw_dlls():
    """Download required MinGW DLLs if missing."""
    mingw_dlls = [
        'libwinpthread-1.dll',
        'libstdc++-6.dll'
    ]
    
    dll_dir = os.path.join('exiftool_files')
    os.makedirs(dll_dir, exist_ok=True)
    
    print("\nChecking MinGW DLLs...")
    missing_dlls = []
    
    for dll in mingw_dlls:
        dll_path = os.path.join(dll_dir, dll)
        if not os.path.exists(dll_path):
            missing_dlls.append(dll)
    
    if missing_dlls:
        print("\nMissing DLLs that need to be copied from MinGW:")
        for dll in missing_dlls:
            print(f"- {dll}")
        print("\nPlease copy these DLLs from your MinGW installation (usually in C:\\MinGW\\bin)")
        print("to the exiftool_files directory.")
        return False
    
    return True

def copy_perl_libs():
    """Copy Perl library files to correct location."""
    perl_lib_src = os.path.join('exiftool_files', 'lib')
    if not os.path.exists(perl_lib_src):
        raise FileNotFoundError(f"Perl lib directory not found: {perl_lib_src}")
        
    perl_lib_dest = os.path.join('build', 'lib')
    os.makedirs(perl_lib_dest, exist_ok=True)
    
    for root, dirs, files in os.walk(perl_lib_src):
        for file in files:
            src_path = os.path.join(root, file)
            rel_path = os.path.relpath(src_path, perl_lib_src)
            dst_path = os.path.join(perl_lib_dest, rel_path)
            os.makedirs(os.path.dirname(dst_path), exist_ok=True)
            shutil.copy2(src_path, dst_path)

def build_exe():
    """Build CardShark executable with all dependencies."""
    print("Starting CardShark build process...")
    
    # Check MinGW DLLs first
    if not download_mingw_dlls():
        return
    
    # Check other requirements
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
    
    # Copy Perl libraries
    try:
        copy_perl_libs()
        print("Copied Perl libraries successfully")
    except Exception as e:
        print(f"Error copying Perl libraries: {e}")
        sys.exit(1)
    
    # Build PyInstaller command
    data_files = [
        ('logo.png', '.'),
        ('cardshark.ico', '.'),
        ('.ExifTool_config', '.'),
        ('icon_edit.png', '.'),
        ('icon_delete.png', '.'),
        ('icon_up.png', '.'),
        ('icon_down.png', '.'),
        ('exiftool_files/exiftool.pl', 'exiftool_files'),
        ('exiftool_files/perl.exe', 'exiftool_files'),
        ('exiftool_files/perl532.dll', 'exiftool_files'),
        ('exiftool_files/libgcc_s_dw2-1.dll', 'exiftool_files'),
        ('exiftool_files/liblzma-5_.dll', 'exiftool_files'),
        ('exiftool_files/libwinpthread-1.dll', 'exiftool_files'),
        ('exiftool_files/libstdc++-6.dll', 'exiftool_files'),
        ('exiftool_files/lib', 'exiftool_files/lib')
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