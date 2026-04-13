import requests
import csv
from io import StringIO
from collections import defaultdict

API_KEY = "9ed90f897b5877c600e11ce052e776b0"

URL = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{API_KEY}/VIIRS_SNPP_NRT/world/1"


def confidence_weight(conf):
    if conf == "high":
        return 3
    elif conf == "nominal":
        return 2
    else:
        return 1


def get_zone(lat, lon, step=0.5):
    """Convert lat/lon into grid zone"""
    return (round(lat / step) * step, round(lon / step) * step)


def fetch_fires():
    res = requests.get(URL)
    csv_data = StringIO(res.text)
    reader = csv.DictReader(csv_data)
    return list(reader)


def compute_danger_zones(fires):
    zones = defaultdict(lambda: {"score": 0, "lat": 0, "lon": 0, "count": 0})

    for f in fires:
        try:
            lat = float(f["latitude"])
            lon = float(f["longitude"])
            frp = float(f.get("frp", 0))
            conf = f.get("confidence", "low")

            zone_key = get_zone(lat, lon)

            score = frp + confidence_weight(conf)

            zones[zone_key]["score"] += score
            zones[zone_key]["lat"] = zone_key[0]
            zones[zone_key]["lon"] = zone_key[1]
            zones[zone_key]["count"] += 1

        except:
            continue

    # sort zones by danger
    sorted_zones = sorted(
        zones.values(),
        key=lambda x: x["score"],
        reverse=True
    )

    return sorted_zones[:5]


def get_top_5_danger_zones():
    fires = fetch_fires()
    top_zones = compute_danger_zones(fires)

    return [
        {
            "lat": z["lat"],
            "lon": z["lon"],
            "fri": round(z["score"], 2),
            "fire_count": z["count"]
        }
        for z in top_zones
    ]