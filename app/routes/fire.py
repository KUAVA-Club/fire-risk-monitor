import sys
import os
import requests
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

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

from app.database.crud.danger_zones import get_cached_danger_zones
from app.services.land_cover_api import get_land_cover
from app.services.grid_sampler import assess_grid_fire_risk
from app.core.logger import logger
from app.services.risk_scorer import calculate_fire_risk

router = APIRouter()
templates = Jinja2Templates(directory="app/templates")

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

    land_cover = get_land_cover(lat, lon)
    if not land_cover["relevant"]:
        return {
            "is_relevant": False,
            "land_cover": land_cover["land_cover_name"],
            "reason": land_cover["reason"]
        }

    cached = get_recent_data(lat, lon)
    if cached:
        logger.info(f"Cache hit — returning data from {cached['computed_at']}")
        return {
            "is_relevant": True,
            "land_cover": land_cover["land_cover_name"],
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
    logger.info("Cache miss — sampling 9 sub-locations in grid")
    grid_result = assess_grid_fire_risk(lat, lon)
    center = grid_result["center_weather"]

    zone_id = grid_result["zone_id"]  # already created inside assess_grid_fire_risk
    logger.info(f"Grid zone — zone_id: {zone_id}")

    center["zone_id"] = zone_id
    center["ffmc"] = grid_result.get("ffmc")
    center["dmc"]  = grid_result.get("dmc")
    center["dc"]   = grid_result.get("dc")
    create_weather_reading(center)
    logger.info(f"Weather reading inserted for zone_id: {zone_id}")

    risk_result = insert_risk_and_alert(zone_id, grid_result["risk_index"])
    logger.info(f"Risk score inserted — score_id: {risk_result['score_id']}, alert: {risk_result['alert_level']}")

    return {
        "is_relevant": True,
        "land_cover": land_cover["land_cover_name"],
        "temp": grid_result["temp"],
        "wind_speed": grid_result["wind_speed"],
        "risk_index": grid_result["risk_index"],
        "alert_level": grid_result["alert_level"]
    }

@router.get("/fire/dangerZones")
def get_danger_zones():
    data = get_cached_danger_zones()
    return data
