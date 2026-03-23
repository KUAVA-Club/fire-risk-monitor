from fastapi import APIRouter
from fastapi.templating import Jinja2Templates
from fastapi import Request
from services.open_meteo_api import getData
from database.crud.weather import create_weather_reading
from database.crud.grid import create_grid_zone
from database.crud.weather import get_all_weather
from fastapi.responses import JSONResponse

router = APIRouter()
templates = Jinja2Templates(directory="templates")


@router.get("/map")
def get_fire(request: Request):

    return templates.TemplateResponse(
        "index.html",
        {"request": request}
    )

@router.get("/fire/data")
def get_fire_data(lat: float, lon: float):
    data = getData(lat, lon)
    zone_id = create_grid_zone(data)
    data["zone_id"] = zone_id
    create_weather_reading(data)
    return {
        "temp" : round(float(data["temperature_2m"]), 2),
        "wind_speed" : round(float(data["wind_speed_10m"]),2)
    }

@router.get("/getdata")
def get_weather(request: Request):
    data = get_all_weather()
    print(data)
    return JSONResponse(content=data)