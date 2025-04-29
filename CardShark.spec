# -*- mode: python ; coding: utf-8 -*-

import sys
import os
from pathlib import Path
from PyInstaller.utils.hooks import collect_submodules, collect_data_files

block_cipher = None

# Collect all required data files
frontend_datas = [
    ('frontend/dist/*', 'frontend'),
    ('frontend/dist/assets/*', 'frontend/assets'),
]

backend_datas = [
    ('backend/*.py', 'backend'),
    ('backend/handlers/*.py', 'backend/handlers'),
    ('backend/worldcards/*', 'backend/worldcards'),
    ('backend/models/*', 'backend/models'),
    ('backend/utils/*', 'backend/utils'),
]

# Add KoboldCPP directory (even if empty) to ensure it's created
koboldcpp_dir = Path('KoboldCPP')
koboldcpp_dir.mkdir(exist_ok=True)
koboldcpp_datas = [
    ('KoboldCPP', 'KoboldCPP'),
]

# Combine all data files
all_datas = frontend_datas + backend_datas + koboldcpp_datas

# Verified backend modules that exist in your project
hidden_imports = [
    # Core FastAPI and dependencies
    'fastapi',
    'starlette',
    'pydantic',
    'requests',
    'uvicorn',
    'uvicorn.main',
    'uvicorn.config',
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
    'backend.api_handler',
    'backend.api_provider_adapters',
    'backend.background_handler',
    'backend.backyard_handler',
    'backend.batch_converter',
    'backend.character_validator',
    'backend.chat_handler',
    'backend.errors',
    'backend.koboldcpp_manager',
    'backend.koboldcpp_handler',
    'backend.log_manager',
    'backend.lore_handler',
    'backend.network_server',
    'backend.png_handler',
    'backend.png_debug_handler',
    'backend.png_metadata_handler',
    'backend.room_card_endpoint',
    'backend.settings_manager',
    'backend.template_handler',
    'backend.test_module',
    'backend.world_state_manager',
    
    # Handlers subdirectory
    'backend.handlers',
    'backend.handlers.world_card_chat_handler',
    'backend.handlers.world_state_handler',
    'backend.handlers.background_api',
    
    # Models, Utils, and WorldCards subdirectories
    'backend.models',
    'backend.utils',
    'backend.worldcards',
    
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