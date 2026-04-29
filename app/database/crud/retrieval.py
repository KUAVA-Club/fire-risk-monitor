from database.db import get_connection
from database.crud.grid import GRID_SIZE


def get_recent_data(lat: float, lon: float) -> dict | None:
    """
    Look up weather + fire risk data for a given lat/lon.
    Returns the data ONLY if it was recorded less than 1 minute ago.
    Returns None if no fresh data exists (caller should fetch from API).
    """
    lat_min = round((lat // GRID_SIZE) * GRID_SIZE, 6)
    lon_min = round((lon // GRID_SIZE) * GRID_SIZE, 6)

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """SELECT w.temperature_c,
                  w.humidity_pct,
                  w.wind_speed_kmh,
                  w.precipitation_mm,
                  f.fri_score,
                  f.alert_level,
                  f.computed_at
           FROM grid_zone g
           JOIN weather_reading w ON w.zone_id = g.id
           JOIN fire_risk_score f ON f.zone_id = g.id
           WHERE g.lat_min = ? AND g.lon_min = ?
             AND w.recorded_at > datetime('now', '-1 minute')
             AND f.computed_at > datetime('now', '-1 minute')
           ORDER BY f.computed_at DESC
           LIMIT 1""",
        (lat_min, lon_min)
    )

    row = cursor.fetchone()
    conn.close()

    if row is None:
        return None

    return {
        "temp": round(row[0], 2),
        "humidity": round(row[1], 2),
        "wind_speed": round(row[2], 2),
        "precipitation": round(row[3], 2),
        "risk_index": row[4],
        "alert_level": row[5],
        "computed_at": row[6]
    }
