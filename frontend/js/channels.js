const API_BASE = '';
let verifyModalInstance = null;

document.addEventListener('DOMContentLoaded', () => {
    // Initialize Modal
    verifyModalInstance = new bootstrap.Modal(document.getElementById('verifyModal'));

    // Category Buttons
    const categoryBtns = document.querySelectorAll('.category-btn');
    categoryBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            categoryBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const channelKey = btn.getAttribute('data-channel');
            loadArticles(channelKey);
        });
    });

    // Auto-load Dawn
    loadArticles('dawn');
});

async function loadArticles(channelKey) {
    const grid = document.getElementById('channelsGrid');
    
    // Show Skeleton Loading
    grid.innerHTML = '';
    for (let i = 0; i < 6; i++) {
        grid.innerHTML += `
            <div class="col-lg-4 col-md-6">
                <div class="card card-editorial h-100 placeholder-glow">
                    <div class="card-body d-flex flex-column p-4">
                        <div class="d-flex justify-content-between mb-3">
                            <span class="placeholder col-4 bg-secondary"></span>
                            <span class="placeholder col-3 bg-secondary"></span>
                        </div>
                        <h5 class="card-title placeholder-glow mb-3">
                            <span class="placeholder col-12 bg-secondary"></span>
                            <span class="placeholder col-8 bg-secondary"></span>
                        </h5>
                        <p class="card-text placeholder-glow mb-4 flex-grow-1">
                            <span class="placeholder col-12 bg-secondary"></span>
                            <span class="placeholder col-12 bg-secondary"></span>
                            <span class="placeholder col-6 bg-secondary"></span>
                        </p>
                        <div class="d-flex justify-content-between align-items-center mt-auto">
                            <span class="placeholder col-4 bg-secondary"></span>
                            <span class="placeholder col-4 bg-secondary"></span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    try {
        const response = await fetch(`${API_BASE}/api/channels/articles?channel=${channelKey}`);
        if (!response.ok) throw new Error('Failed to fetch articles');
        const data = await response.json();
        
        grid.innerHTML = ''; // Clear skeleton
        
        if (!data.articles || data.articles.length === 0) {
            grid.innerHTML = '<div class="col-12 text-center text-muted py-5">No articles found for this channel.</div>';
            return;
        }

        data.articles.forEach(article => {
            const dateStr = article.published_at ? new Date(article.published_at).toLocaleDateString() : 'Recent';
            
            const card = document.createElement('div');
            card.className = 'col-lg-4 col-md-6';
            card.innerHTML = `
                <div class="card card-editorial h-100">
                    <div class="card-body d-flex flex-column p-4">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <span class="news-category-badge">${article.source}</span>
                            <small class="text-muted fw-medium flex-shrink-0 ms-2">${dateStr}</small>
                        </div>
                        <h4 class="card-title font-headline fw-bold text-navy mb-3" style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${article.title}</h4>
                        <p class="card-text text-muted mb-4 flex-grow-1" style="display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${article.excerpt}...</p>
                        <div class="d-flex justify-content-between align-items-center mt-auto border-top pt-3">
                            <button class="btn-navy py-2 px-3 rounded-2 border-0" onclick="openVerifyModal('${article.url}', \`${article.title.replace(/`/g, "'")}\`)">
                                <span class="d-flex align-items-center gap-2">
                                    <span class="material-symbols-outlined fs-5">shield_check</span>
                                    Verify
                                </span>
                            </button>
                            <a href="${article.url}" target="_blank" class="text-navy fw-bold text-decoration-none d-flex align-items-center gap-1">
                                Read Article
                                <span class="material-symbols-outlined fs-6">open_in_new</span>
                            </a>
                        </div>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
    } catch (error) {
        console.error('Error loading articles:', error);
        grid.innerHTML = '<div class="col-12 text-center text-danger py-5">Error loading articles. Please try again later.</div>';
    }
}

function openVerifyModal(url, title) {
    const modalBody = document.getElementById('verifyModalBody');
    const modalTitle = document.getElementById('verifyModalTitle');
    
    modalTitle.textContent = 'Verifying Article...';
    modalBody.innerHTML = `
        <div class="text-center py-5">
            <div class="spinner-border text-navy mb-3" role="status" style="width: 3rem; height: 3rem;">
                <span class="visually-hidden">Loading...</span>
            </div>
            <h5 class="font-headline text-navy fw-bold mb-2">Analyzing Content</h5>
            <p class="text-muted small mx-auto" style="max-width: 300px;">
                Our AI model is fetching and analyzing the article text for signs of misinformation...
            </p>
        </div>
    `;
    
    verifyModalInstance.show();
    verifyArticle(url, title);
}

async function verifyArticle(url, title) {
    const modalBody = document.getElementById('verifyModalBody');
    const modalTitle = document.getElementById('verifyModalTitle');
    
    let userId = null;
    try {
        const userStr = localStorage.getItem('veritas_user');
        if (userStr) {
            userId = JSON.parse(userStr).id;
        }
    } catch (e) {
        console.error("Failed to parse user from localStorage", e);
    }

    try {
        const response = await fetch(`${API_BASE}/api/channels/verify-url`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: url, user_id: userId })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Verification failed');
        }

        modalTitle.textContent = 'Verification Result';
        
        const statusBadgeClass = data.status === 'Real' ? 'bg-success' : 'bg-danger';
        const confidenceVal = parseFloat(data.confidence).toFixed(1);
        
        modalBody.innerHTML = `
            <div class="text-center">
                <div class="mb-4">
                    <span class="badge ${statusBadgeClass} text-white fs-4 px-4 py-2 rounded-pill font-headline fw-bold shadow-sm">
                        ${data.status} News
                    </span>
                </div>
                <h4 class="font-headline fw-bold text-navy mb-3">${title}</h4>
                
                <div class="bg-light rounded-4 p-4 mb-4 text-start">
                    <div class="d-flex justify-content-between mb-2">
                        <span class="text-muted fw-bold">AI Confidence</span>
                        <span class="fw-bold text-navy">${confidenceVal}%</span>
                    </div>
                    <div class="progress" style="height: 10px;">
                        <div class="progress-bar ${statusBadgeClass}" role="progressbar" style="width: ${confidenceVal}%"></div>
                    </div>
                    <div class="mt-3 small text-muted">
                        <strong>Model Used:</strong> ${data.model_used || 'Unknown'}<br>
                        <strong>Analyzed Length:</strong> ${data.text_length || 0} characters
                    </div>
                </div>
                
                <a href="${url}" target="_blank" class="btn btn-outline-navy rounded-pill px-4">
                    <span class="d-flex align-items-center gap-2">
                        Read Full Article
                        <span class="material-symbols-outlined fs-5">open_in_new</span>
                    </span>
                </a>
            </div>
        `;
    } catch (error) {
        console.error('Verification error:', error);
        modalTitle.textContent = 'Verification Error';
        modalBody.innerHTML = `
            <div class="text-center text-danger py-4">
                <span class="material-symbols-outlined mb-3" style="font-size: 48px;">error</span>
                <h5 class="fw-bold font-headline mb-2">Error Verifying Article</h5>
                <p class="text-muted small">${error.message}</p>
            </div>
        `;
    }
}
