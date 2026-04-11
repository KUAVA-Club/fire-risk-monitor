from fastapi import FastAPI
from routes.fire import router as fire_router
from fastapi.staticfiles import StaticFiles

app = FastAPI()

from fastapi.middleware.cors import CORSMiddleware

# ... (after your app = FastAPI() line)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # This allows your frontend to talk to the backend
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
app.include_router(fire_router)