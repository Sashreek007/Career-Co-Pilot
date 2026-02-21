# Career Co-Pilot Browser Helper Extension

This extension captures jobs from your **currently open LinkedIn or Indeed tab** and imports them into Career Co-Pilot through `POST /jobs/import-link`.

## 1) Load the extension in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this folder:

```text
browser-helper-extension
```

## 2) Start Career Co-Pilot

From repo root:

```bash
docker compose up --build
```

Expected URLs:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:8000`

## 3) Use the extension

1. Open a LinkedIn Jobs or Indeed Jobs page in Chrome.
2. Click the extension icon and open **Career Co-Pilot Helper**.
3. Verify backend URL (`http://localhost:8000`) and click **Check Backend**.
4. Click **Detect Page**.
5. Click one of:
   - **Capture Current Job**
   - **Capture List** (set count 1-30)
6. Open `http://localhost:3000/jobs` and refresh the feed.

## Notes

- Capture runs in your visible browser tab and uses your logged-in session.
- If no jobs are captured, scroll the list and retry.
- DOM selectors can change when LinkedIn/Indeed update their UI.
