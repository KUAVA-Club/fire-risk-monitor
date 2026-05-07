from app.database.db import get_connection
from datetime import datetime


def save_fwi_percentiles(zone_id: str, p75: float, p90: float, p95: float, p99: float):
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO fwi_percentiles (zone_id, p75, p90, p95, p99, computed_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(zone_id) DO UPDATE SET
            p75         = excluded.p75,
            p90         = excluded.p90,
            p95         = excluded.p95,
            p99         = excluded.p99,
            computed_at = excluded.computed_at
    """, (zone_id, p75, p90, p95, p99, datetime.utcnow()))
    conn.commit()
    conn.close()


def get_fwi_percentiles(zone_id: str) -> dict | None:
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT p75, p90, p95, p99 FROM fwi_percentiles WHERE zone_id = ?",
        (zone_id,)
    )
    row = cursor.fetchone()
    conn.close()

    if row:
        return {"p75": row[0], "p90": row[1], "p95": row[2], "p99": row[3]}
    return None