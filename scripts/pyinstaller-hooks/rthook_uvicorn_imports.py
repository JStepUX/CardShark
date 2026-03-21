# Runtime hook to ensure h11 and httptools are available
import sys
import os

# Try to import h11 and httptools to trigger PyInstaller inclusion
try:
    import h11
    print(f"[Runtime Hook] h11 successfully imported: {h11.__version__}")
except ImportError as e:
    print(f"[Runtime Hook] Failed to import h11: {e}")

try:
    import httptools
    print(f"[Runtime Hook] httptools successfully imported")
except ImportError as e:
    print(f"[Runtime Hook] Failed to import httptools: {e}")

# Ensure uvicorn can find these modules
try:
    import uvicorn.protocols.http.h11_impl
    print("[Runtime Hook] uvicorn h11_impl successfully imported")
except ImportError as e:
    print(f"[Runtime Hook] Failed to import uvicorn h11_impl: {e}")

try:
    import uvicorn.protocols.http.httptools_impl
    print("[Runtime Hook] uvicorn httptools_impl successfully imported")
except ImportError as e:
    print(f"[Runtime Hook] Failed to import uvicorn httptools_impl: {e}")
