from pydantic import BaseModel
from datetime import datetime


class FireRiskScoreBase(BaseModel):
    zone_id: str
    fri_score: float
    alert_level: str

class FireRiskScoreCreate(FireRiskScoreBase):
    pass

class FireRiskScore(FireRiskScoreBase):
    id: str
    computed_at: datetime