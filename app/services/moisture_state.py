from app.database.db import get_connection
from datetime import datetime

def get_moisture_state(zone_id: str) -> dict:
    """Fetch previous moisture codes for a zone, or return startup defaults."""
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT ffmc_prev, dmc_prev, dc_prev FROM moisture_state WHERE zone_id = ?",
        (zone_id,)
    )
    row = cursor.fetchone()
    conn.close()

    if row:
        return {"ffmc_prev": row[0], "dmc_prev": row[1], "dc_prev": row[2]}
    
    # Canadian Forest Service standard startup defaults
    return {"ffmc_prev": 85.0, "dmc_prev": 6.0, "dc_prev": 15.0}


def save_moisture_state(zone_id: str, ffmc: float, dmc: float, dc: float):
    """Upsert today's computed codes as tomorrow's previous values."""
    conn = get_connection()
    cursor = conn.cursor()
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