import openmeteo_requests
import pandas as pd
import requests_cache
from retry_requests import retry
from datetime import datetime, timedelta


def get_historical_weather(lat: float, lon: float) -> list[dict]:
    """Fetch 10 years of daily weather for a given lat/lon."""
    cache_session = requests_cache.CachedSession('.cache', expire_after=-1)  # cache forever for historical
    retry_session = retry(cache_session, retries=5, backoff_factor=0.2)
    openmeteo = openmeteo_requests.Client(session=retry_session)

    end_date = (datetime.utcnow() - timedelta(days=1)).strftime("%Y-%m-%d")
    start_date = (datetime.utcnow() - timedelta(days=365 * 10)).strftime("%Y-%m-%d")

    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": start_date,
        "end_date": end_date,
        "daily": [
            "temperature_2m_max",
            "relative_humidity_2m_mean",
            "wind_speed_10m_max",
            "precipitation_sum"
        ]
    }

    url = "https://archive-api.open-meteo.com/v1/archive"
    responses = openmeteo.weather_api(url, params=params)
    response = responses[0]

    daily = response.Daily()
    dates = pd.date_range(
        start=pd.to_datetime(daily.Time(), unit="s", utc=True),
        end=pd.to_datetime(daily.TimeEnd(), unit="s", utc=True),
        freq=pd.Timedelta(seconds=daily.Interval()),
        inclusive="left"
    )

    result = []
    for i, date in enumerate(dates):
        result.append({
            "date": date,
            "month": date.month,
            "temperature": float(daily.Variables(0).ValuesAsNumpy()[i]),
            "humidity": float(daily.Variables(1).ValuesAsNumpy()[i]),
            "wind": float(daily.Variables(2).ValuesAsNumpy()[i]),
            "rain": float(daily.Variables(3).ValuesAsNumpy()[i]),
        })

    return result