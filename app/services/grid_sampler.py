import openmeteo_requests
import pandas as pd
import requests_cache
import uuid
from retry_requests import retry
from datetime import datetime
from app.services.risk_scorer import calculate_fire_risk, get_alert_level
from app.core.logger import logger

GRID_SIZE = 0.05
ALPHA = 0.4


def _get_or_create_zone_id(lat: float, lon: float) -> str:
    """Derive a stable zone_id from the grid cell's snapped coordinates."""
    from app.database.crud.grid import create_grid_zone
    return create_grid_zone({"lat": lat, "long": lon})


def _get_sub_locations(lat: float, lon: float) -> list[tuple[float, float]]:
    """Generate 9 sub-locations (3x3) within a 0.05° grid cell."""
    lat_min = (lat // GRID_SIZE) * GRID_SIZE
    lon_min = (lon // GRID_SIZE) * GRID_SIZE
    step = GRID_SIZE / 3
    offset = step / 2

    points = []
    for i in range(3):
        for j in range(3):
            sub_lat = round(lat_min + offset + i * step, 6)
            sub_lon = round(lon_min + offset + j * step, 6)
            points.append((sub_lat, sub_lon))
    return points


def _fetch_multi_weather(points: list[tuple[float, float]]) -> list[dict]:
    """Fetch weather for multiple coordinates in one Open-Meteo API call."""
    cache_session = requests_cache.CachedSession('.cache', expire_after=3600)
    retry_session = retry(cache_session, retries=5, backoff_factor=0.2)
    openmeteo = openmeteo_requests.Client(session=retry_session)

    lats = [p[0] for p in points]
    lons = [p[1] for p in points]

    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lats,
        "longitude": lons,
        "hourly": ["temperature_2m", "soil_temperature_0cm", "soil_moisture_0_to_1cm",
                    "relative_humidity_2m", "precipitation", "wind_speed_10m"],
        "daily": ["precipitation_sum"],
        "forecast_days": 1
    }

    responses = openmeteo.weather_api(url, params=params)
    results = []

    for i, response in enumerate(responses):
        hourly = response.Hourly()
        daily = response.Daily()

        temp_arr = hourly.Variables(0).ValuesAsNumpy()
        soil_temp_arr = hourly.Variables(1).ValuesAsNumpy()
        soil_moist_arr = hourly.Variables(2).ValuesAsNumpy()
        rh_arr = hourly.Variables(3).ValuesAsNumpy()
        precip_arr = hourly.Variables(4).ValuesAsNumpy()
        wind_arr = hourly.Variables(5).ValuesAsNumpy()
        precip_sum = daily.Variables(0).ValuesAsNumpy()[0]

        times = pd.date_range(
            start=pd.to_datetime(hourly.Time(), unit="s", utc=True),
            end=pd.to_datetime(hourly.TimeEnd(), unit="s", utc=True),
            freq=pd.Timedelta(seconds=hourly.Interval()),
            inclusive="left"
        )
        idx = times.indexer_at_time("12:00")
        idx = idx[0] if len(idx) > 0 else 0

        results.append({
            "lat": points[i][0],
            "long": points[i][1],
            "temperature_2m": float(temp_arr[idx]),
            "soil_temperature_0cm": float(soil_temp_arr[idx]),
            "soil_moisture_0_to_1cm": float(soil_moist_arr[idx]),
            "relative_humidity_2m": float(rh_arr[idx]),
            "precipitation": float(precip_arr[idx]),
            "wind_speed_10m": float(wind_arr[idx]),
            "precipitation_sum": float(precip_sum),
        })

    return results


def compute_grid_fri(sub_results: list[dict], zone_id: str) -> dict:
    """
    Compute composite FRI from 9 sub-location results.

    Formula: R = α · max(ri) + (1 - α) · Σ(wi · ri)
    - α = 0.4 (weight on worst-case hotspot)
    - wi = 1/9 (equal weights for weighted average)
    - Wind speed = simple average across all sub-locations
    """
    fri_values = []
    wind_speeds = []
    temps = []

    last_fwi_codes = {}
    for sub in sub_results:
        risk = calculate_fire_risk(
            zone_id,
            sub["temperature_2m"],
            sub["wind_speed_10m"],
            sub["relative_humidity_2m"],
            sub["precipitation_sum"],
            sub["soil_moisture_0_to_1cm"]
        )
        fri_values.append(risk["risk_index"])
        wind_speeds.append(sub["wind_speed_10m"])
        temps.append(sub["temperature_2m"])
        last_fwi_codes = {"ffmc": risk["ffmc"], "dmc": risk["dmc"], "dc": risk["dc"]}

    n = len(fri_values)
    max_fri = max(fri_values)
    weighted_avg = sum(fri_values) / n

    composite_fri = round(ALPHA * max_fri + (1 - ALPHA) * weighted_avg, 2)
    avg_wind = round(sum(wind_speeds) / n, 2)
    avg_temp = round(sum(temps) / n, 2)
    alert_level = get_alert_level(composite_fri, zone_id)

    logger.info(
        f"Grid FRI: {composite_fri} (max={max_fri:.2f}, avg={weighted_avg:.2f}, "
        f"α={ALPHA}) — {alert_level}"
    )

    return {
        "risk_index": composite_fri,
        "alert_level": alert_level,
        "temp": avg_temp,
        "wind_speed": avg_wind,
        "max_fri": round(max_fri, 2),
        "avg_fri": round(weighted_avg, 2),
        "sub_fri_values": [round(v, 2) for v in fri_values],
        "ffmc": last_fwi_codes.get("ffmc"),
        "dmc": last_fwi_codes.get("dmc"),
        "dc": last_fwi_codes.get("dc"),
    }

def assess_grid_fire_risk(lat: float, lon: float) -> dict:
    """
    Main entry point: sample 9 sub-locations, fetch weather for all
    in one API call, compute composite FRI.
    """
    points = _get_sub_locations(lat, lon)
    logger.info(f"Fetching weather for 9 sub-locations in grid ({lat}, {lon})")

    zone_id = _get_or_create_zone_id(lat, lon)
    logger.info(f"Using zone_id: {zone_id} for grid ({lat}, {lon})")

    sub_results = _fetch_multi_weather(points)

    result = compute_grid_fri(sub_results, zone_id)
    result["center_weather"] = sub_results[4]
    result["zone_id"] = zone_id  # expose so the route doesn't need to re-create it

    return result