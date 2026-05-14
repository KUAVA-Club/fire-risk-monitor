from app.database.db import get_connection

_WINDOW_TO_SQLITE = {
    "1h":  "-1 hours",
    "24h": "-24 hours",
    "7d":  "-7 days",
}


def get_recent_alerts(since: str = "24h") -> list[dict]:
    """
    Return alert_event rows joined with grid_zone centroids,
    filtered to those triggered within the given window.
    """
    window = _WINDOW_TO_SQLITE.get(since, _WINDOW_TO_SQLITE["24h"])

    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute(
        """SELECT a.id,
                  (g.lat_min + g.lat_max) / 2.0 AS lat,
                  (g.lon_min + g.lon_max) / 2.0 AS lon,
                  a.level,
                  a.acknowledged,
                  a.triggered_at,
                  s.fri_score
           FROM alert_event a
           JOIN grid_zone g       ON g.id = a.zone_id
           JOIN fire_risk_score s ON s.id = a.score_id
           WHERE a.triggered_at > datetime('now', ?)
           ORDER BY a.triggered_at DESC""",
        (window,)
    )
    rows = cursor.fetchall()
    conn.close()

    return [
        {
            "id":           row[0],
            "lat":          row[1],
            "lon":          row[2],
            "level":        row[3],
            "acknowledged": bool(row[4]),
            "triggered_at": row[5],
            "fri":          row[6],
        }
        for row in rows
    ]
