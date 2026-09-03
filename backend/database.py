"""
database.py — VeritasNet Database Initialization
==================================================
Provides helpers to connect to MySQL and seed a default admin.
"""

import os
import sys
import mysql.connector
from mysql.connector import Error
import json
from datetime import datetime

# ── bcrypt import with fallback ──────────────────────────────────────────────
try:
    import bcrypt as _bcrypt

    def hash_password(plain: str) -> str:
        return _bcrypt.hashpw(plain.encode('utf-8'), _bcrypt.gensalt()).decode('utf-8')

    def check_password(plain: str, hashed: str) -> bool:
        hashed_bytes = hashed.encode('utf-8') if isinstance(hashed, str) else hashed
        return _bcrypt.checkpw(plain.encode('utf-8'), hashed_bytes)

except ImportError:
    import hashlib, secrets

    def hash_password(plain: str) -> str:
        salt = secrets.token_hex(16)
        return salt + ':' + hashlib.sha256((salt + plain).encode()).hexdigest()

    def check_password(plain: str, hashed: str) -> bool:
        try:
            salt, digest = hashed.split(':', 1)
            return hashlib.sha256((salt + plain).encode()).hexdigest() == digest
        except Exception:
            return False
# ─────────────────────────────────────────────────────────────────────────────


def get_db():
    """Returns a connection to the MySQL database."""
    try:
        conn = mysql.connector.connect(
            host='localhost',        
            database='veritas_net',  
            user='root',             
            password='1234'              # Leave blank if no password is set in your local MySQL
        )
        return conn
    except Error as e:
        print(f"[ERROR] Database connection failed: {e}")
        return None


def seed_admin():
    """
    Seeds a default admin account if the Admin table is empty.
    Default credentials: admin@veritasnet.com / admin123
    """
    conn = get_db()
    if not conn:
        print("[ERROR] Cannot seed admin, database connection failed.")
        return
        
    try:
        cursor = conn.cursor()
        # Check if any admin exists
        cursor.execute("SELECT COUNT(*) FROM Admin")
        existing = cursor.fetchone()[0]
        
        if existing > 0:
            print("[DB] Admin already exists — skipping seed.")
        else:
            hashed = hash_password("admin123")
            # Notice the %s placeholders for MySQL!
            cursor.execute(
                "INSERT INTO Admin (name, email, password) VALUES (%s, %s, %s)",
                ("Admin User", "admin@veritasnet.com", hashed)
            )
            conn.commit()
            print("[DB] Default admin seeded: admin@veritasnet.com / admin123")
            
        cursor.close()
    except Error as e:
        print(f"[ERROR] Failed to seed admin: {e}")
    finally:
        if conn.is_connected():
            conn.close()

def save_metrics_to_db(json_file_path='ml_pipeline/models/metrics.json'):
    """Reads metrics.json and inserts the data into the modelmetrics table."""
    conn = get_db()
    if not conn:
        print("[ERROR] Cannot save metrics, database connection failed.")
        return

    try:
        # Read the JSON file
        with open(json_file_path, 'r') as file:
            metrics_data = json.load(file)

        # Extract values
        model_name = metrics_data.get("model_name", "Veritas_Model_v1")
        # Get the nested dictionary containing the actual scores
        model_scores = metrics_data.get("metrics", {})

        accuracy = model_scores.get("accuracy", 0.0)
        precision = model_scores.get("precision", 0.0)
        recall = model_scores.get("recall", 0.0)
        f1_score = model_scores.get("f1_score", 0.0)
        current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        cursor = conn.cursor()
        
        # Insert into database
        sql = """
            INSERT INTO modelmetrics 
            (model_name, accuracy, `precision`, recall, f1_score, last_trained_on) 
            VALUES (%s, %s, %s, %s, %s, %s)
        """
        values = (model_name, accuracy, precision, recall, f1_score, current_time)

        cursor.execute(sql, values)
        conn.commit()
        print(f"[DB] Successfully saved metrics for {model_name} to the database.")
        
        cursor.close()
    except FileNotFoundError:
        print(f"[ERROR] Could not find the metrics file at {json_file_path}.")
    except Exception as e:
        print(f"[ERROR] Failed to save metrics: {e}")
    finally:
        if conn.is_connected():
            conn.close()

if __name__ == '__main__':
    # init_db() is removed because we already created the tables in MySQL Workbench!
    seed_admin()