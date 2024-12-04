# build_cardshark.py
import PyInstaller.__main__
import os
import shutil

def build_exe():
    # Get the current directory
    current_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Create dist and build folders if they don't exist
    os.makedirs('dist', exist_ok=True)
    os.makedirs('build', exist_ok=True)

    # Define the PyInstaller command
    PyInstaller.__main__.run([
        'cardshark.py',                          # Your main script
        '--name=CardShark',                      # Name of the executable
        '--onefile',                             # Create a single executable
        '--windowed',                            # Run without console window
        '--icon=cardshark.ico',                  # Application icon
        '--add-data=logo.png;.',                 # Include logo
        '--add-data=cardshark.ico;.',            # Include icon
        '--add-data=exiftool.exe;.',             # Include exiftool
        '--add-data=.ExifTool_config;.',         # Include ExifTool config
        '--add-data=icon_edit.png;.',            # Include edit icon
        '--add-data=icon_delete.png;.',          # Include delete icon
        '--hidden-import=PIL._tkinter_finder',   # Required PIL import
        '--clean',                               # Clean cache before building
        '--noconfirm',                           # Replace existing build without asking
    ])

    print("Build completed successfully!")

if __name__ == "__main__":
    build_exe()