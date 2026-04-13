from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class AlertEventBase(BaseModel):
    zone_id: str
    score_id: str
    level: Optional[str] = None
    acknowledged: Optional[int] = 0


class AlertEventCreate(AlertEventBase):
    pass


class AlertEvent(AlertEventBase):
    id: str
    triggered_at: datetime

    class Config:
        from_attributes = True
