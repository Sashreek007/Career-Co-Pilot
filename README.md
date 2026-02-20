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
