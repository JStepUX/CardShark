# -*- mode: python ; coding: utf-8 -*-

import sys
import os
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

block_cipher = None

# Collect all required data files
frontend_datas = [
    ('frontend/dist/*', 'frontend/dist/'),
    ('frontend/dist/assets/*', 'frontend/dist/assets/'),
]

backend_datas = [
    ('backend/*.py', 'backend'),
]

# Combine all data files
all_datas = frontend_datas + backend_datas

# Verified backend modules that exist in your project
hidden_imports = [
    # Core FastAPI and dependencies
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.supervisors',
    'uvicorn.supervisors.multiprocess',
    
    # Backend modules - only include ones that exist
    'backend',
    'backend.log_manager',
    'backend.png_handler',
    'backend.png_metadata_handler',
    'backend.png_debug_handler',
    'backend.backyard_handler',
    'backend.settings_manager',
    
    # Important dependencies
    'email_validator',
    'typing_extensions',
    'packaging',
]

# Add collections using collect_submodules
for module in ['PIL', 'requests', 'fastapi', 'starlette', 'pydantic', 'uvicorn']:
    hidden_imports.extend(collect_submodules(module))

a = Analysis(
    ['backend/main.py'],
    pathex=[os.path.abspath('.')],
    binaries=[],
    datas=all_datas,
    hiddenimports=hidden_imports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['tkinter'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False
)

# Remove any duplicate files from the collection
unique_datas = list(set(a.datas))
a.datas = unique_datas

pyz = PYZ(
    a.pure, 
    a.zipped_data,
    cipher=block_cipher
)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,        # Include binaries
    a.zipfiles,        # Include zipfiles
    a.datas,          # Include datas
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
    entitlements_file=None,
    icon='frontend/dist/cardshark.ico'
)