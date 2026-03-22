from pydantic import BaseModel
from datetime import datetime


class GridZoneBase(BaseModel):
    lat_min: float
    lat_max: float
    lon_min: float
    lon_max: float
    region_name: str

class GridZoneCreate(GridZoneBase):
    pass

class GridZone(GridZoneBase):
    id: str
    created_at: datetime