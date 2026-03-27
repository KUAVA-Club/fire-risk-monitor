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

# returns main page with map
# awaits get request
@router.get("/map")
def get_fire(request: Request):
    return templates.TemplateResponse(
        "index.html",
        {"request": request}
    )

# returns data based on location
# used in js when clicked on grid to fetch data from API
@router.get("/fire/data")
def get_fire_data(lat: float, lon: float):
    # Fetch weather data from API
    data = getData(lat, lon)
    # insertion of accessed zone to the grid_zone table
    zone_id = create_grid_zone(data)
    # adding zone_id for Foreign Key in weather_readings table
    data["zone_id"] = zone_id
    # insertion of weather reading
    create_weather_reading(data)
    # returning JSON format with given variables
    return {
        "temp" : round(float(data["temperature_2m"]), 2),
        "wind_speed" : round(float(data["wind_speed_10m"]),2)
    }