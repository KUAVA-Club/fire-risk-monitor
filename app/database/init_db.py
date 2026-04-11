"""
Run this file once to create the SQLite database with all required tables.

    python init_db.py
"""

from db import get_connection


def init_database():
    conn = get_connection()
    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS grid_zone (
            id          TEXT PRIMARY KEY,
            lat_min     REAL NOT NULL,
            lat_max     REAL NOT NULL,
            lon_min     REAL NOT NULL,
            lon_max     REAL NOT NULL,
            region_name TEXT,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS weather_reading (
            id               TEXT PRIMARY KEY,
            zone_id          TEXT NOT NULL,
            temperature_c    REAL,
            humidity_pct     REAL,
            wind_speed_kmh   REAL,
            precipitation_mm REAL,
            source_api       TEXT,
            recorded_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (zone_id) REFERENCES grid_zone(id)
        );

        CREATE TABLE IF NOT EXISTS fire_risk_score (
            id          TEXT PRIMARY KEY,
            zone_id     TEXT NOT NULL,
            fri_score   REAL,
            alert_level TEXT,
            computed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (zone_id) REFERENCES grid_zone(id)
        );

        CREATE TABLE IF NOT EXISTS satellite_detection (
            id             TEXT PRIMARY KEY,
            zone_id        TEXT NOT NULL,
            confidence_pct REAL,
            source         TEXT,
            detected_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (zone_id) REFERENCES grid_zone(id)
        );

        CREATE TABLE IF NOT EXISTS alert_event (
            id           TEXT PRIMARY KEY,
            zone_id      TEXT NOT NULL,
            score_id     TEXT NOT NULL,
            level        TEXT,
            acknowledged INTEGER DEFAULT 0,
            triggered_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (zone_id)  REFERENCES grid_zone(id),
            FOREIGN KEY (score_id) REFERENCES fire_risk_score(id)
        );

        CREATE TABLE IF NOT EXISTS drone_dispatch (
            id            TEXT PRIMARY KEY,
            alert_id      TEXT NOT NULL,
            drone_id      TEXT,
            status        TEXT DEFAULT 'IDLE',
            dispatched_at DATETIME,
            returned_at   DATETIME,
            FOREIGN KEY (alert_id) REFERENCES alert_event(id)
        );
    """)

    conn.commit()
    conn.close()
    print("Database created successfully.")


if __name__ == "__main__":
    init_database()
