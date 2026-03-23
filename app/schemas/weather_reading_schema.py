from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class WeatherReadingBase(BaseModel):
    zone_id: str
    temperature_c: Optional[float] = None
    humidity_pct: Optional[float] = None
    wind_speed_kmh: Optional[float] = None
    precipitation_mm: Optional[float] = None
    source_api: Optional[str] = None


class WeatherReadingCreate(WeatherReadingBase):
    pass


class WeatherReading(WeatherReadingBase):
    id: str
    recorded_at: datetime

    class Config:
        from_attributes = True