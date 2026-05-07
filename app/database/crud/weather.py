import uuid
from app.database.db import get_connection


def create_weather_reading(data: dict) -> str:
    """Insert a weather reading row and return its id."""
    reading_id = str(uuid.uuid4())

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """INSERT INTO weather_reading
           (id, zone_id, temperature_c, humidity_pct, wind_speed_kmh, precipitation_mm, source_api)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (
            reading_id,
            data["zone_id"],
            float(data["temperature_2m"]),
            float(data["relative_humidity_2m"]),
            float(data["wind_speed_10m"]),
            float(data["precipitation"]),
            "openmeteo"
        )
    )

    conn.commit()
    conn.close()
    return reading_id


def get_all_weather() -> list[dict]:
    """Return all weather readings as a list of dicts."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """SELECT id, zone_id, temperature_c, humidity_pct,
                  wind_speed_kmh, precipitation_mm, source_api, recorded_at
           FROM weather_reading
           ORDER BY recorded_at DESC"""
    )

    columns = ["id", "zone_id", "temperature_c", "humidity_pct",
               "wind_speed_kmh", "precipitation_mm", "source_api", "recorded_at"]
    rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    conn.close()
    return rows
