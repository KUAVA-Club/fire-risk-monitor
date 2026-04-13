from fastapi import FastAPI
from routes.fire import router as fire_router
from fastapi.staticfiles import StaticFiles

app = FastAPI()

app.mount("/static", StaticFiles(directory="static"), name="static")
app.include_router(fire_router)