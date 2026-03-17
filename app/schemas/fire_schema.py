from pydantic import BaseModel
# Sample code, does not do anything
class FireCreate(BaseModel):
    latitude: float
    longitude: float
    risk_level: str