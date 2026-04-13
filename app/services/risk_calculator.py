def calculate_fire_risk(temperature, wind_speed, humidity, precipitation, soil_moisture) -> dict:
    score = 0

    # temperature contribution
    if temperature > 35:
        score += 40
    elif temperature > 25:
        score += 20
    elif temperature > 15:
        score += 10

    # wind speed contribution
    if wind_speed > 30:
        score += 25
    elif wind_speed > 15:
        score += 15
    elif wind_speed > 5:
        score += 5

    # humidity contribution (lower = more risk)
    if humidity < 20:
        score += 20
    elif humidity < 40:
        score += 10
    elif humidity < 60:
        score += 5

    # precipitation contribution (lower = more risk)
    if precipitation == 0:
        score += 10
    elif precipitation < 2:
        score += 5

    # soil moisture contribution (lower = more risk)
    if soil_moisture < 0.1:
        score += 5

    # determine alert level
    if score >= 70:
        alert_level = "Extreme"
    elif score >= 50:
        alert_level = "High"
    elif score >= 30:
        alert_level = "Medium"
    else:
        alert_level = "Low"

    return {
        "risk_index": score,
        "alert_level": alert_level
    }