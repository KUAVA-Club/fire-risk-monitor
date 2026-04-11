# package database/
```
.
├── crud
│   ├── grid.py
│   └── weather.py
├── db.py
├── init_db.py
└── README.md
```
**db.py** - to initialize connection with database. Used in crud/ package\
**init_db** - before starting server, initialize database, should be runned once. Will create file ```fire_monitor.db```

### crud/
Package is for files that are used to manipulate: create, remove, update, delete datas from the tables.

**grid.py** manipulate with table ```grid_zone```\
**weather.py** manipulate with table ```weather_readings```