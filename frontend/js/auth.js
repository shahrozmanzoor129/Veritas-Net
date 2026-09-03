document.addEventListener('DOMContentLoaded', function() {
    const loginForm    = document.getElementById('loginForm');
    const registerForm = document.getElementById('registerForm');
    const authMessage  = document.getElementById('authMessage');

    // Auto-redirect if already logged in
    const stored = localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser');
    if (stored) {
        const user = JSON.parse(stored);
        if (user.role === 'admin') window.location.href = 'admin-dashboard.html';
        else window.location.href = 'user-dashboard.html';
    }

    // ── Login Form ────────────────────────────────────────────────────────────
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const email      = document.getElementById('email').value.trim();
            const password   = document.getElementById('password').value;
            const rememberMe = document.querySelector('input[name="remember"]')?.checked;
            const submitBtn  = loginForm.querySelector('button[type="submit"]');

            submitBtn.disabled = true;
            submitBtn.textContent = 'Signing in...';

            try {
                const response = await fetch('/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });
                const data = await response.json();

                if (response.ok) {
                    const userData = JSON.stringify(data.user);
                    if (rememberMe) {
                        localStorage.setItem('currentUser', userData);
                    } else {
                        sessionStorage.setItem('currentUser', userData);
                        // Ensure we don't have a leftover from previous "Remember Me"
                        localStorage.removeItem('currentUser');
                    }

                    showMessage('Login successful! Redirecting...', 'success');
                    setTimeout(() => {
                        if (data.user.role === 'admin') window.location.href = 'admin-dashboard.html';
                        else window.location.href = 'user-dashboard.html';
                    }, 800);
                } else {
                    showMessage(data.error || 'Login failed. Check your credentials.', 'error');
                }
            } catch (err) {
                showMessage('Connection error. Is the backend running?', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Sign In';
            }
        });
    }

// ── Register Form ─────────────────────────────────────────────────────────
    if (registerForm) {
        registerForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const fullname   = document.getElementById('fullname').value.trim();
            const email      = document.getElementById('email').value.trim();
            const password   = document.getElementById('password').value;
            const confirmPwd = document.getElementById('confirmPassword').value;
            
            // Capture the new security fields
            const security_question = document.getElementById('securityQuestion').value;
            const security_answer   = document.getElementById('securityAnswer').value.trim();

            const submitBtn  = registerForm.querySelector('button[type="submit"]');

            if (password !== confirmPwd) {
                showMessage('Passwords do not match.', 'error');
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Creating Account...';

            try {
                const response = await fetch('/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    // Include the security fields in the backend request
                    body: JSON.stringify({ fullname, email, password, security_question, security_answer })
                });
                const data = await response.json();

                if (response.ok) {
                    showMessage('Account created! Redirecting to login...', 'success');
                    setTimeout(() => window.location.href = 'login.html', 1500);
                } else {
                    showMessage(data.error || 'Registration failed.', 'error');
                }
            } catch (err) {
                showMessage('Connection error. Is the server running?', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.textContent = 'Create Free Account';
            }
        });
    }
    
    // ── Forgot Password Link ──────────────────────────────────────────────────
    const forgotLink = document.querySelector('.forgot-link');
    if (forgotLink) {
        forgotLink.addEventListener('click', function(e) {
            e.preventDefault();
            showForgotPasswordModal();
        });
    }

    function showForgotPasswordModal() {
        // BUG-02 FIX: Replaced non-functional ghost-endpoint modal with a proper
        // 2-step security question flow using the existing backend endpoints:
        //   Step 1: POST /api/auth/get-security-question  (fetch question for email)
        //   Step 2: POST /api/auth/reset-password         (verify answer + set new password)

        const existing = document.getElementById('forgotPasswordModal');
        if (existing) existing.remove();

        const modal = document.createElement('div');
        modal.id = 'forgotPasswordModal';
        modal.className = 'modal active';

        // Render Step 1
        function renderStep1() {
            modal.innerHTML = `
                <div class="modal-content" style="max-width:420px;">
                    <div class="modal-header">
                        <h3><i class="fas fa-lock"></i> Reset Password</h3>
                        <button class="modal-close" id="closeForgotModal">&times;</button>
                    </div>
                    <div style="padding: 1.5rem;">
                        <p style="margin-bottom:1rem;color:var(--text-secondary);">
                            Enter your registered email address to retrieve your security question.
                        </p>
                        <div class="form-group">
                            <label for="forgotEmail">Email Address</label>
                            <div class="input-icon">
                                <i class="fas fa-envelope"></i>
                                <input type="email" id="forgotEmail" placeholder="Enter your email"
                                    style="width:100%;padding:0.8rem 0.8rem 0.8rem 2.8rem;">
                            </div>
                        </div>
                        <div id="forgotMessage" style="margin:1rem 0;"></div>
                        <button id="fetchQuestionBtn" class="btn btn-primary btn-block">
                            <i class="fas fa-arrow-right"></i> Continue
                        </button>
                    </div>
                </div>`;

            document.getElementById('closeForgotModal').addEventListener('click', () => modal.remove());
            modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

            document.getElementById('fetchQuestionBtn').addEventListener('click', async () => {
                const email = document.getElementById('forgotEmail').value.trim();
                const msgEl = document.getElementById('forgotMessage');
                const btn   = document.getElementById('fetchQuestionBtn');

                if (!email) { msgEl.innerHTML = '<p style="color:red;">Please enter your email.</p>'; return; }

                btn.disabled = true;
                btn.textContent = 'Looking up...';
                try {
                    const response = await fetch('/api/auth/get-security-question', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email })
                    });
                    const data = await response.json();
                    if (response.ok && data.security_question) {
                        renderStep2(email, data.security_question);
                    } else {
                        msgEl.innerHTML = `<p style="color:red;">${data.error || 'Account not found.'}</p>`;
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fas fa-arrow-right"></i> Continue';
                    }
                } catch (err) {
                    msgEl.innerHTML = '<p style="color:red;">Connection error.</p>';
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-arrow-right"></i> Continue';
                }
            });
        }

        // Render Step 2 — show security question and accept answer + new password
        function renderStep2(email, question) {
            modal.innerHTML = `
                <div class="modal-content" style="max-width:420px;">
                    <div class="modal-header">
                        <h3><i class="fas fa-shield-alt"></i> Verify Identity</h3>
                        <button class="modal-close" id="closeForgotModal">&times;</button>
                    </div>
                    <div style="padding: 1.5rem;">
                        <p style="margin-bottom:1rem;color:var(--text-secondary);">
                            Answer your security question to reset your password.
                        </p>
                        <div class="form-group" style="margin-bottom:1rem;">
                            <label>Security Question</label>
                            <p style="font-weight:600;color:var(--text-primary);padding:0.6rem 0;">${question}</p>
                        </div>
                        <div class="form-group" style="margin-bottom:1rem;">
                            <label for="secAnswer">Your Answer</label>
                            <input type="text" id="secAnswer" class="form-control" placeholder="Enter your answer"
                                style="width:100%;padding:0.8rem;">
                        </div>
                        <div class="form-group" style="margin-bottom:1rem;">
                            <label for="newPwd">New Password</label>
                            <input type="password" id="newPwd" class="form-control" placeholder="Min. 6 characters"
                                style="width:100%;padding:0.8rem;">
                        </div>
                        <div id="forgotMessage" style="margin:1rem 0;"></div>
                        <div style="display:flex;gap:0.5rem;">
                            <button id="backBtn" class="btn btn-secondary" style="flex:0 0 auto;">
                                <i class="fas fa-arrow-left"></i>
                            </button>
                            <button id="resetPwdBtn" class="btn btn-primary btn-block" style="flex:1;">
                                <i class="fas fa-key"></i> Reset Password
                            </button>
                        </div>
                    </div>
                </div>`;

            document.getElementById('closeForgotModal').addEventListener('click', () => modal.remove());
            modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
            document.getElementById('backBtn').addEventListener('click', renderStep1);

            document.getElementById('resetPwdBtn').addEventListener('click', async () => {
                const answer  = document.getElementById('secAnswer').value.trim();
                const newPwd  = document.getElementById('newPwd').value;
                const msgEl   = document.getElementById('forgotMessage');
                const btn     = document.getElementById('resetPwdBtn');

                if (!answer || !newPwd) {
                    msgEl.innerHTML = '<p style="color:red;">All fields are required.</p>'; return;
                }
                if (newPwd.length < 6) {
                    msgEl.innerHTML = '<p style="color:red;">Password must be at least 6 characters.</p>'; return;
                }

                btn.disabled = true;
                btn.textContent = 'Resetting...';
                try {
                    const response = await fetch('/api/auth/reset-password', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ email, security_answer: answer, new_password: newPwd })
                    });
                    const data = await response.json();
                    if (response.ok) {
                        msgEl.innerHTML = `<p style="color:var(--success,green);">${data.message}</p>`;
                        setTimeout(() => modal.remove(), 2500);
                    } else {
                        msgEl.innerHTML = `<p style="color:red;">${data.error || 'Reset failed.'}</p>`;
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fas fa-key"></i> Reset Password';
                    }
                } catch (err) {
                    msgEl.innerHTML = '<p style="color:red;">Connection error.</p>';
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-key"></i> Reset Password';
                }
            });
        }

        document.body.appendChild(modal);
        renderStep1();
    }

    // ── Helper ────────────────────────────────────────────────────────────────
    function showMessage(message, type) {
        if (authMessage) {
            authMessage.className = `auth-message ${type}`;
            authMessage.textContent = message;
            setTimeout(() => authMessage.className = 'auth-message', 5000);
        }
    }
});
