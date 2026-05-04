import uuid
from app.database.db import get_connection


def create_weather_reading(data: dict) -> str:
    """Insert a weather reading row (including soil moisture and FWI codes) and return its id."""
    reading_id = str(uuid.uuid4())

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """INSERT INTO weather_reading
           (id, zone_id, temperature_c, humidity_pct, wind_speed_kmh,
            precipitation_mm, soil_moisture, ffmc, dmc, dc, source_api)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            reading_id,
            data["zone_id"],
            float(data["temperature_2m"]),
            float(data["relative_humidity_2m"]),
            float(data["wind_speed_10m"]),
            float(data["precipitation"]),
            float(data.get("soil_moisture_0_to_1cm", 0.0)),
            data.get("ffmc"),
            data.get("dmc"),
            data.get("dc"),
            "openmeteo"
        )
    )

    conn.commit()
    conn.close()
    return reading_id


def get_latest_weather_for_zone(zone_id: str) -> dict | None:
    """
    Return the most recent weather reading for a zone, including FWI codes.
    Used to seed previous-day moisture state for FWI calculations.
    Returns None if no reading exists yet.
    """
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """SELECT temperature_c, humidity_pct, wind_speed_kmh, precipitation_mm,
                  soil_moisture, ffmc, dmc, dc, recorded_at
           FROM weather_reading
           WHERE zone_id = ?
           ORDER BY recorded_at DESC
           LIMIT 1""",
        (zone_id,)
    )
    row = cursor.fetchone()
    conn.close()

    if not row:
        return None

    return {
        "temperature_c":    row[0],
        "humidity_pct":     row[1],
        "wind_speed_kmh":   row[2],
        "precipitation_mm": row[3],
        "soil_moisture":    row[4],
        "ffmc":             row[5],
        "dmc":              row[6],
        "dc":               row[7],
        "recorded_at":      row[8],
    }


def get_all_weather() -> list[dict]:
    """Return all weather readings as a list of dicts."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """SELECT id, zone_id, temperature_c, humidity_pct,
                  wind_speed_kmh, precipitation_mm, soil_moisture,
                  ffmc, dmc, dc, source_api, recorded_at
           FROM weather_reading
           ORDER BY recorded_at DESC"""
    )

    columns = ["id", "zone_id", "temperature_c", "humidity_pct",
               "wind_speed_kmh", "precipitation_mm", "soil_moisture",
               "ffmc", "dmc", "dc", "source_api", "recorded_at"]
    rows = [dict(zip(columns, row)) for row in cursor.fetchall()]

    conn.close()
    return rows