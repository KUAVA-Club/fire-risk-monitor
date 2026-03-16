from pydantic import BaseModel

class FireCreate(BaseModel):
    latitude: float
    longitude: float
    risk_level: str