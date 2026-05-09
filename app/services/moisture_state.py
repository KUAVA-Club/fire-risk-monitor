from app.database.db import get_connection
from datetime import datetime, timezone, timedelta
from app.database.crud.weather import get_latest_weather_for_zone

# Canadian Forest Service standard startup defaults (used when no prior reading exists)
_DEFAULTS = {"ffmc_prev": 85.0, "dmc_prev": 6.0, "dc_prev": 15.0}


def get_moisture_state(zone_id: str) -> dict:
    """
    Return previous FWI moisture codes for a zone by looking up the most
    recent weather_reading row. Falls back to CFS startup defaults if none exists.
    """
    reading = get_latest_weather_for_zone(zone_id)

    if reading and reading["ffmc"] is not None:
        return {
            "ffmc_prev": reading["ffmc"],
            "dmc_prev":  reading["dmc"],
            "dc_prev":   reading["dc"],
        }

    return dict(_DEFAULTS)


def save_moisture_state(zone_id: str, ffmc: float, dmc: float, dc: float, lon: float = 0.0):
    """Upsert today's computed codes as tomorrow's previous values."""
    conn = get_connection()
    cursor = conn.cursor()

    offset_hours = round(lon / 15)
    local_tz = timezone(timedelta(hours=offset_hours))
    local_today = datetime.now(local_tz).date()

    cursor.execute(
        "SELECT updated_at FROM moisture_state WHERE zone_id = ?",
        (zone_id,)
    )
    row = cursor.fetchone()

    if row:
        updated_at = datetime.fromisoformat(row[0]).replace(tzinfo=timezone.utc)
        updated_local_date = updated_at.astimezone(local_tz).date()
        if updated_local_date == local_today:
            conn.close()
            return  # already updated today in local time
        
    cursor.execute("""
        INSERT INTO moisture_state (zone_id, ffmc_prev, dmc_prev, dc_prev, updated_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(zone_id) DO UPDATE SET
            ffmc_prev  = excluded.ffmc_prev,
            dmc_prev   = excluded.dmc_prev,
            dc_prev    = excluded.dc_prev,
            updated_at = excluded.updated_at
    """, (zone_id, ffmc, dmc, dc, datetime.utcnow()))
    conn.commit()
    conn.close()
