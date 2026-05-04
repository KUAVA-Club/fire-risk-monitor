import requests
from app.core.logger import logger

MODIS_URL = "https://modis.ornl.gov/rst/api/v1/MCD12Q1/subset"

# IGBP Land Cover Classification (LC_Type1)
LAND_COVER_CLASSES = {
    1:  "Evergreen Needleleaf Forests",
    2:  "Evergreen Broadleaf Forests",
    3:  "Deciduous Needleleaf Forests",
    4:  "Deciduous Broadleaf Forests",
    5:  "Mixed Forests",
    6:  "Closed Shrublands",
    7:  "Open Shrublands",
    8:  "Woody Savannas",
    9:  "Savannas",
    10: "Grasslands",
    11: "Permanent Wetlands",
    12: "Croplands",
    13: "Urban and Built-up Lands",
    14: "Cropland/Natural Vegetation Mosaics",
    15: "Snow and Ice",
    16: "Barren",
    17: "Water Bodies",
}

FIRE_RELEVANT_CLASSES = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10}

NOT_RELEVANT_REASONS = {
    11: "Permanent wetland — not relevant for fire risk",
    12: "Agricultural cropland — not relevant for fire risk",
    13: "Urban/built-up area — not relevant for fire risk",
    14: "Cropland mosaic — not relevant for fire risk",
    15: "Snow and ice — not relevant for fire risk",
    16: "Barren land — not relevant for fire risk",
    17: "Water body — not relevant for fire risk",
}


def get_land_cover(lat: float, lon: float) -> dict:
    """
    Query NASA MODIS (MCD12Q1) for IGBP land cover class at a given point.

    Returns:
        {
            "relevant": True/False,
            "land_cover_class": int,
            "land_cover_name": str,
            "reason": str or None   (only set when not relevant)
        }
    """
    try:
        response = requests.get(MODIS_URL, params={
            "latitude": lat,
            "longitude": lon,
            "band": "LC_Type1",
            "startDate": "A2022001",
            "endDate": "A2022001",
            "kmAboveBelow": 0,
            "kmLeftRight": 0,
        }, timeout=10)

        data = response.json()

        if response.status_code == 400 or not isinstance(data, dict):
            logger.info(f"No MODIS data for ({lat}, {lon}) — likely ocean or unmapped")
            return {"relevant": False, "land_cover_class": 0, "land_cover_name": "Ocean/No Data", "reason": "Ocean or unmapped area — not relevant for fire risk"}

        if response.status_code != 200:
            logger.warning(f"MODIS API error for ({lat}, {lon}): status {response.status_code}")
            return {"relevant": True, "land_cover_class": None, "land_cover_name": "Unknown", "reason": None}

        subset = data.get("subset", [])
        if not subset:
            logger.info(f"No MODIS data for ({lat}, {lon}) — likely ocean")
            return {"relevant": False, "land_cover_class": 0, "land_cover_name": "Ocean/No Data", "reason": "Ocean or unmapped area — not relevant for fire risk"}

        class_code = subset[0]["data"][0]
        class_name = LAND_COVER_CLASSES.get(class_code, "Unknown")
        relevant = class_code in FIRE_RELEVANT_CLASSES
        reason = NOT_RELEVANT_REASONS.get(class_code) if not relevant else None

        logger.info(f"Land cover at ({lat}, {lon}): {class_name} (class {class_code}) — {'relevant' if relevant else 'NOT relevant'}")

        return {
            "relevant": relevant,
            "land_cover_class": class_code,
            "land_cover_name": class_name,
            "reason": reason,
        }

    except requests.exceptions.Timeout:
        logger.warning(f"MODIS API timeout for ({lat}, {lon}) — defaulting to relevant")
        return {"relevant": True, "land_cover_class": None, "land_cover_name": "Unknown (timeout)", "reason": None}
    except Exception as e:
        logger.warning(f"MODIS API error for ({lat}, {lon}): {e} — defaulting to relevant")
        return {"relevant": True, "land_cover_class": None, "land_cover_name": "Unknown (error)", "reason": None}
