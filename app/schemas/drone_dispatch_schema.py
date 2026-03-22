from pydantic import BaseModel
from datetime import datetime


class DroneDispatchBase(BaseModel):
    alert_id: str
    drone_id: str
    status: str
    dispatched_at: datetime
    returned_at: datetime | None = None

class DroneDispatchCreate(DroneDispatchBase):
    pass

class DroneDispatch(DroneDispatchBase):
    id: str