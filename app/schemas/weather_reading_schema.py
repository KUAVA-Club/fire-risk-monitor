from pydantic import BaseModel
from datetime import datetime


class WeatherReadingBase(BaseModel):
    zone_id: str
    temperature_c: float
    humidity_pct: float
    wind_speed_kmh: float
    precipitation_mm: float
    source_api: str

class WeatherReadingCreate(WeatherReadingBase):
    pass

class WeatherReading(WeatherReadingBase):
    id: str
    recorded_at: datetime