from fastapi import APIRouter
from fastapi.templating import Jinja2Templates
from fastapi import Request
from fastapi.responses import HTMLResponse
from services.open_meteo_api import getData
import pandas as pd
from datetime import datetime
import time



router = APIRouter()
templates = Jinja2Templates(directory="templates")



@router.get("/fire", response_class=HTMLResponse)
def home(request: Request):
    data = getData(13,32)

    return templates.TemplateResponse(
        "index.html",
        {"request": request, 
         "temp" : float(data["temperature_2m"][0]),
         "soil_temp" : float(data["soil_temperature_0cm"][0]),
         "soil_mosture": float(data["soil_moisture_0_to_1cm"][0]),
         "relet_humidity" : float(data["relative_humidity_2m"][0]), 
         "precipitaion" : float(data["precipitation"][0]),
         "wind_spped" : float(data["wind_speed_10m"][0])}
    )

@router.get("/fire/from")
def get_fire(request: Request, lat: float, lon: float):
    
    data = getData(lat,lon)


    return templates.TemplateResponse(
        "index.html",
        {"request": request, 
         "temp" : float(data["temperature_2m"]),
         "soil_temp" : float(data["soil_temperature_0cm"]),
         "soil_mosture": float(data["soil_moisture_0_to_1cm"]),
         "relet_humidity" : float(data["relative_humidity_2m"]), 
         "precipitaion" : float(data["precipitation"]),
         "wind_speed" : float(data["wind_speed_10m"])}
    )

'''

# CREATE
@router.post("/fire")
def create_fire(data: FireCreate):
    fake_db.append(data)
    return {"message": "fire added", "data": data}

# UPDATE
@router.put("/fire/{fire_id}")
def update_fire(fire_id: int, data: FireCreate):
    fake_db[fire_id] = data
    return {"message": "updated"}

# DELETE
@router.delete("/fire/{fire_id}")
def delete_fire(fire_id: int):
    fake_db.pop(fire_id)
    return {"message": "deleted"}
    '''