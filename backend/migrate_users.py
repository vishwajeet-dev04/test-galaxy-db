import json
from pathlib import Path
from sqlalchemy import create_engine, text

# ✅ Replace with your Render EXTERNAL Database URL
RENDER_DB_URL = "postgresql://galaxy_db_x45g_user:u0Tn4L9qmftOmlbYeVPxnCnuhgh8WWGs@dpg-d9otpr0ae00c73bb98g0-a.singapore-postgres.render.com/galaxy_db_x45g"

engine = create_engine(RENDER_DB_URL)

# Step 1 — Create the users table in PostgreSQL
with engine.connect() as conn:
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS users (
            id            SERIAL PRIMARY KEY,
            username      VARCHAR UNIQUE NOT NULL,
            email         VARCHAR UNIQUE,
            full_name     VARCHAR,
            hashed_password VARCHAR NOT NULL,
            role          VARCHAR DEFAULT 'user',
            employee_name VARCHAR,
            is_active     BOOLEAN DEFAULT TRUE,
            created_at    TIMESTAMP DEFAULT NOW()
        )
    """))
    conn.commit()
print("✅ Table created")

# Step 2 — Load your JSON
json_path = Path(__file__).parent / "users_export.json"
with open(json_path) as f:
    users = json.load(f)

# Step 3 — Insert all users
with engine.connect() as conn:
    for user in users:
        conn.execute(text("""
            INSERT INTO users (
                id, username, email, full_name,
                hashed_password, role, employee_name,
                is_active, created_at
            )
            VALUES (
                :id, :username, :email, :full_name,
                :hashed_password, :role, :employee_name,
                :is_active, :created_at
            )
            ON CONFLICT (username) DO NOTHING
        """), {
            **user,
            "is_active": bool(user["is_active"])  # SQLite stores 0/1, Postgres needs True/False
        })
    conn.commit()

print(f"✅ Migrated {len(users)} users successfully")