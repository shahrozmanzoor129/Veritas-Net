document.addEventListener('DOMContentLoaded', function() {
    const currentUser = JSON.parse(
        localStorage.getItem('currentUser') || sessionStorage.getItem('currentUser') || 'null'
    );

    if (!currentUser || currentUser.role !== 'user') {
        window.location.href = 'login.html'; return;
    }

    document.getElementById('userName').textContent  = currentUser.fullname;
    document.getElementById('userEmail').textContent = currentUser.email;

    const navItems     = document.querySelectorAll('.nav-item');
    const sections     = document.querySelectorAll('.content-section');
    const sectionTitle = document.getElementById('sectionTitle');
    const sidebar      = document.getElementById('sidebar');
    const logoutBtn    = document.getElementById('logoutBtn');
    const mobileMenuBtn  = document.getElementById('mobileMenuBtn');
    const sidebarToggle  = document.getElementById('sidebarToggle');

    window.userHistoryData = {}; // Global object to hold full text

    const sectionTitles = {
        'detector': 'Fake News Detector', 'history': 'Analysis History',
        'submit': 'Submit News', 'requests': 'My Requests', 'account': 'Account Settings',
        'channels': 'Live News Channels'
    };

    // ── Section switching ─────────────────────────────────────────────────────
    function switchSection(sectionId) {
        sections.forEach(s => s.classList.remove('active'));
        navItems.forEach(n => n.classList.remove('active'));
        document.getElementById(`${sectionId}-section`).classList.add('active');
        document.querySelector(`[data-section="${sectionId}"]`).classList.add('active');
        sectionTitle.textContent = sectionTitles[sectionId] || sectionId;
        if (window.innerWidth <= 968) sidebar.classList.remove('active');

        if      (sectionId === 'history')  loadHistory();
        else if (sectionId === 'requests') loadRequests();
        else if (sectionId === 'account')  loadAccountSettings();
    }

    navItems.forEach(item => item.addEventListener('click', function(e) {
        e.preventDefault(); switchSection(this.dataset.section);
    }));

    mobileMenuBtn?.addEventListener('click', () => sidebar.classList.toggle('active'));
    sidebarToggle?.addEventListener('click', () => sidebar.classList.remove('active'));

    // ── Detector ──────────────────────────────────────────────────────────────
    const detectorForm = document.getElementById('detectorForm');
    const newsText = document.getElementById('newsText');
    const wordCountLabel = document.getElementById('wordCountLabel');
    const analyzeBtn = detectorForm ? detectorForm.querySelector('button[type="submit"]') : null;

    if (newsText && wordCountLabel && analyzeBtn) {
        // 1. Disable the button by default
        analyzeBtn.disabled = true;
        analyzeBtn.style.opacity = '0.5';

        // 2. Listen for every keystroke in the text area
        newsText.addEventListener('input', function() {
            // Get text, remove extra spaces, and count words
            const text = this.value.trim();
            const wordCount = text === '' ? 0 : text.split(/\s+/).length;

            // Update the live counter text
            wordCountLabel.textContent = `WORDS: ${wordCount} / 50 MIN`;

            // 3. Enforce the 50-word rule
            if (wordCount < 50) {
                wordCountLabel.classList.replace('text-muted', 'text-danger');
                analyzeBtn.disabled = true;
                analyzeBtn.style.opacity = '0.5';
                analyzeBtn.style.cursor = 'not-allowed';
            } else {
                wordCountLabel.classList.replace('text-danger', 'text-muted');
                analyzeBtn.disabled = false;
                analyzeBtn.style.opacity = '1';
                analyzeBtn.style.cursor = 'pointer';
            }
        });
    }

    if (detectorForm) {
        detectorForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // Final safety check before sending to backend
            const text = newsText.value.trim();
            const wordCount = text === '' ? 0 : text.split(/\s+/).length;
            
            if (wordCount < 50) {
                showToast('Please enter at least 50 words for an accurate analysis.', 'error');
                return;
            }
            
            analyzeNews(text);
        });
    }

    function analyzeNews(text) {
        const result = document.getElementById('detectorResult');
        result.className = 'detector-result';
        result.innerHTML = '<div class="analyzing-animation"><i class="fas fa-spinner fa-spin"></i><p>1/3: Analyzing linguistic patterns...</p></div>';
        result.classList.add('show');

        setTimeout(() => {
            result.innerHTML = '<div class="analyzing-animation"><i class="fas fa-spinner fa-spin"></i><p>2/3: Preprocessing and extracting features...</p></div>';
        }, 800);
        setTimeout(() => {
            result.innerHTML = '<div class="analyzing-animation"><i class="fas fa-spinner fa-spin"></i><p>3/3: Running classification model...</p></div>';
        }, 1600);

        setTimeout(async () => {
            try {
                const response = await fetch('/api/news/verify', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text, user_id: currentUser.id })
                });
                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'API Error');

                const isFake    = data.status === 'Fake';
                const confidence = data.confidence;
                const textLower  = text.toLowerCase();
                const fakeWords  = ['shocking','unbelievable','miracle','secret',"they don't want",'conspiracy','breaking!!','urgent','click here'];
                const exclamCount = (text.match(/!/g) || []).length;

                result.className = `detector-result ${isFake ? 'fake' : 'real'} show`;
                result.innerHTML = `
                    <div class="result-animation mt-5 pt-3 border-top border-light">
                        <div class="result-header">
                            <i class="fas ${isFake ? 'fa-exclamation-triangle text-danger' : 'fa-check-circle text-success'} result-icon pulse"></i>
                            <div>
                                <h3 class="${isFake ? 'text-danger' : 'text-success'} fw-bold mb-2">${isFake ? 'Potentially Fake News Detected' : 'Likely Authentic News'}</h3>
                                <p class="confidence-text">Confidence Level: ${confidence.toFixed(2)}%</p>
                                <p style="font-size:0.85rem;opacity:0.7;">Model: ${data.model_used || 'Unknown'}</p>
                            </div>
                        </div>
                        <div class="confidence-bar">
                            <div class="confidence-fill ${isFake ? 'fake' : 'real'}" style="width:0%"></div>
                        </div>
                        <div class="result-details">
                            <p><strong>${isFake ? '⚠️ Warning:' : '✓ Assessment:'}</strong>
                            ${isFake
                                ? 'This content shows characteristics commonly associated with misinformation.'
                                : 'This content appears to follow legitimate news patterns. Always verify from multiple sources.'}</p>
                            <div class="indicators-found">
                                <h4>Analysis Points:</h4>
                                <ul>
                                    <li>${fakeWords.filter(w => textLower.includes(w)).length > 0 ? '⚠️ Contains sensational keywords' : '✓ No obvious sensational language'}</li>
                                    <li>${text.length < 50 ? '⚠️ Content is very short' : '✓ Content length is reasonable'}</li>
                                    <li>${exclamCount > 3 ? '⚠️ Excessive punctuation usage' : '✓ Normal punctuation usage'}</li>
                                </ul>
                            </div>
                            <div class="cta-box">
                                <p><strong>Analysis saved to your history.</strong></p>
                                <a href="#" class="btn btn-secondary" id="viewHistoryCta">View History</a>
                            </div>
                        </div>
                    </div>`;

                setTimeout(() => {
                    const fill = result.querySelector('.confidence-fill');
                    if (fill) fill.style.width = confidence + '%';
                }, 100);

                document.getElementById('viewHistoryCta')?.addEventListener('click', (e) => {
                    e.preventDefault(); switchSection('history');
                });

            } catch (err) {
                result.className = 'detector-result fake show';
                result.innerHTML = `<div class="result-details"><p style="color:red;"><strong>Error:</strong> ${err.message || 'Failed to connect to Verification API. Check your backend.'}</p></div>`;
            }
        }, 2500);
    }

    const updateInterval = setInterval(() => {
        if (document.getElementById('detector-section').classList.contains('active')) {
            loadLiveInsights();
        }
    }, 15000);
    window.addEventListener('beforeunload', () => clearInterval(updateInterval));

    // ── History ───────────────────────────────────────────────────────────────
    async function loadHistory() {
        const historyList = document.getElementById('historyList');
        historyList.innerHTML = '<p style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Loading history...</p>';

        try {
            const response = await fetch(`/api/user/history/${currentUser.id}?user_id=${currentUser.id}`);
            const history  = await response.json();

            if (!Array.isArray(history) || history.length === 0) {
                historyList.innerHTML = '<p style="text-align:center;color:var(--text-secondary);">No analysis history yet. Use the detector to analyze news.</p>';
                return;
            }

            historyList.innerHTML = history.map(item => {
                // Store full data
                window.userHistoryData[item.result_id] = item;
                
                // Truncate for preview
                let contentPreview = item.content || '';
                let needsReadMore = contentPreview.length > 250;
                if (needsReadMore) {
                    contentPreview = contentPreview.substring(0, 250) + '...';
                }

                return `
                <div class="col-md-6">
                    <div class="p-4 bg-gray-light rounded-4 h-100 border-light-subtle">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <span class="badge ${item.status === 'Real' ? 'bg-mint text-navy' : 'bg-danger text-white'} fw-bold px-3 py-2" style="font-size:0.7rem;">${item.status.toUpperCase()}</span>
                            <small class="text-muted fw-bold" style="font-size:0.7rem;">${item.detected_on ? new Date(item.detected_on).toLocaleString() : 'N/A'}</small>
                        </div>
                        <div class="mb-3 text-navy fw-bold">Confidence: ${item.confidence.toFixed(2)}%</div>
                        <div class="text-muted fw-medium" style="font-size: 0.9rem; line-height:1.6;">
                            ${escHtml(contentPreview)}
                            ${needsReadMore ? `<a href="#" class="text-mint fw-bold ms-1 text-decoration-none" onclick="viewFullHistory(${item.result_id}); return false;">Read More</a>` : ''}
                        </div>
                    </div>
                </div>`;
            }).join('');
        } catch (err) {
            historyList.innerHTML = '<p style="text-align:center;color:red;">Failed to load history from backend.</p>';
        }
    }

    // Modal popup function
    window.viewFullHistory = function(id) {
        const item = window.userHistoryData[id];
        if (!item) return;
        showInfoModal(
            item.title || "Analyzed News Content", 
            `<div class="p-3 bg-light rounded" style="white-space:pre-wrap; line-height:1.7; font-size: 0.95rem;">${escHtml(item.content)}</div>`
        );
    };

    // Live Insights Mini History
    async function loadLiveInsights() {
        try {
            const response = await fetch(`/api/user/history/${currentUser.id}?user_id=${currentUser.id}`);
            const history  = await response.json();
            
            let totalScans = 0, realCount = 0;
            const miniHistoryContainer = document.getElementById('miniHistory');
            
            if (Array.isArray(history) && history.length > 0) {
                totalScans = history.length;
                realCount = history.filter(h => h.status === 'Real').length;
                
                miniHistoryContainer.innerHTML = history.slice(0, 5).map(item => `
                    <div class="history-item mb-3 p-3 bg-gray-light rounded-3" style="border-left: 4px solid ${item.status === 'Real' ? 'var(--mint)' : 'var(--danger)'}">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <span class="badge ${item.status === 'Real' ? 'bg-mint text-navy' : 'bg-danger text-white'} fw-bold" style="font-size: 0.6rem;">${item.status.toUpperCase()}</span>
                            <div class="text-muted x-small">${item.detected_on ? new Date(item.detected_on).toLocaleDateString() : 'N/A'}</div>
                        </div>
                        <div class="fw-bold text-navy small line-clamp-2">${(item.title || item.content || '').substring(0, 60)}...</div>
                    </div>
                `).join('');
            } else {
                miniHistoryContainer.innerHTML = `
                    <div class="history-item mb-3 p-4 bg-gray-light rounded-3 text-center text-muted">
                        <i class="material-symbols-outlined mb-2 fs-3 opacity-50">history</i>
                        <div class="small fw-bold">No recent scans</div>
                    </div>`;
            }

            const accuracyRate = totalScans > 0 ? ((realCount / totalScans) * 100).toFixed(1) + '%' : '0%';
            
            const totalScansEl = document.getElementById('totalScansValue');
            const accuracyRateEl = document.getElementById('accuracyRateValue');
            if (totalScansEl) totalScansEl.textContent = totalScans;
            if (accuracyRateEl) accuracyRateEl.textContent = accuracyRate;
            
        } catch (err) { console.error('Failed to load live insights'); }
    }

    loadLiveInsights();

    // Clear history
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');
    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', async function() {
            if (!confirm('Are you sure you want to clear all your analysis history? This cannot be undone.')) return;
            try {
                const response = await fetch(`/api/user/history/${currentUser.id}?user_id=${currentUser.id}`, { method: 'DELETE' });
                const data     = await response.json();
                if (response.ok) {
                    showToast('History cleared successfully.', 'success');
                    loadHistory();
                } else { showToast(data.error || 'Failed to clear history.', 'error'); }
            } catch (err) { showToast('Connection error.', 'error'); }
        });
    }

    // ── Submit News ───────────────────────────────────────────────────────────
    const submitNewsForm = document.getElementById('submitNewsForm');
    if (submitNewsForm) {
        submitNewsForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const title     = document.getElementById('newsTitle').value.trim();
            const category  = document.getElementById('newsCategory').value;
            const content   = document.getElementById('newsContent').value.trim();
            const sourceUrl = document.getElementById('newsSource')?.value.trim() || '';
            const submitBtn = submitNewsForm.querySelector('button[type="submit"]');

            if (!title || !category || !content) { showToast('Please fill in all required fields.', 'error'); return; }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Submitting...';

            try {
                const response = await fetch('/api/user/submit-news', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: currentUser.id, title, category, content, source_url: sourceUrl })
                });
                const data = await response.json();
                if (response.ok) {
                    showToast('News submitted for admin review! Check My Requests for status.', 'success');
                    submitNewsForm.reset();
                } else { showToast(data.error || 'Submission failed.', 'error'); }
            } catch (err) { showToast('Connection error. Is the backend running?', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit for Review';
            }
        });
    }

    // ── My Requests ───────────────────────────────────────────────────────────
    async function loadRequests() {
        const requestsList = document.getElementById('requestsList');
        requestsList.innerHTML = '<p style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Loading requests...</p>';

        try {
            const response = await fetch(`/api/user/requests/${currentUser.id}?user_id=${currentUser.id}`);
            const requests = await response.json();

            if (!Array.isArray(requests) || requests.length === 0) {
                requestsList.innerHTML = `
                    <div style="text-align:center;padding:2rem;color:var(--text-secondary);">
                        <i class="fas fa-inbox" style="font-size:3rem;margin-bottom:1rem;opacity:0.3;"></i>
                        <p>No submission requests yet.</p>
                        <p>Go to <strong>Submit News</strong> to send news for admin review.</p>
                    </div>`;
                return;
            }

            requestsList.innerHTML = requests.map(req => {
                const statusColor = req.status === 'Approved' ? 'verified' : req.status === 'Rejected' ? 'unverified' : 'pending-badge';
                const statusIcon  = req.status === 'Approved' ? 'fa-check-circle' : req.status === 'Rejected' ? 'fa-times-circle' : 'fa-clock';
                const reqId = `req-${Math.random().toString(36).substr(2, 9)}`;
                return `
                <div class="history-item" style="margin-bottom:1rem; border-left:4px solid ${req.status==='Approved'?'#10b981':req.status==='Rejected'?'#ef4444':'#f59e0b'}; cursor:pointer;" onclick="toggleRequestDetail('${reqId}')">
                    <div class="history-item-header">
                        <span class="news-badge ${statusColor}">
                            <i class="fas ${statusIcon}"></i> ${req.status}
                        </span>
                        <small>Submitted: ${req.submitted_on ? new Date(req.submitted_on).toLocaleString() : 'N/A'}</small>
                    </div>
                    <h4 style="margin:0.5rem 0;">${req.title || 'No Title'}</h4>
                    <div class="d-flex justify-content-between align-items-center">
                        <small style="color:var(--text-secondary);">Category: ${req.category || 'N/A'}</small>
                        <span class="text-mint small fw-bold">Click to ${req.status === 'Pending' ? 'view' : 'read'} full content</span>
                    </div>
                    
                    <div id="${reqId}" class="request-full-content mt-3 pt-3 border-top" style="display:none;">
                        <p class="text-navy fw-medium">${req.content || ''}</p>
                        ${req.admin_note ? `<div class="mt-3 p-3 bg-gray-light rounded-3"><strong>Admin Note:</strong> ${req.admin_note}</div>` : ''}
                    </div>
                </div>`;
            }).join('');
        } catch (err) { requestsList.innerHTML = '<p style="text-align:center;color:red;">Failed to load requests from backend.</p>'; }
    }

    window.toggleRequestDetail = function(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
    };

    // ── Account Settings ──────────────────────────────────────────────────────
    function loadAccountSettings() {
        document.getElementById('accountName').value  = currentUser.fullname || '';
        document.getElementById('accountEmail').value = currentUser.email || '';
    }

    const accountForm = document.getElementById('accountForm');
    if (accountForm) {
        accountForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const newName        = document.getElementById('accountName').value.trim();
            const newEmail       = document.getElementById('accountEmail').value.trim();
            const oldPassword    = document.getElementById('currentPassword')?.value || '';
            const newPassword    = document.getElementById('newPassword').value;
            const confirmPwd     = document.getElementById('confirmNewPassword').value;
            const submitBtn      = accountForm.querySelector('button[type="submit"]');

            if (!newName || !newEmail) { showToast('Name and email are required.', 'error'); return; }
            if (newPassword && newPassword !== confirmPwd) { showToast('Passwords do not match.', 'error'); return; }
            if (newPassword && newPassword.length < 6) { showToast('Password must be at least 6 characters.', 'error'); return; }
            if (newPassword && !oldPassword) { showToast('Please enter your current password to change it.', 'error'); return; }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

            try {
                const profileResp = await fetch(`/api/auth/update-profile?user_id=${currentUser.id}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ user_id: currentUser.id, name: newName, email: newEmail })
                });
                const profileData = await profileResp.json();
                if (!profileResp.ok) { showToast(profileData.error || 'Failed to update profile.', 'error'); return; }

                if (newPassword) {
                    const pwdResp = await fetch(`/api/auth/change-password?user_id=${currentUser.id}`, {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ user_id: currentUser.id, old_password: oldPassword, new_password: newPassword })
                    });
                    const pwdData = await pwdResp.json();
                    if (!pwdResp.ok) { showToast(pwdData.error || 'Failed to change password.', 'error'); return; }
                }

                currentUser.fullname = newName;
                currentUser.email    = newEmail;
                localStorage.setItem('currentUser', JSON.stringify(currentUser));
                sessionStorage.setItem('currentUser', JSON.stringify(currentUser));

                document.getElementById('userName').textContent  = newName;
                document.getElementById('userEmail').textContent = newEmail;

                showToast('Account updated successfully!', 'success');
                accountForm.querySelector('#newPassword').value         = '';
                accountForm.querySelector('#confirmNewPassword').value  = '';
                if (accountForm.querySelector('#currentPassword')) accountForm.querySelector('#currentPassword').value = '';

            } catch (err) { showToast('Connection error.', 'error');
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-save"></i> Update Account';
            }
        });
    }

    // ── Utilities & Modals ────────────────────────────────────────────────────
    function escHtml(s) {
        return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function showInfoModal(title, body) {
        const old = document.getElementById('infoModal'); if (old) old.remove();
        const m = document.createElement('div');
        m.id = 'infoModal'; m.className = 'ux-modal active';
        m.innerHTML = `
            <div class="ux-modal-content" style="max-width:700px; width:90%;">
                <div class="p-4 border-bottom d-flex justify-content-between align-items-center">
                    <h4 class="fw-bold text-navy mb-0">${escHtml(title)}</h4>
                    <button class="btn fs-3 p-0" onclick="this.closest('.ux-modal').remove()">&times;</button>
                </div>
                <div class="p-4">${body}</div>
                <div class="p-4 border-top text-end">
                    <button class="btn btn-navy px-4" onclick="this.closest('.ux-modal').remove()">Close</button>
                </div>
            </div>`;
        document.body.appendChild(m);
        m.addEventListener('click', e => { if (e.target===m) m.remove(); });
    }

    function showToast(message, type = 'success') {
        const existing = document.getElementById('dashToast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.id = 'dashToast';
        toast.style.cssText = `
            position:fixed;bottom:2rem;right:2rem;z-index:9999;
            padding:1rem 1.5rem;border-radius:8px;color:#fff;font-weight:500;
            background:${type === 'success' ? '#10b981' : '#ef4444'};
            box-shadow:0 4px 20px rgba(0,0,0,0.2);
            animation:slideIn 0.3s ease;max-width:350px;`;
        toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${message}`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', function() {
            localStorage.removeItem('currentUser');
            sessionStorage.removeItem('currentUser');
            window.location.href = 'index.html';
        });
    }

    const newPasswordInput = document.getElementById('newPassword');
    if (newPasswordInput && !document.getElementById('currentPassword')) {
        const group = document.createElement('div');
        group.className = 'form-group mb-4';
        group.innerHTML = `
            <label class="text-navy fw-bold small text-uppercase tracking-widest mb-2 d-block" for="currentPassword">Current Password</label>
            <input type="password" id="currentPassword" class="form-control p-3 shadow-none" placeholder="Required to authorize changes">`;
        newPasswordInput.closest('.mb-4').before(group);
    }
});