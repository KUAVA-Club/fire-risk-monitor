from fastapi import APIRouter
from fastapi.templating import Jinja2Templates
from fastapi import Request
from services.open_meteo_api import getData


router = APIRouter()
templates = Jinja2Templates(directory="templates")


@router.get("/fire/from")
def get_fire(request: Request):

    return templates.TemplateResponse(
        "index.html",
        {"request": request}
    )

@router.get("/fire/data")
def get_fire_data(lat: float, lon: float):
    data = getData(lat, lon)

    return {
        "temp" : round(float(data["temperature_2m"]), 2),
        "wind_speed" : round(float(data["wind_speed_10m"]),2)
    }