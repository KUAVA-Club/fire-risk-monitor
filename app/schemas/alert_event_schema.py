from pydantic import BaseModel
from datetime import datetime


class AlertEventBase(BaseModel):
    zone_id: str
    score_id: str
    level: str
    acknowledged: bool
    triggered_at: datetime

class AlertEventCreate(AlertEventBase):
    pass

class AlertEvent(AlertEventBase):
    id: str