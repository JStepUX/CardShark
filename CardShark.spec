# -*- mode: python ; coding: utf-8 -*-
import os

# Get the directory containing ExifTool and its dependencies
exiftool_dir = os.path.dirname(os.path.abspath(__file__))

# Collect all ExifTool-related files
exiftool_files = []
for file in os.listdir(exiftool_dir):
    if file.startswith('perl5') or file == 'exiftool.exe' or file == '.ExifTool_config':
        exiftool_files.append((os.path.join(exiftool_dir, file), '.'))

a = Analysis(
    ['cardshark.py'],
    pathex=[],
    binaries=exiftool_files,  # Include ExifTool files as binaries
    datas=[
        ('logo.png', '.'), 
        ('cardshark.ico', '.'),
        ('icon_edit.png', '.'),
        ('icon_delete.png', '.'),
        ('icon_up.png', '.'),
        ('icon_down.png', '.')
    ],
    hiddenimports=['PIL._tkinter_finder'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='CardShark',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=['cardshark.ico'],
)