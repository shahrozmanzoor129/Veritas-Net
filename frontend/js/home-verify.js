document.addEventListener('DOMContentLoaded', function() {
    const homeVerifyForm = document.getElementById('homeVerifyForm');
    const homeNewsText = document.getElementById('homeNewsText');
    const indexWordCountLabel = document.getElementById('indexWordCountLabel');
    const indexAnalyzeBtn = homeVerifyForm ? homeVerifyForm.querySelector('button[type="submit"]') : null;
    
    // Initialize stats and recent verifications on load
    initLandingStats();

    // ── Live Word Counter Logic ──
    if (homeNewsText && indexWordCountLabel && indexAnalyzeBtn) {
        // 1. Disable the button by default
        indexAnalyzeBtn.disabled = true;
        indexAnalyzeBtn.style.opacity = '0.5';

        // 2. Listen for keystrokes
        homeNewsText.addEventListener('input', function() {
            const text = this.value.trim();
            const wordCount = text === '' ? 0 : text.split(/\s+/).length;

            // Update the live counter text
            indexWordCountLabel.textContent = `WORDS: ${wordCount} / 50 MIN`;

            // 3. Enforce the 50-word rule
            if (wordCount < 50) {
                indexWordCountLabel.classList.replace('text-muted', 'text-danger');
                indexAnalyzeBtn.disabled = true;
                indexAnalyzeBtn.style.opacity = '0.5';
                indexAnalyzeBtn.style.cursor = 'not-allowed';
            } else {
                indexWordCountLabel.classList.replace('text-danger', 'text-muted');
                indexAnalyzeBtn.disabled = false;
                indexAnalyzeBtn.style.opacity = '1';
                indexAnalyzeBtn.style.cursor = 'pointer';
            }
        });
    }

    if (homeVerifyForm) {
        homeVerifyForm.addEventListener('submit', function(e) {
            e.preventDefault();
            const newsText = homeNewsText ? homeNewsText.value.trim() : '';
            
            // Final safety check
            const wordCount = newsText === '' ? 0 : newsText.split(/\s+/).length;
            if (wordCount < 50) {
                alert('Please enter at least 50 words for an accurate analysis.');
                return;
            }

            analyzeHomeNews(newsText);
        });
    }

    async function initLandingStats() {
        const accuracyEl = document.getElementById('landingAccuracyRate');
        // We can keep the 99.8% static baseline but we'll load recent verifications
        loadRecentVerifications();
    }

    async function loadRecentVerifications() {
        const listEl = document.getElementById('recentVerificationsList');
        if (!listEl) return;

        try {
            const resp = await fetch('/api/news/articles');
            const articles = await resp.json();
            
            if (resp.ok && Array.isArray(articles) && articles.length > 0) {
                // Take latest 3-5 as requested
                const limited = articles.slice(0, 4);
                listEl.innerHTML = limited.map(art => `
                    <div class="d-flex align-items-center justify-content-between py-2 border-bottom border-light">
                        <span class="text-muted text-truncate w-75 fw-medium small">${art.title}</span>
                        <span class="${art.status === 'Real' ? 'text-success' : 'text-danger'} fw-bold small text-uppercase" style="font-size: 0.65rem;">
                            ${art.status === 'Real' ? 'LEGIT' : 'SUSPECT'}
                        </span>
                    </div>
                `).join('');
            }
        } catch (err) {
            console.error("Failed to load recent verifications:", err);
        }
    }

    function analyzeHomeNews(text) {
        const result = document.getElementById('homeVerifyResult');
        const verifyBtn = document.getElementById('verifyBtn');
        const accuracyEl = document.getElementById('landingAccuracyRate');
        
        if (verifyBtn) {
            verifyBtn.disabled = true;
            verifyBtn.innerHTML = '<span class="material-symbols-outlined fa-spin">refresh</span> Analyzing...';
        }

        // Apply mt-5 and padding as requested
        result.className = "verify-result mt-5 p-4 rounded-4 shadow-sm border border-light"; 
        result.innerHTML = `
            <div class="analyzing-animation text-center">
                <div class="spinner-border text-mint mb-3" role="status"></div>
                <p class="font-headline fw-bold text-navy">Veritas-Net AI is analyzing linguistic patterns...</p>
            </div>`;
        result.style.display = 'block';

        setTimeout(async () => {
            try {
                const response = await fetch('/api/news/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: text })
                });
                
                const data = await response.json();
                if (!response.ok) throw new Error("API Error");

                const isFake = data.status === 'Fake';
                const confidence = data.confidence;
                
                // Update the "Live Analysis" box on the right with current scan confidence
                if (accuracyEl) {
                    accuracyEl.textContent = confidence + '%';
                    accuracyEl.classList.add('text-mint');
                    // Change the label above or below it to "Latest Analysis" if we want, but user just said "it should tell the percentage"
                }

                result.innerHTML = `
                    <div class="result-animation reveal-up">
                        <div class="d-flex align-items-center gap-4 mb-4">
                            <div class="rounded-circle ${isFake ? 'bg-danger text-white' : 'bg-success text-white'} d-flex align-items-center justify-content-center pulse" style="width: 64px; height: 64px; flex-shrink: 0;">
                                <span class="material-symbols-outlined fs-2">${isFake ? 'error' : 'verified'}</span>
                            </div>
                            <div>
                                <h3 class="h4 fw-bold font-headline mb-1 mt-0 ${isFake ? 'text-danger' : 'text-success'}">
                                    ${isFake ? 'Potentially Fake News Detected' : 'Likely Authentic News'}
                                </h3>
                                <div class="badge ${isFake ? 'bg-danger' : 'bg-success'} text-white px-3 py-1 rounded-pill small">
                                    ${confidence}% Confidence Result
                                </div>
                            </div>
                        </div>
                        
                        <div class="card-editorial p-4 border-light shadow-sm bg-white">
                            <p class="mb-0 fw-medium text-navy">
                                <strong>${isFake ? '⚠️ AI Assessment:' : '✓ AI Assessment:'}</strong> ${isFake 
                                    ? 'Our model detected patterns common in misinformation, including sensationalist language and source inconsistencies.' 
                                    : 'Linguistic patterns align with credible editorial standards. This content shows high indicators of factual reliability.'}
                            </p>
                        </div>

                        <div class="d-flex flex-wrap gap-2 mt-4">
                            <a href="register.html" class="btn btn-navy py-2 px-4 shadow-sm">Create Full Audit Report</a>
                            <button onclick="window.location.reload()" class="btn btn-outline-navy py-2 px-4">Verify New Text</button>
                        </div>
                    </div>
                `;

                // Also reload recent verifications to include this one (if it was saved to DB)
                loadRecentVerifications();

            } catch (err) {
                result.innerHTML = `
                    <div class="card-editorial p-4 border-danger border-opacity-25 bg-danger bg-opacity-10">
                        <p class="text-danger mb-0 fw-bold">
                            <i class="material-symbols-outlined align-middle me-2">report</i>
                            Analysis Engine Offline. Please ensure the backend server is active.
                        </p>
                    </div>`;
            } finally {
                if (verifyBtn) {
                    verifyBtn.disabled = false;
                    verifyBtn.textContent = 'Verify Now';
                }
            }
        }, 2200);
    }
});