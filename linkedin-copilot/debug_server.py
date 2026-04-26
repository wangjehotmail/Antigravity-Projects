import http.server
import socketserver
import json
import os
import csv
import glob
from datetime import datetime
import subprocess

PORT = 5005
WORKSPACE_DIR = r"c:\Users\jerry_wang\Documents\antigravity_projects\linkedin-copilot"
DATA_DIR = os.path.join(WORKSPACE_DIR, "output")
DEBUG_DIR = os.path.join(WORKSPACE_DIR, "debug_temp")

for d in [DATA_DIR, DEBUG_DIR]:
    if not os.path.exists(d):
        os.makedirs(d)

class CopilotHandler(http.server.SimpleHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        content_length = int(self.headers['Content-Length']) if 'Content-Length' in self.headers else 0
        post_data = self.rfile.read(content_length)
        
        try:
            data = json.loads(post_data.decode('utf-8'))
        except:
            data = {}

        if self.path == '/debug':
            filepath = os.path.join(DEBUG_DIR, 'debug_dump.json')
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=4)
            self._send_success({"status": "success", "file": filepath})
            
        elif self.path == '/save_csv':
            # Expects data: { file_prefix: "jobs", date_str: "20231015", job: {Company, Title, MaxComp, Link} }
            file_prefix = data.get("file_prefix", "linkedin_jobs")
            date_str = data.get("date_str", datetime.now().strftime("%Y%m%d"))
            job = data.get("job", {})
            
            # Use .txt extension but write as CSV format as requested
            filename = f"{file_prefix}_{date_str}.txt"
            filepath = os.path.join(DATA_DIR, filename)
            
            file_exists = os.path.exists(filepath)
            
            with open(filepath, 'a', newline='', encoding='utf-8') as f:
                writer = csv.writer(f)
                if not file_exists:
                    writer.writerow(["Company", "Title", "Max Comp", "Link"]) # Header
                writer.writerow([job.get('company'), job.get('jobTitle'), job.get('maxComp'), job.get('url')])
                
            self._send_success({"status": "success", "file": filename})

        elif self.path == '/rotate_files':
            # Keep latest 3 files matching prefix
            file_prefix = data.get("file_prefix", "linkedin_jobs")
            search_pattern = os.path.join(DATA_DIR, f"{file_prefix}_*.txt")
            files = glob.glob(search_pattern)
            
            # Sort by creation/modification time reversed (newest first)
            files.sort(key=os.path.getmtime, reverse=True)
            
            deleted = []
            if len(files) > 3:
                for f in files[3:]:
                    os.remove(f)
                    deleted.append(f)
                    
            self._send_success({"status": "rotated", "kept": 3, "deleted": len(deleted)})

        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        if self.path == '/open_folder':
            os.startfile(DATA_DIR)
            self._send_success({"status": "opened"})
        else:
            self.send_response(404)
            self.end_headers()

    def _send_success(self, payload):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode('utf-8'))

with socketserver.TCPServer(("", PORT), CopilotHandler) as httpd:
    print(f"Copilot local backend listening on port {PORT}")
    httpd.serve_forever()
