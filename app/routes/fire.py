from fastapi import APIRouter
from fastapi.templating import Jinja2Templates
from fastapi import Request
from database.crud.weather import create_weather_reading
from database.crud.grid import create_grid_zone
from database.crud.risk import insert_risk_and_alert
from database.crud.retrieval import get_recent_data

from database.crud.danger_zones import get_cached_danger_zones
from services.land_cover_api import get_land_cover
from services.grid_sampler import assess_grid_fire_risk
from core.logger import logger
from services.risk_scorer import calculate_fire_risk

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
        name="index.html",
        request=request
    )

# returns data based on location
# used in js when clicked on grid to fetch data from API
@router.get("/fire/data")
def get_fire_data(lat: float, lon: float):
    logger.info(f"Request received — lat: {lat}, lon: {lon}")

    land_cover = get_land_cover(lat, lon)
    if not land_cover["relevant"]:
        return {
            "relevant": False,
            "land_cover": land_cover["land_cover_name"],
            "reason": land_cover["reason"]
        }

    cached = get_recent_data(lat, lon)
    if cached:
        logger.info(f"Cache hit — returning data from {cached['computed_at']}")
        return {
            "relevant": True,
            "land_cover": land_cover["land_cover_name"],
            "temp": cached["temp"],
            "wind_speed": cached["wind_speed"],
            "risk_index": cached["risk_index"],
            "alert_level": cached["alert_level"]
        }

    logger.info("Cache miss — sampling 9 sub-locations in grid")
    grid_result = assess_grid_fire_risk(lat, lon)
    center = grid_result["center_weather"]

    zone_id = create_grid_zone(center)
    logger.info(f"Grid zone inserted — zone_id: {zone_id}")

    center["zone_id"] = zone_id
    create_weather_reading(center)
    logger.info(f"Weather reading inserted for zone_id: {zone_id}")

    risk_result = insert_risk_and_alert(zone_id, grid_result["risk_index"])
    logger.info(f"Risk score inserted — score_id: {risk_result['score_id']}, alert: {risk_result['alert_level']}")

    return {
        "relevant": True,
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