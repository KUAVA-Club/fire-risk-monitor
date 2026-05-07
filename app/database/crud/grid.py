import uuid
from app.database.db import get_connection

GRID_SIZE = 0.05


def create_grid_zone(data: dict) -> str:
    """
    Insert a grid zone for the given coordinates and return its zone_id.
    Snaps lat/long to grid boundaries. Returns existing id if zone already exists.
    """
    lat = float(data["lat"])
    lon = float(data["long"])

    lat_min = round((lat // GRID_SIZE) * GRID_SIZE, 6)
    lat_max = round(lat_min + GRID_SIZE, 6)
    lon_min = round((lon // GRID_SIZE) * GRID_SIZE, 6)
    lon_max = round(lon_min + GRID_SIZE, 6)

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        "SELECT id FROM grid_zone WHERE lat_min = ? AND lon_min = ?",
        (lat_min, lon_min)
    )
    row = cursor.fetchone()

    if row:
        zone_id = row[0]
    else:
        zone_id = str(uuid.uuid4())
        cursor.execute(
            "INSERT INTO grid_zone (id, lat_min, lat_max, lon_min, lon_max) VALUES (?, ?, ?, ?, ?)",
            (zone_id, lat_min, lat_max, lon_min, lon_max)
        )
        conn.commit()

    conn.close()
    return zone_id
