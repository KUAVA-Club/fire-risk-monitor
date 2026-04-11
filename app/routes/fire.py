from fastapi import APIRouter
from fastapi.templating import Jinja2Templates
from fastapi import Request
from services.open_meteo_api import getData
from database.crud.weather import create_weather_reading
from database.crud.grid import create_grid_zone
from database.crud.weather import get_all_weather
from services.risk_calculator import calculate_fire_risk
from core.logger import logger
from fastapi.responses import JSONResponse

router = APIRouter()
templates = Jinja2Templates(directory="templates")

# @router.get("/")
# def redirctionFromRoot(request: Request):
#     url = request.url_for("/map")
#     return Request.RedirectResponse(url="/map")

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
    logger.info(f"Request received — lat: {lat}, lon: {lon}")
    # Fetch weather data from API
    data = getData(lat, lon)
    logger.info(f"API data retrieved — temp: {data['temperature_2m']}, wind: {data['wind_speed_10m']}")
    # calculate risk
    risk = calculate_fire_risk(
        temperature=float(data["temperature_2m"]),
        wind_speed=float(data["wind_speed_10m"]),
        humidity=float(data["relative_humidity_2m"]),
        precipitation=float(data["precipitation"]),
        soil_moisture=float(data["soil_moisture_0_to_1cm"])
    )
    # insertion of accessed zone to the grid_zone table
    zone_id = create_grid_zone(data)
    logger.info(f"Grid zone inserted — zone_id: {zone_id}")
    # adding zone_id for Foreign Key in weather_readings table
    data["zone_id"] = zone_id
    # insertion of weather reading
    create_weather_reading(data)
    logger.info(f"Weather reading inserted for zone_id: {zone_id}")
    # returning JSON format with given variables
    return {
        "temp" : round(float(data["temperature_2m"]), 2),
        "wind_speed" : round(float(data["wind_speed_10m"]),2),
        "risk_index": risk["risk_index"],
        "alert_level": risk["alert_level"]
    }
