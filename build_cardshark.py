# build_cardshark.py
import PyInstaller.__main__
import os
import sys

def build_exe():
    # Get the current directory
    current_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Create dist and build folders if they don't exist
    os.makedirs('dist', exist_ok=True)
    os.makedirs('build', exist_ok=True)

    # Collect all ExifTool-related files
    exiftool_files = []
    for file in os.listdir(current_dir):
        if file.startswith('perl5') or file == 'exiftool.exe' or file == '.ExifTool_config':
            exiftool_files.append((os.path.join(current_dir, file), '.'))

    # Convert exiftool_files to --add-binary arguments
    binary_args = []
    for src, dst in exiftool_files:
        binary_args.extend(['--add-binary', f'{src};{dst}'])

    # Define the PyInstaller command
    command = [
        'cardshark.py',                          # Your main script
        '--name=CardShark',                      # Name of the executable
        '--onefile',                             # Create a single executable
        '--windowed',                            # Run without console window
        '--icon=cardshark.ico',                  # Application icon
        '--add-data=logo.png;.',                 # Include logo
        '--add-data=cardshark.ico;.',            # Include icon
        '--add-data=icon_edit.png;.',            # Include edit icon
        '--add-data=icon_delete.png;.',          # Include delete icon
        '--add-data=icon_up.png;.',              # Include up icon
        '--add-data=icon_down.png;.',            # Include down icon
        '--hidden-import=PIL._tkinter_finder',   # Required PIL import
        '--clean',                               # Clean cache before building
        '--noconfirm',                           # Replace existing build without asking
    ]

    # Add all binary arguments
    command.extend(binary_args)

    # Run PyInstaller
    PyInstaller.__main__.run(command)

    print("Build completed successfully!")

if __name__ == "__main__":
    build_exe()