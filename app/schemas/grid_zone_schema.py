from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class GridZoneBase(BaseModel):
    id: str
    lat_min: float
    lat_max: float
    lon_min: float
    lon_max: float
    region_name: Optional[str] = None


class GridZoneCreate(GridZoneBase):
    pass


class GridZone(GridZoneBase):
    created_at: datetime

    class Config:
        from_attributes = True
