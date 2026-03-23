from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class FireRiskBase(BaseModel):
    zone_id: str
    fri_score: float
    alert_level: Optional[str] = None


class FireRiskCreate(FireRiskBase):
    pass


class FireRisk(FireRiskBase):
    id: str
    computed_at: datetime

    class Config:
        from_attributes = True
