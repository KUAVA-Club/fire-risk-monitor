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


def save_moisture_state(zone_id: str, ffmc: float, dmc: float, dc: float):
    """
    No-op: FWI codes are now stored directly on the weather_reading row
    via create_weather_reading(). This function is kept so risk_scorer.py
    doesn't need to change its call site.
    """
    pass