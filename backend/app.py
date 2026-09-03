"""
app.py  -- VeritasNet Flask Backend  (Full Feature Set - MySQL Version)
=========================================================
All API endpoints for auth, news, admin, user, ML model, and contact.

Run:
  python backend/app.py
"""

import os, sys, json, threading

_PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, _PROJECT_ROOT)

from flask import Flask, request, jsonify, make_response
from flask_cors import CORS
# Note: Removed init_db because we use Workbench now!
from backend.database import get_db, seed_admin, hash_password, check_password
from ml_pipeline.inference import predict_fake_news, get_model_metrics
from ml_pipeline.train_models import train_all

import feedparser
import requests as req_lib
from bs4 import BeautifulSoup

FRONTEND_DIR = os.path.join(_PROJECT_ROOT, 'frontend')

app = Flask(__name__, static_url_path='', static_folder=FRONTEND_DIR, template_folder=FRONTEND_DIR)
CORS(app)

# --- SECURITY UTILS ---
def get_current_user_from_req():
    """Simplified session matching from request data for this project context."""
    user_id = request.args.get('user_id')
    if not user_id and request.is_json:
        user_id = request.get_json(silent=True).get('user_id')
    
    if not user_id: return None
    
    conn = get_db()
    if not conn: return None
    
    cursor = None  # BUG-01 FIX: initialize before try so finally block is always safe
    try:
        cursor = conn.cursor(dictionary=True)
        
        # Routes that require admin identity — Admin table is checked FIRST to avoid
        # ID-collision issues where Admin ID 1 == User ID 1 on a fresh database.
        is_admin_req = (
            request.path.startswith('/api/admin') or 
            request.path.startswith('/api/model') or
            request.path == '/api/contact/messages' or  # BUG FIX: path doesn't start with /api/admin so must be explicit
            (request.path.startswith('/api/news') and request.method in ['POST', 'PUT', 'DELETE'])
        )
        
        if is_admin_req:
            cursor.execute("SELECT * FROM Admin WHERE admin_id = %s", (user_id,))
            admin = cursor.fetchone()
            if admin:
                admin['role'] = 'admin'
                return admin
        
        # Check User table
        cursor.execute("SELECT * FROM User WHERE user_id = %s", (user_id,))
        user = cursor.fetchone()
        if user: return user
        
        # Fallback for admin if not already checked
        if not is_admin_req:
            cursor.execute("SELECT * FROM Admin WHERE admin_id = %s", (user_id,))
            admin = cursor.fetchone()
            if admin:
                admin['role'] = 'admin'
                return admin
    except: 
        pass
    finally:
        if cursor: cursor.close()  # BUG-01 FIX: only close if cursor was successfully created
        conn.close()
        
    return None

def require_role(role):
    def decorator(f):
        from functools import wraps
        @wraps(f)
        def decorated_function(*args, **kwargs):
            u = get_current_user_from_req()
            if not u: return jsonify({"error": "Unauthorized. Please log in."}), 401
            if role == 'admin' and u['role'] != 'admin':
                return jsonify({"error": "Forbidden. Admin access required."}), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator


# =============================================================================
# AUTH ENDPOINTS
# =============================================================================

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.get_json(silent=True) or {}
    name     = data.get('fullname', '').strip()
    email    = data.get('email', '').strip().lower()
    password = data.get('password', '')
    sec_q    = data.get('security_question', '').strip()
    sec_a    = data.get('security_answer', '').strip().lower() 

    if not name or not email or not password or not sec_q or not sec_a:
        return jsonify({"error": "All fields including security question/answer are required."}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters."}), 400

    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO User (name, email, password, role, security_question, security_answer) VALUES (%s, %s, %s, %s, %s, %s)",
            (name, email, hash_password(password), 'user', sec_q, sec_a)
        )
        conn.commit()
        new_id = cursor.lastrowid
        cursor.close()
        conn.close()
        
        return jsonify({
            "message": "Account created successfully.",
            "user": {"id": new_id, "fullname": name, "email": email, "role": "user"}
        }), 201
    except Exception as e:
        if "Duplicate" in str(e) or "1062" in str(e):
            return jsonify({"error": "An account with this email already exists."}), 409
        return jsonify({"error": f"Registration failed: {e}"}), 500


@app.route('/api/auth/login', methods=['POST'])
def login():
    data     = request.get_json(silent=True) or {}
    email    = data.get('email', '').strip().lower()
    password = data.get('password', '')

    if not email or not password:
        return jsonify({"error": "Email and password are required."}), 400

    try:
        conn = get_db()
        cursor = conn.cursor(dictionary=True)
        
        cursor.execute("SELECT * FROM User WHERE email = %s", (email,))
        user = cursor.fetchone()
        
        if user and check_password(password, user['password']):
            cursor.close(); conn.close()
            return jsonify({"message": "Login successful.", "user": {
                "id": user['user_id'], "fullname": user['name'],
                "email": user['email'], "role": user['role']
            }}), 200

        cursor.execute("SELECT * FROM Admin WHERE email = %s", (email,))
        admin = cursor.fetchone()
        
        if admin and check_password(password, admin['password']):
            cursor.close(); conn.close()
            return jsonify({"message": "Admin login successful.", "user": {
                "id": admin['admin_id'], "fullname": admin['name'],
                "email": admin['email'], "role": "admin"
            }}), 200
            
        cursor.close(); conn.close()
    except Exception as e:
        return jsonify({"error": f"Login error: {e}"}), 500

    return jsonify({"error": "Invalid email or password."}), 401


@app.route('/api/auth/get-security-question', methods=['POST'])
def get_security_question():
    data = request.get_json(silent=True) or {}
    email = data.get('email', '').strip().lower()
    if not email: return jsonify({"error": "Email is required."}), 400

    try:
        conn = get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT security_question FROM User WHERE email = %s", (email,))
        user = cursor.fetchone()
        cursor.close(); conn.close()
        
        if user and user['security_question']:
            return jsonify({"security_question": user['security_question']}), 200
        return jsonify({"error": "Account not found or no security question set."}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/auth/reset-password', methods=['POST'])
def reset_password():
    data = request.get_json(silent=True) or {}
    email       = data.get('email', '').strip().lower()
    answer      = data.get('security_answer', '').strip().lower()
    new_pwd     = data.get('new_password', '')

    if not email or not answer or not new_pwd:
        return jsonify({"error": "Email, answer, and new password are required."}), 400
    if len(new_pwd) < 6:
        return jsonify({"error": "New password must be at least 6 characters."}), 400

    try:
        conn = get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT user_id, security_answer FROM User WHERE email = %s", (email,))
        user = cursor.fetchone()
        
        if not user:
            cursor.close(); conn.close()
            return jsonify({"error": "Account not found."}), 404
            
        if user['security_answer'] != answer:
            cursor.close(); conn.close()
            return jsonify({"error": "Incorrect security answer."}), 401
            
        cursor.execute("UPDATE User SET password = %s WHERE user_id = %s",
                     (hash_password(new_pwd), user['user_id']))
        conn.commit()
        cursor.close(); conn.close()
        
        return jsonify({"message": "Password reset successfully! You can now log in."}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/auth/change-password', methods=['POST'])
@require_role('user')
def change_password():
    data         = request.get_json(silent=True) or {}
    user_id      = data.get('user_id')
    old_password = data.get('old_password', '')
    new_password = data.get('new_password', '')

    if not user_id or not old_password or not new_password:
        return jsonify({"error": "user_id, old_password and new_password are required."}), 400
    if len(new_password) < 6:
        return jsonify({"error": "New password must be at least 6 characters."}), 400

    try:
        conn = get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM User WHERE user_id = %s", (user_id,))
        user = cursor.fetchone()
        
        if not user:
            cursor.close(); conn.close()
            return jsonify({"error": "User not found."}), 404
            
        if not check_password(old_password, user['password']):
            cursor.close(); conn.close()
            return jsonify({"error": "Current password is incorrect."}), 401
            
        cursor.execute("UPDATE User SET password = %s WHERE user_id = %s",
                     (hash_password(new_password), user_id))
        conn.commit()
        cursor.close(); conn.close()
        
        return jsonify({"message": "Password changed successfully."}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/auth/update-profile', methods=['POST'])
@require_role('user')
def update_profile():
    data    = request.get_json(silent=True) or {}
    user_id = data.get('user_id')
    name    = data.get('name', '').strip()
    email   = data.get('email', '').strip().lower()

    if not user_id or not name or not email:
        return jsonify({"error": "user_id, name and email are required."}), 400

    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("UPDATE User SET name = %s, email = %s WHERE user_id = %s",
                     (name, email, user_id))
        conn.commit()
        cursor.close(); conn.close()
        
        return jsonify({"message": "Profile updated successfully.", "name": name, "email": email}), 200
    except Exception as e:
        if "Duplicate" in str(e) or "1062" in str(e):
            return jsonify({"error": "Email already in use by another account."}), 409
        return jsonify({"error": str(e)}), 500


# =============================================================================
# NEWS / VERIFY ENDPOINTS
# =============================================================================

@app.route('/api/news/verify', methods=['POST'])
def verify_news():
    data    = request.get_json(silent=True) or {}
    text    = data.get('text', '').strip()
    user_id = data.get('user_id')

    if not text:
        return jsonify({"error": "No text provided for verification."}), 400

    try:
        result = predict_fake_news(text)
    except Exception as e:
        return jsonify({"error": f"ML inference failed: {e}"}), 500

    # MINOR-03 FIX: include the model name so the frontend stops showing "Unknown"
    metrics = get_model_metrics()
    result['model_used'] = metrics.get('model_name', 'Unknown') if metrics else 'Unknown'

    news_id = None
    if user_id:
        try:
            conn = get_db()
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO News (title, content, status, confidence, submitted_by, source) VALUES (%s,%s,%s,%s,%s,'user')",
                ("Analyzed Snippet", text, result['status'], result['confidence'], user_id)
            )
            news_id = cursor.lastrowid
            cursor.execute(
                "INSERT INTO ResultHistory (user_id, news_id, status, confidence) VALUES (%s,%s,%s,%s)",
                (user_id, news_id, result['status'], result['confidence'])
            )
            conn.commit()
            cursor.close(); conn.close()
        except Exception as e:
            print(f"[ERROR] verify_news history log failed: {e}")

    result['news_id'] = news_id
    return jsonify(result), 200


@app.route('/api/news/articles', methods=['GET'])
def get_news_articles():
    try:
        conn = get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT news_id, title, content, category, submission_date, status, confidence "
            "FROM News WHERE source = 'admin' ORDER BY submission_date DESC"
        )
        rows = cursor.fetchall()
        cursor.close(); conn.close()
        return jsonify(rows), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/news', methods=['POST'])
@require_role('admin')
def add_news():
    data     = request.get_json(silent=True) or {}
    title    = data.get('title', '').strip()
    content  = data.get('content', '').strip()
    category = data.get('category', 'general').strip()
    ml_check = data.get('ml_check', False)

    if not title or not content:
        return jsonify({"error": "Title and content are required."}), 400

    status     = data.get('status', 'Real')
    confidence = data.get('confidence', 100.0)

    if ml_check:
        try:
            result     = predict_fake_news(content)
            status     = result['status']
            confidence = result['confidence']
        except Exception as e:
            return jsonify({"error": f"ML check failed: {e}"}), 500

    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO News (title, content, category, status, confidence, source, source_url) VALUES (%s,%s,%s,%s,%s, 'admin', %s)",
            (title, content, category, status, confidence, data.get('source_url'))
        )
        conn.commit()
        news_id = cursor.lastrowid
        cursor.close(); conn.close()
        
        return jsonify({"message": "News article added.", "news_id": news_id, "status": status, "confidence": confidence}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/news/<int:news_id>', methods=['PUT'])
@require_role('admin')
def edit_news(news_id):
    data     = request.get_json(silent=True) or {}
    title    = data.get('title', '').strip()
    content  = data.get('content', '').strip()
    category = data.get('category', '').strip()
    status   = data.get('status', '').strip()
    confidence = data.get('confidence')
    ml_check = data.get('ml_check', False)

    if not title or not content:
        return jsonify({"error": "Title and content are required."}), 400

    if ml_check:
        try:
            result     = predict_fake_news(content)
            status     = result['status']
            confidence = result['confidence']
        except Exception as e:
            return jsonify({"error": f"ML check failed: {e}"}), 500

    try:
        conn = get_db()
        cursor = conn.cursor(dictionary=True)
        if not status:
            cursor.execute("SELECT status, confidence FROM News WHERE news_id=%s", (news_id,))
            existing = cursor.fetchone()
            if existing:
                status = existing['status']
                if confidence is None:
                    confidence = existing['confidence']
                    
        if confidence is not None:
            cursor.execute(
                "UPDATE News SET title=%s, content=%s, category=%s, status=%s, confidence=%s WHERE news_id=%s",
                (title, content, category, status, confidence, news_id)
            )
        else:
            cursor.execute(
                "UPDATE News SET title=%s, content=%s, category=%s, status=%s WHERE news_id=%s",
                (title, content, category, status, news_id)
            )
        conn.commit()
        cursor.close(); conn.close()
        
        return jsonify({"message": "News updated successfully.", "status": status, "confidence": confidence}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/news/<int:news_id>', methods=['DELETE'])
@require_role('admin')
def delete_news(news_id):
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM News WHERE news_id = %s", (news_id,))
        conn.commit()
        cursor.close(); conn.close()
        return jsonify({"message": "News deleted."}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/news/<int:news_id>', methods=['GET'])
def get_single_news(news_id):
    try:
        conn = get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM News WHERE news_id = %s", (news_id,))
        row = cursor.fetchone()
        cursor.close(); conn.close()
        
        if not row:
            return jsonify({"error": "Not found."}), 404
        return jsonify(row), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# =============================================================================
# ADMIN / USER ENDPOINTS
# =============================================================================

@app.route('/api/admin/stats', methods=['GET'])
@require_role('admin')
def get_admin_stats():
    try:
        conn = get_db()
        cursor = conn.cursor()
        
        cursor.execute("SELECT COUNT(*) FROM User")
        total_users = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM News WHERE source='admin'")
        total_news = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM ResultHistory")
        total_analyses = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM VerificationRequest WHERE status='Pending'")
        pending_requests = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM News WHERE status='Fake'")
        fake_count = cursor.fetchone()[0]
        
        cursor.execute("SELECT COUNT(*) FROM News WHERE status='Real'")
        real_count = cursor.fetchone()[0]
        
        cursor.close(); conn.close()
        
        return jsonify({
            "totalUsers": total_users, "totalNews": total_news,
            "totalAnalyses": total_analyses, "pendingRequests": pending_requests,
            "fakeCount": fake_count, "realCount": real_count,
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/admin/users', methods=['GET'])
@require_role('admin')
def get_all_users():
    try:
        conn = get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT user_id, name, email, join_date, role FROM User ORDER BY join_date DESC")
        rows = cursor.fetchall()
        cursor.close(); conn.close()
        return jsonify(rows), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/users/<int:user_id>', methods=['DELETE'])
@require_role('admin')
def delete_user(user_id):
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM User WHERE user_id = %s", (user_id,))
        conn.commit()
        cursor.close(); conn.close()
        return jsonify({"message": "User deleted."}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/requests', methods=['GET'])
@require_role('admin')
def get_verification_requests():
    try:
        conn = get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT vr.request_id, vr.status, vr.submitted_on, u.name AS user_name, u.email AS user_email, "
            "n.title, n.content, n.category FROM VerificationRequest vr "
            "JOIN User u ON vr.user_id = u.user_id JOIN News n ON vr.news_id = n.news_id ORDER BY vr.submitted_on DESC"
        )
        rows = cursor.fetchall()
        cursor.close(); conn.close()
        return jsonify(rows), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/admin/requests/<int:request_id>', methods=['PUT'])
@require_role('admin')
def update_request(request_id):
    data   = request.get_json(silent=True) or {}
    status = data.get('status', '')
    if status not in ('Approved', 'Rejected'): return jsonify({"error": "Invalid status."}), 400
    try:
        conn = get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT news_id FROM VerificationRequest WHERE request_id = %s", (request_id,))
        req = cursor.fetchone()
        
        cursor.execute("UPDATE VerificationRequest SET status=%s WHERE request_id=%s", (status, request_id))
        
        if status == 'Approved': 
            cursor.execute("UPDATE News SET source='admin', status='Real' WHERE news_id=%s", (req['news_id'],))
            
        conn.commit()
        cursor.close(); conn.close()
        return jsonify({"message": f"Request {status.lower()}."}), 200
    except Exception as e: return jsonify({"error": str(e)}), 500

@app.route('/api/admin/contacts', methods=['GET'])
@require_role('admin')
def get_contact_messages():
    try:
        conn = get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute("SELECT * FROM ContactMessage ORDER BY submitted_on DESC")
        rows = cursor.fetchall()
        cursor.close(); conn.close()
        return jsonify(rows), 200
    except Exception as e: return jsonify({"error": str(e)}), 500

@app.route('/api/admin/contacts/<int:message_id>/read', methods=['PUT'])
@require_role('admin')
def mark_contact_read(message_id):
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("UPDATE ContactMessage SET status='Read' WHERE message_id=%s", (message_id,))
        conn.commit()
        cursor.close(); conn.close()
        return jsonify({"message": "Read."}), 200
    except Exception as e: return jsonify({"error": str(e)}), 500

# =============================================================================
# USER / CONTACT ENDPOINTS
# =============================================================================

@app.route('/api/contact', methods=['POST'])
def submit_contact():
    data = request.get_json(silent=True) or {}
    name = data.get('name', '').strip()
    email = data.get('email', '').strip()
    subject = data.get('subject', '').strip()
    message = data.get('message', '').strip()
    
    if not name or not email or not message:
        return jsonify({"error": "Name, email, and message are required."}), 400
        
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO ContactMessage (name, email, subject, message, status, submitted_on)
            VALUES (%s, %s, %s, %s, 'Unread', NOW())
        ''', (name, email, subject, message))
        
        conn.commit()
        cursor.close()
        conn.close()
        
        return jsonify({"message": "Message sent successfully."}), 201
    except Exception as e:
        print(f"[ERROR] Failed to save contact message: {e}")
        return jsonify({"error": str(e)}), 500

@app.route('/api/contact/messages', methods=['GET'])
@require_role('admin')  # BUG-03 FIX: this was missing, exposing all messages to any user
def get_admin_contact_messages():
    user_id = request.args.get('user_id')
    
    if not user_id:
        return jsonify({'error': 'Unauthorized access'}), 401
        
    try:
        conn = get_db()
        cursor = conn.cursor(dictionary=True) 
        cursor.execute('SELECT * FROM ContactMessage ORDER BY message_id DESC')
        messages_list = cursor.fetchall()
        cursor.close()
        conn.close()
        
        return jsonify(messages_list), 200
        
    except Exception as e:
        print(f"[ERROR] Failed to fetch contact messages: {e}")
        return jsonify({'error': 'Failed to load messages'}), 500

@app.route('/api/user/history/<int:user_id>', methods=['GET'])
@require_role('user')
def get_user_history(user_id):
    try:
        conn = get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT rh.result_id, rh.status, rh.confidence, rh.detected_on, n.content, n.title "
            "FROM ResultHistory rh JOIN News n ON rh.news_id = n.news_id "
            "WHERE rh.user_id = %s ORDER BY rh.detected_on DESC", (user_id,)
        )
        rows = cursor.fetchall()
        cursor.close(); conn.close()
        return jsonify(rows), 200
    except Exception as e: return jsonify({"error": str(e)}), 500

@app.route('/api/user/history/<int:user_id>', methods=['DELETE'])
@require_role('user')
def clear_user_history(user_id):
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("DELETE FROM ResultHistory WHERE user_id = %s", (user_id,))
        conn.commit()
        cursor.close(); conn.close()
        return jsonify({"message": "Cleared."}), 200
    except Exception as e: return jsonify({"error": str(e)}), 500

@app.route('/api/user/requests/<int:user_id>', methods=['GET'])
@require_role('user')
def get_user_requests(user_id):
    try:
        conn = get_db()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(
            "SELECT vr.request_id, vr.status, vr.submitted_on, vr.admin_note, n.title, n.content, n.category "
            "FROM VerificationRequest vr JOIN News n ON vr.news_id = n.news_id WHERE vr.user_id = %s ORDER BY vr.submitted_on DESC", (user_id,)
        )
        rows = cursor.fetchall()
        cursor.close(); conn.close()
        return jsonify(rows), 200
    except Exception as e: return jsonify({"error": str(e)}), 500

@app.route('/api/user/submit-news', methods=['POST'])
@require_role('user')
def submit_news():
    data = request.get_json(silent=True) or {}
    u_id, title, content = data.get('user_id'), data.get('title', '').strip(), data.get('content', '').strip()
    if not u_id or not title or not content: return jsonify({"error": "Missing fields."}), 400
    try:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute("INSERT INTO News (title, content, category, status, confidence, submitted_by, source, source_url) VALUES (%s,%s,%s, 'Pending', 0, %s, 'user', %s)",
                    (title, content, data.get('category','general'), u_id, data.get('source_url')))
        n_id = cursor.lastrowid
        cursor.execute("INSERT INTO VerificationRequest (user_id, news_id) VALUES (%s, %s)", (u_id, n_id))
        conn.commit()
        cursor.close(); conn.close()
        return jsonify({"message": "Submitted.", "news_id": n_id}), 201
    except Exception as e: return jsonify({"error": str(e)}), 500

# =============================================================================
# MODEL / TRAINING ENDPOINTS
# =============================================================================

@app.route('/api/model/metrics', methods=['GET'])
def model_metrics():
    metrics = get_model_metrics()
    if metrics is None: return jsonify({"error": "No model found."}), 503
    return jsonify(metrics), 200

@app.route('/api/model/report', methods=['GET'])
def download_model_report():
    metrics = get_model_metrics()
    if metrics is None: return jsonify({"error": "No model found."}), 503
    report = {"project": "VeritasNet", "best_model": metrics.get("model_name"), "all_models": metrics.get("all_models",{})}
    response = make_response(json.dumps(report, indent=2))
    response.headers['Content-Type'] = 'application/json'
    response.headers['Content-Disposition'] = 'attachment; filename=report.json'
    return response

@app.route('/api/admin/train', methods=['POST'])
@require_role('admin')
def admin_train():
    """Trigger background training."""
    up_path = None
    if 'datasetFile' in request.files:
        file = request.files['datasetFile']
        if file.filename.endswith('.csv'):
            up_path = os.path.join(_PROJECT_ROOT, 'Datasets', 'fake-and-real-news-dataset', 'last_upload.csv')
            file.save(up_path)

    thread = threading.Thread(target=train_all, args=(up_path,))
    thread.start()
    return jsonify({"message": "Training started in background."}), 202


# =============================================================================
# CHANNELS — RSS FEED + URL VERIFICATION
# =============================================================================

_channels_cache = {}
_CACHE_TTL = 300  # 5 minutes cache per channel

CHANNEL_FEEDS = {
    "dawn": {"name": "Dawn",     "rss": "https://www.dawn.com/feeds/home"},
    "geo":  {"name": "Geo News", "rss": "https://www.geo.tv/rss/1/news"},
    "ary":  {"name": "ARY News", "rss": "https://arynews.tv/feed/"},
}


def _fetch_channel_articles(channel_key):
    import time
    channel = CHANNEL_FEEDS.get(channel_key)
    if not channel:
        return []
    cached = _channels_cache.get(channel_key)
    if cached and (time.time() - cached["fetched_at"]) < _CACHE_TTL:
        return cached["articles"]
    try:
        feed = feedparser.parse(channel["rss"])
        articles = []
        for entry in feed.entries[:20]:
            title   = entry.get("title", "").strip()
            url     = entry.get("link", "").strip()
            raw_sum = entry.get("summary", entry.get("description", ""))
            excerpt = BeautifulSoup(raw_sum, "html.parser").get_text()[:300].strip()
            published = entry.get("published", entry.get("updated", ""))
            if title and url:
                articles.append({
                    "title": title, "excerpt": excerpt, "url": url,
                    "source": channel["name"], "channel_key": channel_key,
                    "published_at": published
                })
        _channels_cache[channel_key] = {"articles": articles, "fetched_at": time.time()}
        return articles
    except Exception as e:
        print(f"[CHANNELS] RSS fetch failed for {channel_key}: {e}")
        return []


@app.route('/api/channels/articles', methods=['GET'])
def get_channel_articles():
    channel_key = request.args.get('channel', 'dawn').lower()
    if channel_key not in CHANNEL_FEEDS:
        return jsonify({"error": f"Unknown channel '{channel_key}'."}), 400
    articles = _fetch_channel_articles(channel_key)
    return jsonify({"channel": channel_key, "articles": articles}), 200


@app.route('/api/channels/verify-url', methods=['POST'])
def verify_channel_url():
    data    = request.get_json(silent=True) or {}
    url     = data.get('url', '').strip()
    user_id = data.get('user_id')

    if not url:
        return jsonify({"error": "URL is required."}), 400

    try:
        headers  = {"User-Agent": "Mozilla/5.0 (compatible; VeritasNet/1.0)"}
        response = req_lib.get(url, headers=headers, timeout=10)
        response.raise_for_status()
    except Exception as e:
        return jsonify({"error": f"Could not fetch article: {e}"}), 502

    try:
        soup = BeautifulSoup(response.text, "html.parser")
        for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
            tag.decompose()
        article_el = soup.find("article") or soup.find("div", class_=lambda c: c and "content" in c.lower())
        target     = article_el if article_el else soup.body
        paragraphs = target.find_all("p") if target else soup.find_all("p")
        text       = " ".join(p.get_text(separator=" ").strip() for p in paragraphs)
        text       = " ".join(text.split())
    except Exception as e:
        return jsonify({"error": f"Text extraction failed: {e}"}), 500

    if len(text) < 50:
        return jsonify({"error": "Could not extract enough text from this article."}), 422

    # Reuse the EXISTING predict_fake_news function — do not change it
    try:
        result = predict_fake_news(text)
    except Exception as e:
        return jsonify({"error": f"ML inference failed: {e}"}), 500

    metrics = get_model_metrics()
    result['model_used'] = metrics.get('model_name', 'Unknown') if metrics else 'Unknown'
    result['text_length'] = len(text)

    if user_id:
        try:
            page_title = soup.title.string.strip() if soup.title else url
            conn   = get_db()
            cursor = conn.cursor()
            cursor.execute(
                "INSERT INTO News (title, content, status, confidence, submitted_by, source, source_url) VALUES (%s,%s,%s,%s,%s,'channel',%s)",
                (page_title[:255], text[:5000], result['status'], result['confidence'], user_id, url)
            )
            news_id = cursor.lastrowid
            cursor.execute(
                "INSERT INTO ResultHistory (user_id, news_id, status, confidence) VALUES (%s,%s,%s,%s)",
                (user_id, news_id, result['status'], result['confidence'])
            )
            conn.commit()
            cursor.close(); conn.close()
        except Exception as e:
            print(f"[CHANNELS] History save failed: {e}")

    return jsonify(result), 200


# =============================================================================
# STARTUP / SERVE
# =============================================================================

@app.route('/')
def index(): return app.send_static_file('index.html')

@app.route('/<path:filename>')
def serve_static(filename): return app.send_static_file(filename)

if __name__ == '__main__':
    # Initialize your admin user using MySQL!
    seed_admin()
    print("\n  VeritasNet API  -  http://127.0.0.1:5000\n")
    app.run(host='0.0.0.0', port=5000, debug=True)