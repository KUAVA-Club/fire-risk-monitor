from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class SatelliteDetectionBase(BaseModel):
    zone_id: str
    confidence_pct: float
    source: Optional[str] = None


class SatelliteDetectionCreate(SatelliteDetectionBase):
    pass


class SatelliteDetection(SatelliteDetectionBase):
    id: str
    detected_at: datetime

    class Config:
        from_attributes = True

