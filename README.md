# Career Co-Pilot

## Running locally

### Frontend

```bash
# From repo root
pnpm install
pnpm dev
# → http://localhost:5173
```

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# → http://localhost:8000
# → http://localhost:8000/docs  (Swagger UI)
# → http://localhost:8000/health
```

### Both via Docker

```bash
# From repo root
docker compose up --build
# → frontend: http://localhost:3000
# → backend:  http://localhost:8000
```

### Visible Browser setup (for AI Auto Search / Assisted Apply)

Start Chrome with remote debugging before running browser-assisted features.

#### macOS

```bash
open -na "Google Chrome" --args --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --user-data-dir=/tmp/career-copilot-cdp
```

#### Windows (PowerShell or CMD)

```bat
chrome.exe --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --user-data-dir=%TEMP%\career-copilot-cdp
```

If `chrome.exe` is not in PATH, use:

```bat
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 --user-data-dir=%TEMP%\career-copilot-cdp
```

#### Verify Chrome debug endpoint

```bash
curl http://localhost:9222/json/version
```
