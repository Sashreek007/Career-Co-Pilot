from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .routers import health

app = FastAPI(title="Career Co-Pilot API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)


@app.get("/")
def root():
    return {"message": "Career Co-Pilot API", "docs": "/docs"}
