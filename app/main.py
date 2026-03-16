from fastapi import FastAPI
from routes.fire import router as fire_router

app = FastAPI()

app.include_router(fire_router)