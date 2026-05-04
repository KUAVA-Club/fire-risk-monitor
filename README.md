# Forest Fire Risk Monitor 

Calculates a Fire Risk Index (FRI) score for a geographic zone using the
Canadian FWI system (Van Wagner & Pickett, 1985) and Open-Meteo weather data.

## Setup
```bash
pip install httpx python-dotenv tenacity
```

## Usage
```python
import asyncio
from risk_scorer import get_risk

result = asyncio.run(get_risk(lat=37.5, lon=-119.5, ndvi=0.3))
print(result)
```

## Inputs

| Parameter | Type | Description |
|-----------|------|-------------|
| `lat` | float | Latitude (WGS84) |
| `lon` | float | Longitude (WGS84) |
| `ndvi` | float | Vegetation dryness from sensor (−1 to +1) |

## Data sources

- **Weather:** Using Open-Meteo API, extracted `temperature_2m_max`, `relative_humidity_2m_mean`, `wind_speed_10m_max`, `precipitation_sum`
- **Vegetation:** NDVI from physical IoT sensor

## Reference

Van Wagner, C.E. & Pickett, T.L. (1985). *Equations and FORTRAN Program for the
Canadian Forest Fire Weather Index System.* Forestry Technical Report 33.
# Fire Risk Monitor

**Fire Risk Monitor** is a web-based system that analyzes real-time weather data (such as temperature, wind speed, moisture, etc.) to assess and visualize potential fire risk across geographic zones. It integrates a backend API for data processing and storage with an interactive map-based frontend, enabling users to explore high-risk areas dynamically based on location inputs.

## Package Architecture

```
.
├── app
│   ├── database/                            // database realted directory
│   │   ├── crud                            // manipulate database directory
|   |   |   ├── grid.py                     // operation on grid_zone table
│   │   |   └── weather.py                 // operations on weather_readings table 
│   │   ├── db.py                         // creating connection with database
│   │   └── init_db.py                    // file to create database (runned once)
│   ├── main.py                           // To initiallization of program
│   ├── routes/                           // routes for requests
│   │   └── fire.py                       // handles main requests from home page
│   ├── schemas/                         // schemas based on tables(future use)
│   │   ├── alert_event_schema.py
│   │   ├── drone_dispatch_schema.py
│   │   ├── fire_risk_score_schema.py
│   │   ├── grid_zone_schema.py
│   │   ├── satellite_detection_schema.py
│   │   └── weather_reading_schema.py
│   ├── services/                       // services used in project(mostly API)
│   │   └── open_meteo_api.py          // service to retrivev data from open_meteo api
│   ├── static/                         // static files js and css
│   │   ├── css
│   │   └── js
│   └── templates/                      // templates for frontend, html files
│       └── index.html
├── README.md
└── requirements.txt                    // libraries used
```

To run the program, first run ```init_db.py``` to initialize database that will be used. It will create file named ```file_monitor.db``` containing all tables.

To run the program, from **/ directory** run:
```
uvicorn app.main:app --reload
```
Server will start whose address will be printed. Home page is ```[local_address]/map```.
