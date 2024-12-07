# -*- mode: python ; coding: utf-8 -*-


a = Analysis(
    ['cardshark.py'],
    pathex=[],
    binaries=[],
    datas=[('logo.png', '.'), ('cardshark.ico', '.'), ('.ExifTool_config', '.'), ('icon_edit.png', '.'), ('icon_delete.png', '.'), ('icon_up.png', '.'), ('icon_down.png', '.'), ('exiftool_files/exiftool.pl', 'exiftool_files'), ('exiftool_files/perl.exe', 'exiftool_files'), ('exiftool_files/perl532.dll', 'exiftool_files'), ('exiftool_files/libgcc_s_dw2-1.dll', 'exiftool_files'), ('exiftool_files/liblzma-5_.dll', 'exiftool_files'), ('exiftool_files/libwinpthread-1.dll', 'exiftool_files'), ('exiftool_files/libstdc++-6.dll', 'exiftool_files'), ('exiftool_files/lib', 'exiftool_files/lib')],
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
