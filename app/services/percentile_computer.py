import numpy as np
from datetime import datetime
from app.services.historical_weather import get_historical_weather
from app.services.risk_scorer import calculate_fwi_from_weather
from app.database.crud.percentiles import save_fwi_percentiles
from app.database.db import get_connection
from app.core.logger import logger


def compute_and_store_percentiles(zone_id: str):
    """Fetch 10 years of historical weather, run FWI on each day, store percentiles."""
    logger.info(f"Background task started — computing percentiles for zone {zone_id}")
    
    # get zone center point
    conn = get_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT lat_min, lon_min FROM grid_zone WHERE id = ?", (zone_id,))
    row = cursor.fetchone()
    conn.close()

    if not row:
        return

    lat_center = round(row[0] + 0.025, 6)
    lon_center = round(row[1] + 0.025, 6)

    # fetch 10 years of daily weather
    days = get_historical_weather(lat_center, lon_center)

    # run FWI sequentially — each day feeds into the next
    fwi_values = []
    ffmc_prev, dmc_prev, dc_prev = 85.0, 6.0, 15.0  # CFS startup defaults

    for day in days:
        try:
            fwi, ffmc, dmc, dc = calculate_fwi_from_weather(
                temp=day["temperature"],
                rh=day["humidity"],
                wind=day["wind"],
                rain=day["rain"],
                month=day["month"],
                ffmc_prev=ffmc_prev,
                dmc_prev=dmc_prev,
                dc_prev=dc_prev
            )
            fwi_values.append(fwi)
            ffmc_prev, dmc_prev, dc_prev = ffmc, dmc, dc
        except Exception:
            # skip bad data points, carry forward previous state
            continue

    if len(fwi_values) < 365:
        # not enough data to compute meaningful percentiles
        return

    # compute percentiles
    p75 = float(np.percentile(fwi_values, 75))
    p90 = float(np.percentile(fwi_values, 90))
    p95 = float(np.percentile(fwi_values, 95))
    p99 = float(np.percentile(fwi_values, 99))

    save_fwi_percentiles(zone_id, p75, p90, p95, p99)
    logger.info(f"Percentiles computed — zone {zone_id}: p75={p75}, p90={p90}, p95={p95}, p99={p99}")