import openmeteo_requests

import pandas as pd
import requests_cache
from retry_requests import retry
from datetime import datetime, timezone

def getData(lat,long):
    # Setup the Open-Meteo API client with cache and retry on error
    cache_session = requests_cache.CachedSession('.cache', expire_after = 3600)
    retry_session = retry(cache_session, retries = 5, backoff_factor = 0.2)
    openmeteo = openmeteo_requests.Client(session = retry_session)

    # Make sure all required weather variables are listed here
    # The order of variables in hourly or daily is important to assign them correctly below
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": long,
        "hourly": ["temperature_2m", "soil_temperature_0cm", "soil_moisture_0_to_1cm", "relative_humidity_2m", "precipitation", "wind_speed_10m"],
        "daily": ["precipitation_sum"],
        "forecast_days": 1
    }
    responses = openmeteo.weather_api(url, params=params)

    # Process first location. Add a for-loop for multiple locations or weather models
    response = responses[0]
    daily = response.Daily()
    print(f"Coordinates: {response.Latitude()}°N {response.Longitude()}°E")
    print(f"Elevation: {response.Elevation()} m asl")
    print(f"Timezone difference to GMT+0: {response.UtcOffsetSeconds()}s")

    # Process hourly data. The order of variables needs to be the same as requested.
    hourly = response.Hourly()
    hourly_temperature_2m = hourly.Variables(0).ValuesAsNumpy()
    hourly_soil_temperature_0cm = hourly.Variables(1).ValuesAsNumpy()
    hourly_soil_moisture_0_to_1cm = hourly.Variables(2).ValuesAsNumpy()
    hourly_relative_humidity_2m = hourly.Variables(3).ValuesAsNumpy()
    hourly_precipitation = hourly.Variables(4).ValuesAsNumpy()
    hourly_wind_speed_10m = hourly.Variables(5).ValuesAsNumpy()
    precipitation_sum = daily.Variables(0).ValuesAsNumpy()[0]

    hourly_data = {"date": pd.date_range(
        start = pd.to_datetime(hourly.Time(), unit = "s", utc = True),
        end =  pd.to_datetime(hourly.TimeEnd(), unit = "s", utc = True),
        freq = pd.Timedelta(seconds = hourly.Interval()),
        inclusive = "left"
    )}

    hourly_data["temperature_2m"] = hourly_temperature_2m
    hourly_data["soil_temperature_0cm"] = hourly_soil_temperature_0cm
    hourly_data["soil_moisture_0_to_1cm"] = hourly_soil_moisture_0_to_1cm
    hourly_data["relative_humidity_2m"] = hourly_relative_humidity_2m
    hourly_data["precipitation"] = hourly_precipitation
    hourly_data["wind_speed_10m"] = hourly_wind_speed_10m

    datas = {}
  
    # get timestamps
    times = pd.to_datetime(hourly_data["date"])

    idx = times.indexer_at_time("12:00")
    if len(idx) == 0:
        idx = 0  # fallback
    else:
        idx = idx[0]

    datas["lat"] = lat
    datas["long"] = long
    # --- NEW: Added elevation so fire.py can see it! ---
    datas["elevation"] = float(response.Elevation()) 
    # ---------------------------------------------------
    datas["temperature_2m"] = hourly_temperature_2m[idx]
    datas["soil_temperature_0cm"] = hourly_soil_temperature_0cm[idx]
    datas["soil_moisture_0_to_1cm"] = hourly_soil_moisture_0_to_1cm[idx]
    datas["relative_humidity_2m"] = hourly_relative_humidity_2m[idx]
    datas["precipitation"] = hourly_precipitation[idx]
    datas["wind_speed_10m"] = hourly_wind_speed_10m[idx]

    datas["precipitation_sum"] = precipitation_sum

    hourly_dataframe = pd.DataFrame(data = hourly_data)
    print("\nHourly data\n", hourly_dataframe)
    return datas