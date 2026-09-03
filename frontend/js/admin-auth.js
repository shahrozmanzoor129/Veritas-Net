document.addEventListener('DOMContentLoaded', function() {
    const adminLoginForm = document.getElementById('adminLoginForm');
    const authMessage = document.getElementById('authMessage');

    if (localStorage.getItem('currentUser')) {
        const user = JSON.parse(localStorage.getItem('currentUser'));
        if (user.role === 'admin') {
            window.location.href = 'admin-dashboard.html';
        }
    }

    if (adminLoginForm) {
        adminLoginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const email = document.getElementById('adminEmail').value;
            const password = document.getElementById('adminPassword').value;
            
            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    if (data.user.role === 'admin') {
                        localStorage.setItem('currentUser', JSON.stringify(data.user));
                        showMessage('Login successful! Redirecting to admin dashboard...', 'success');
                        setTimeout(() => {
                            window.location.href = 'admin-dashboard.html';
                        }, 1000);
                    } else {
                        showMessage('Access denied. This account is not an administrator.', 'error');
                    }
                } else {
                    showMessage(data.error || 'Login failed', 'error');
                }
            } catch (err) {
                showMessage('Connection error. Is the backend running?', 'error');
            }
        });
    }

    function showMessage(message, type) {
        if (authMessage) {
            authMessage.className = `auth-message ${type}`;
            authMessage.textContent = message;
            
            setTimeout(() => {
                if (type === 'error') {
                    authMessage.className = 'auth-message';
                }
            }, 5000);
        }
    }
});
