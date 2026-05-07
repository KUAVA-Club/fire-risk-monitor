import math
from datetime import datetime
from .moisture_state import get_moisture_state, save_moisture_state
from app.database.crud.percentiles import get_fwi_percentiles


def compute_ffmc(temp: float, rh: float, wind: float, rain: float, ffmc_prev: float = 85.0) -> float:
    mo = 147.2 * (101 - ffmc_prev) / (59.5 + ffmc_prev)
    if rain > 0.5:
        rf = rain - 0.5
        if mo <= 150:
            mo += 42.5 * rf * math.exp(-100 / (251 - mo)) * (1 - math.exp(-6.93 / rf))
        else:
            mo += 42.5 * rf * math.exp(-100 / (251 - mo)) * (1 - math.exp(-6.93 / rf)) + 0.0015 * (mo - 150)**2 * rf**0.5
        mo = min(mo, 250)
    ed = 0.942 * rh**0.679 + 11 * math.exp((rh - 100) / 10) + 0.18 * (21.1 - temp) * (1 - math.exp(-0.115 * rh))
    ew = 0.618 * rh**0.753 + 10 * math.exp((rh - 100) / 10) + 0.18 * (21.1 - temp) * (1 - math.exp(-0.115 * rh))
    if mo > ed:
        kd = 0.424 * (1 - (rh / 100)**1.7) + 0.0694 * wind**0.5 * (1 - (rh / 100)**8)
        ko = kd * 0.581 * math.exp(0.0365 * temp)
        m = ed + (mo - ed) * 10**(-ko)
    elif mo < ew:
        kw = 0.424 * (1 - ((100 - rh) / 100)**1.7) + 0.0694 * wind**0.5 * (1 - ((100 - rh) / 100)**8)
        k1 = kw * 0.581 * math.exp(0.0365 * temp)
        m = ew - (ew - mo) * 10**(-k1)
    else:
        m = mo
    return 59.5 * (250 - m) / (147.2 + m)

def compute_dmc(temp: float, rh: float, rain: float, dmc_prev: float = 6.0, month: int = 6) -> float: 
    day_length = [6.5,7.5,9.0,12.8,13.9,13.9,12.4,10.9,9.4,8.0,7.0,6.0]
    dl = day_length[month - 1]
    if rain > 1.5:
        re = 0.92 * rain - 1.27
        mo = 20 + math.exp(5.6348 - dmc_prev / 43.43)
        b = 100 / (0.5 + 0.3 * dmc_prev) if dmc_prev <= 33 else (14 - 1.3 * math.log(dmc_prev) if dmc_prev <= 65 else 6.2 * math.log(dmc_prev) - 17.2)
        mr = mo + 1000 * re / (48.77 + b * re)
        pr = 244.72 - 43.43 * math.log(mr - 20)
        dmc_prev = max(pr, 0)
    if temp > -1.1:
        k = 1.894 * (temp + 1.1) * (100 - rh) * dl * 1e-6
        return dmc_prev + 100 * k
    return dmc_prev

def compute_dc(temp: float, rain: float, dc_prev: float = 15.0, month: int = 6) -> float:
    lf = [-1.6,-1.6,-1.6,0.9,3.8,5.8,6.4,5.0,2.4,0.4,-1.6,-1.6]
    fl = lf[month - 1]
    if rain > 2.8:
        rd = 0.83 * rain - 1.27
        qo = 800 * math.exp(-dc_prev / 400)
        qr = qo + 3.937 * rd
        dr = 400 * math.log(800 / qr)
        dc_prev = max(dr, 0)
    if temp > -2.8:
        v = 0.36 * (temp + 2.8) + fl
        return dc_prev + 0.5 * max(v, 0)
    return dc_prev

def compute_isi(wind: float, ffmc: float) -> float:
    fm = 147.2 * (101 - ffmc) / (59.5 + ffmc)
    fw = math.exp(0.05039 * wind)
    ff = 91.9 * math.exp(-0.1386 * fm) * (1 + fm**5.31 / 4.93e7)
    return 0.208 * fw * ff

def compute_bui(dmc: float, dc: float) -> float:
    if dmc <= 0.4 * dc:
        return 0.8 * dmc * dc / (dmc + 0.4 * dc)
    else:
        return dmc - (1 - 0.8 * dc / (dmc + 0.4 * dc)) * (0.92 + (0.0114 * dmc)**1.7)

def compute_fwi(isi: float, bui: float) -> float:
    if bui <= 80:
        fd = 0.626 * bui**0.809 + 2.0
    else:
        fd = 1000 / (25 + 108.64 * math.exp(-0.023 * bui))
    b = 0.1 * isi * fd
    if b > 1:
        return math.exp(2.72 * (0.434 * math.log(b))**0.647)
    return b

def calculate_fwi_from_weather(temp: float, rh: float, wind: float, rain: float, month: int,
                               ffmc_prev: float = 85.0, dmc_prev: float = 6.0, dc_prev: float = 15.0
                                 ) -> tuple[float, float, float, float]:
    ffmc = compute_ffmc(temp, rh, wind, rain, ffmc_prev)
    dmc  = compute_dmc(temp, rh, rain, dmc_prev, month)
    dc   = compute_dc(temp, rain, dc_prev, month)
    isi  = compute_isi(wind, ffmc)
    bui  = compute_bui(dmc, dc)
    fwi  = compute_fwi(isi, bui)
    return round(fwi, 2), ffmc, dmc, dc


def normalize_fwi(raw_fwi: float) -> float:
    return min(raw_fwi, 100.0)

def compute_fri(fwi_raw: float, ndvi: float) -> float:
    fwi_score = normalize_fwi(fwi_raw)
    vegetation_score = (1 - ndvi) / 2 * 100
    return round(fwi_score * 0.65 + vegetation_score * 0.35, 2)

def get_alert_level(fwi: float, zone_id: str) -> str:
    percentiles = get_fwi_percentiles(zone_id)
    
    if percentiles is None:
        # Canadian Forest Service standard fallback until percentiles are computed
        if fwi < 8:  return "LOW"
        if fwi < 17: return "MODERATE"
        if fwi < 32: return "HIGH"
        if fwi < 49: return "VERY_HIGH"
        return "EXTREME"

    if fwi < percentiles["p75"]: return "LOW"
    if fwi < percentiles["p90"]: return "MODERATE"
    if fwi < percentiles["p95"]: return "HIGH"
    if fwi < percentiles["p99"]: return "VERY_HIGH"
    return "EXTREME"


def calculate_fire_risk(zone_id: str,temperature, wind_speed, humidity, precipitation, soil_moisture, lon: float = 0.0) -> dict:
    month = datetime.now().month
    moisture_state = get_moisture_state(zone_id)  
    fwi, ffmc, dmc, dc = calculate_fwi_from_weather(temperature, humidity, wind_speed, precipitation, month,
                                                    ffmc_prev=moisture_state["ffmc_prev"],
                                                    dmc_prev=moisture_state["dmc_prev"],
                                                    dc_prev=moisture_state["dc_prev"]
                                                    )
    save_moisture_state(zone_id, ffmc, dmc, dc)
    ndvi = 1 - (soil_moisture * 2)  # TODO: replace with actual NDVI from API
    fri = compute_fri(fwi, ndvi)
    level = get_alert_level(fwi, zone_id)
    return {
        "risk_index": fri,
        "alert_level": level
    }

