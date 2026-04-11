import uuid
from database.db import get_connection


def determine_alert_level(fri_score: float) -> str:
    """Map FRI score (0-100) to alert level string."""
    if fri_score >= 85:
        return "Extreme"
    elif fri_score >= 70:
        return "Very High"
    elif fri_score >= 50:
        return "High"
    elif fri_score >= 25:
        return "Moderate"
    else:
        return "Low"


def insert_risk_and_alert(zone_id: str, fri_score: float) -> dict:
    """
    Insert a fire_risk_score row AND a corresponding alert_event row.
    Called every time weather data is fetched from the API.
    Returns dict with score_id, alert_id, alert_level.
    """
    alert_level = determine_alert_level(fri_score)
    score_id = str(uuid.uuid4())
    alert_id = str(uuid.uuid4())

    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """INSERT INTO fire_risk_score (id, zone_id, fri_score, alert_level)
           VALUES (?, ?, ?, ?)""",
        (score_id, zone_id, fri_score, alert_level)
    )

    cursor.execute(
        """INSERT INTO alert_event (id, zone_id, score_id, level, acknowledged)
           VALUES (?, ?, ?, ?, 0)""",
        (alert_id, zone_id, score_id, alert_level)
    )

    conn.commit()
    conn.close()

    return {
        "score_id": score_id,
        "alert_id": alert_id,
        "alert_level": alert_level
    }
