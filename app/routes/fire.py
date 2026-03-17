from fastapi import APIRouter
from fastapi.templating import Jinja2Templates
from fastapi import Request
from services.open_meteo_api import getData


router = APIRouter()
templates = Jinja2Templates(directory="templates")


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