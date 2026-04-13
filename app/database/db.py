import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "fire_monitor.db")


def get_connection() -> sqlite3.Connection:
    """Return a new SQLite connection with foreign keys enabled."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn
