import os
import time
import subprocess
import threading
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# --- Configuration ---
REPO_DIR = os.path.dirname(os.path.abspath(__file__))
# How many seconds to wait after I finish generating code before pushing to GitHub
# Prevents creating 50 commits while a single file is actively saving
SYNC_COOLDOWN = 3.0  
DEBOUNCE_TIMER = None

def run_git_sync():
    print(f"\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] System modification detected. Engaging GitHub sequence...")
    try:
        # Step 1: Stage all modified, deleted, or generated files
        subprocess.run(["git", "add", "."], cwd=REPO_DIR, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        # Step 2: Commit the tracked code organically
        commit_msg = f"Antigravity auto-generated sync: {time.strftime('%Y-%m-%d %H:%M:%S')}"
        res = subprocess.run(["git", "commit", "-m", commit_msg], cwd=REPO_DIR, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        
        # If nothing actually changed in the files (false alarm), silently abort the push
        if b"nothing to commit" in res.stderr or b"working tree clean" in res.stderr:
            return
            
        # Step 3: Push payload to the cloud
        print(f"Commit packaged successfully. Pushing to GitHub Cloud...")
        subprocess.run(["git", "push"], cwd=REPO_DIR, check=True)
        print("✅ Live sync to GitHub complete.")
            
    except subprocess.CalledProcessError as e:
        print(f"⚠️ Git Execution Error. Ensure 'git' is installed in Windows PATH and the remote origin is mapped. Details: {e}")
    except Exception as e:
        print(f"⚠️ Unexpected Synchronization Error: {e}")

class AntigravitySyncHandler(FileSystemEventHandler):
    def on_any_event(self, event):
        # Ignore `.git` internal configuration changes to prevent an infinite feedback loop
        if '.git' in event.src_path or '__pycache__' in event.src_path:
            return
            
        # Ignore the sync script editing itself or logging files
        if event.src_path.endswith('antigravity_sync.py'):
            return

        # Debouncer: If multiple saving events happen rapidly, keep resetting the 3-second timer. 
        # Only execute the push when the folder has been completely quiet for 3 seconds.
        global DEBOUNCE_TIMER
        if DEBOUNCE_TIMER is not None:
            DEBOUNCE_TIMER.cancel()
        
        DEBOUNCE_TIMER = threading.Timer(SYNC_COOLDOWN, run_git_sync)
        DEBOUNCE_TIMER.start()

if __name__ == "__main__":
    print("="*65)
    print(" Antigravity Continuous Deployment (CD) Sync Agent ".center(65, "="))
    print("="*65)
    print(f"Monitoring Directory: {REPO_DIR}")
    print("Status: Active. Listening for code generations...")
    print("Press Ctrl+C to terminate connection.\n")
    
    event_handler = AntigravitySyncHandler()
    observer = Observer()
    observer.schedule(event_handler, REPO_DIR, recursive=True)
    observer.start()
    
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        observer.stop()
        if DEBOUNCE_TIMER is not None:
            DEBOUNCE_TIMER.cancel()
        print("\nSync Agent Terminated organically.")
    observer.join()
