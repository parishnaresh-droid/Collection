import os
import psycopg2
import psycopg2.extras


def get_conn():
    url = os.environ["DATABASE_URL"]
    return psycopg2.connect(url)


SCHEMA = """
CREATE TABLE IF NOT EXISTS profiles (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    chest NUMERIC NOT NULL,
    waist NUMERIC NOT NULL,
    hip NUMERIC NOT NULL,
    skin_hex TEXT NOT NULL,
    undertone TEXT NOT NULL,
    depth TEXT NOT NULL,
    shape TEXT NOT NULL,
    shape_reason TEXT NOT NULL,
    palette_label TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    store TEXT NOT NULL,
    title TEXT NOT NULL,
    color_matched TEXT NOT NULL,
    color_label TEXT,
    price NUMERIC,
    available BOOLEAN,
    url TEXT NOT NULL,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_color ON products (color_matched);
"""


def init_schema():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def dict_cursor(conn):
    return conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
