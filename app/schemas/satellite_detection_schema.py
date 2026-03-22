from pydantic import BaseModel
from datetime import datetime


class SatelliteDetectionBase(BaseModel):
    zone_id: str
    confidence_pct: float
    source: str

class SatelliteDetectionCreate(SatelliteDetectionBase):
    pass

class SatelliteDetection(SatelliteDetectionBase):
    id: str
    detected_at: datetime