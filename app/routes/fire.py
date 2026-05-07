from fastapi import APIRouter
from fastapi.templating import Jinja2Templates
from fastapi import Request
from app.services.open_meteo_api import getData
from app.database.crud.weather import create_weather_reading
from app.database.crud.grid import create_grid_zone
from app.database.crud.risk import insert_risk_and_alert
from app.database.crud.retrieval import get_recent_data

from app.database.crud.danger_zones import get_cached_danger_zones
from app.core.logger import logger  
from app.services.risk_scorer import calculate_fire_risk

from fastapi import BackgroundTasks
from app.services.percentile_computer import compute_and_store_percentiles
from app.database.crud.percentiles import get_fwi_percentiles


router = APIRouter()
templates = Jinja2Templates(directory="app/templates")

# @router.get("/")
# def redirctionFromRoot(request: Request):
#     url = request.url_for("/map")
#     return Request.RedirectResponse(url="/map")

# returns main page with map
# awaits get request
@router.get("/map")
def get_fire(request: Request):
    return templates.TemplateResponse(
        name="index.html",
        request=request
    )

# returns data based on location
# used in js when clicked on grid to fetch data from API
@router.get("/fire/data")
def get_fire_data(lat: float, lon: float, background_tasks: BackgroundTasks):
    logger.info(f"Request received — lat: {lat}, lon: {lon}")

    # TASK 2: check if fresh data exists in database (< 1 minute old)
    cached = get_recent_data(lat, lon)
    if cached:
        logger.info(f"Cache hit — returning data from {cached['computed_at']}")
        return {
            "temp": cached["temp"],
            "wind_speed": cached["wind_speed"],
            "risk_index": cached["risk_index"],
            "alert_level": cached["alert_level"]
        }

    logger.info("Cache miss — fetching from API")
    # Fetch weather data from API
    data = getData(lat, lon)
    logger.info(f"API data retrieved — temp: {data['temperature_2m']}, wind: {data['wind_speed_10m']}")
    
    # insertion of accessed zone to the grid_zone table
    zone_id = create_grid_zone(data)
    logger.info(f"Grid zone inserted — zone_id: {zone_id}")

    # trigger background percentile computation if not yet done for this zone
    if get_fwi_percentiles(zone_id) is None:
        background_tasks.add_task(compute_and_store_percentiles, zone_id)

    # calculate risk
    risk = calculate_fire_risk(zone_id, float(data["temperature_2m"]), float(data["wind_speed_10m"]), float(data["relative_humidity_2m"]), float(data["precipitation_sum"]), float(data["soil_moisture_0_to_1cm"]), lon=lon)

    # adding zone_id for Foreign Key in weather_readings table
    data["zone_id"] = zone_id
    # insertion of weather reading
    create_weather_reading(data)
    logger.info(f"Weather reading inserted for zone_id: {zone_id}")

    # TASK 1: insert fire_risk_score and alert_event every time we get weather data
    risk_result = insert_risk_and_alert(zone_id, risk["risk_index"])
    logger.info(f"Risk score inserted — score_id: {risk_result['score_id']}, alert: {risk_result['alert_level']}")

    # returning JSON format with given variables
    return {
        "temp" : round(float(data["temperature_2m"]), 2),
        "wind_speed" : round(float(data["wind_speed_10m"]),2),
        "risk_index": risk["risk_index"],
        "alert_level": risk["alert_level"]
    }


@router.get("/fire/dangerZones")
def get_danger_zones():
    data = get_cached_danger_zones()
    return data
