from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class DroneDispatchBase(BaseModel):
    alert_id: str
    drone_id: Optional[str] = None
    status: Optional[str] = "IDLE"


class DroneDispatchCreate(DroneDispatchBase):
    pass


class DroneDispatch(DroneDispatchBase):
    id: str
    dispatched_at: Optional[datetime]
    returned_at: Optional[datetime]

    class Config:
        from_attributes = True