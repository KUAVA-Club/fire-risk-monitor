from fastapi import APIRouter
from app.schemas.fire_schema import FireCreate

router = APIRouter()

fake_db = []

# CREATE
@router.post("/fire")
def create_fire(data: FireCreate):
    fake_db.append(data)
    return {"message": "fire added", "data": data}

# READ ALL
@router.get("/fire")
def get_all_fires():
    return fake_db

# READ ONE
@router.get("/fire/{fire_id}")
def get_fire(fire_id: int):
    return fake_db[fire_id]

# UPDATE
@router.put("/fire/{fire_id}")
def update_fire(fire_id: int, data: FireCreate):
    fake_db[fire_id] = data
    return {"message": "updated"}

# DELETE
@router.delete("/fire/{fire_id}")
def delete_fire(fire_id: int):
    fake_db.pop(fire_id)
    return {"message": "deleted"}