import os
import shutil
import tempfile
import time
import sys

# Ensure this runs only when packaged
if getattr(sys, 'frozen', False):
    try:
        now = time.time()
        tmp = tempfile.gettempdir()
        print(f"[Runtime Hook] Cleaning old _MEI folders in: {tmp}")

        cleaned_count = 0
        for folder in os.listdir(tmp):
            if folder.startswith("_MEI"):
                path = os.path.join(tmp, folder)
                try:
                    if os.path.isdir(path):
                        # Check modification time - delete if older than 1 hour (3600 seconds)
                        mod_time = os.path.getmtime(path)
                        if now - mod_time > 3600:
                            print(f"[Runtime Hook] Removing old folder: {path} (modified {time.ctime(mod_time)})")
                            shutil.rmtree(path)
                            cleaned_count += 1
                        # else:
                        #     print(f"[Runtime Hook] Skipping recent folder: {path} (modified {time.ctime(mod_time)})")
                except FileNotFoundError:
                    # Folder might have been deleted by another process between listdir and getmtime/rmtree
                    print(f"[Runtime Hook] Folder not found during cleanup (likely already removed): {path}")
                except PermissionError:
                    print(f"[Runtime Hook] Permission denied trying to remove: {path} (likely in use)")
                except Exception as e:
                    # Catch other potential errors during removal
                    print(f"[Runtime Hook] Error removing {path}: {e}")
        
        if cleaned_count > 0:
            print(f"[Runtime Hook] Cleaned up {cleaned_count} old _MEI folders.")
        else:
            print("[Runtime Hook] No old _MEI folders found to clean.")

    except Exception as e:
        # Catch errors during the hook execution itself
        print(f"[Runtime Hook] Error during cleanup process: {e}")
