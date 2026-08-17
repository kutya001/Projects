# -*- mode: python ; coding: utf-8 -*-
# PyInstaller spec file for Projects SPA

import os

block_cipher = None

# All frontend files to bundle
frontend_files = []
base = os.path.dirname(os.path.abspath(SPEC))

# Add index.html
frontend_files.append((os.path.join(base, 'index.html'), '.'))

# Add all src/ files
for root, dirs, files in os.walk(os.path.join(base, 'src')):
    for f in files:
        full = os.path.join(root, f)
        rel = os.path.relpath(root, base)
        frontend_files.append((full, rel))

# Add all styles/ files
for root, dirs, files in os.walk(os.path.join(base, 'styles')):
    for f in files:
        full = os.path.join(root, f)
        rel = os.path.relpath(root, base)
        frontend_files.append((full, rel))

a = Analysis(
    ['server.py'],
    pathex=[base],
    binaries=[],
    datas=frontend_files,
    hiddenimports=['aiohttp', 'aiosqlite', 'asyncio'],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='ProjectsSPA',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)
