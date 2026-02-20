from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .db.schema import init_db
from .routers import applications, health, insights, jobs, outcomes, profile

app = FastAPI(title="Career Co-Pilot API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup() -> None:
    init_db()


app.include_router(health.router)
app.include_router(insights.router)
app.include_router(outcomes.router)
app.include_router(profile.router)
app.include_router(jobs.router)
app.include_router(applications.router)


@app.get("/")
def root():
    return {"message": "Career Co-Pilot API", "docs": "/docs"}
