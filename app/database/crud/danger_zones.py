import uuid
from app.database.db import get_connection
from app.services.most_dangerous_zones import get_top_5_danger_zones
from app.core.logger import logger

CACHE_TTL_MINUTES = 15


def _get_alert_level(fri: float) -> str:
    if fri >= 85:
        return "EXTREME"
    if fri >= 70:
        return "VERY_HIGH"
    if fri >= 50:
        return "HIGH"
    if fri >= 25:
        return "MODERATE"
    return "LOW"


def _get_cached_zones() -> list[dict] | None:
    """Return cached danger zones if they are less than 15 minutes old."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute(
        """SELECT lat, lon, fri, fire_count, alert_level, fetched_at
           FROM danger_zone_cache
           WHERE fetched_at > datetime('now', ?)
           ORDER BY fri DESC""",
        (f'-{CACHE_TTL_MINUTES} minutes',)
    )

    rows = cursor.fetchall()
    conn.close()

    if not rows:
        return None

    return [
        {
            "lat": row[0],
            "lon": row[1],
            "fri": row[2],
            "fire_count": row[3],
            "alert_level": row[4],
            "fetched_at": row[5]
        }
        for row in rows
    ]


def _save_zones_to_cache(zones: list[dict]):
    """Clear old cache and insert fresh danger zone data."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.execute("DELETE FROM danger_zone_cache")

    for zone in zones:
        alert_level = _get_alert_level(zone["fri"])
        cursor.execute(
            """INSERT INTO danger_zone_cache
               (id, lat, lon, fri, fire_count, alert_level)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (
                str(uuid.uuid4()),
                zone["lat"],
                zone["lon"],
                zone["fri"],
                zone["fire_count"],
                alert_level
            )
        )

    conn.commit()
    conn.close()


def _backfill_if_needed(old_zones: list[dict], new_zones: list[dict]) -> list[dict]:
    """
    If any previously-extreme zone dropped below extreme after recomputation,
    fetch fresh data from the API to find replacement high-risk zones.
    """
    old_extreme = [z for z in old_zones if z["alert_level"] == "EXTREME"]
    new_extreme = [z for z in new_zones if _get_alert_level(z["fri"]) == "EXTREME"]

    if len(new_extreme) < len(old_extreme):
        lost = len(old_extreme) - len(new_extreme)
        logger.info(f"Extreme zone count dropped by {lost} — backfilling from API")

        fresh = get_top_5_danger_zones()

        existing_keys = {(z["lat"], z["lon"]) for z in new_zones}
        candidates = [z for z in fresh if (z["lat"], z["lon"]) not in existing_keys]

        candidates.sort(key=lambda z: z["fri"], reverse=True)
        new_zones.extend(candidates[:lost])

    return new_zones


def get_cached_danger_zones() -> list[dict]:
    """
    Main entry point for the /fire/dangerZones endpoint.
    Returns cached data if fresh, otherwise fetches + caches new data.
    """
    cached = _get_cached_zones()

    if cached:
        logger.info(f"Danger zone cache hit — {len(cached)} zones from {cached[0]['fetched_at']}")
        return cached

    logger.info("Danger zone cache miss — fetching from NASA FIRMS API")
    fresh_zones = get_top_5_danger_zones()

    for zone in fresh_zones:
        zone["alert_level"] = _get_alert_level(zone["fri"])

    _save_zones_to_cache(fresh_zones)
    logger.info(f"Cached {len(fresh_zones)} danger zones")

    return fresh_zones


def refresh_danger_zones() -> list[dict]:
    """
    Force a refresh: fetch new data, compare with old cache,
    backfill if extreme count dropped, then update cache.
    """
    old_cached = _get_cached_zones() or []

    logger.info("Refreshing danger zones from NASA FIRMS API")
    fresh_zones = get_top_5_danger_zones()

    if old_cached:
        fresh_zones = _backfill_if_needed(old_cached, fresh_zones)

    for zone in fresh_zones:
        zone["alert_level"] = _get_alert_level(zone["fri"])

    _save_zones_to_cache(fresh_zones)
    logger.info(f"Refreshed and cached {len(fresh_zones)} danger zones")

    return fresh_zones
