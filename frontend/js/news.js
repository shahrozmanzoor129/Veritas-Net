document.addEventListener('DOMContentLoaded', function() {
    const newsGrid      = document.getElementById('newsGrid');
    const categoryBtns  = document.querySelectorAll('.category-btn');
    const modal         = document.getElementById('newsDetailModal');
    const modalCloseBtn = document.getElementById('newsModalCloseBtn');
    const modalTitle    = document.getElementById('newsModalTitle');
    const modalBody     = document.getElementById('newsModalBody');

    let currentCategory = 'all';
    let cachedArticles  = [];

    // ── Load admin-published news only ────────────────────────────────────────
    async function loadNews(category = 'all') {
        newsGrid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:3rem;">
                <i class="fas fa-spinner fa-spin" style="font-size:2rem;color:var(--primary);"></i>
                <p style="margin-top:1rem;color:var(--text-secondary);">Loading news articles...</p>
            </div>`;

        try {
            const response = await fetch('/api/news/articles');
            const articles = await response.json();

            if (!Array.isArray(articles)) throw new Error('Invalid response');

            cachedArticles = articles;

            // Filter by category if selected
            const filtered = category === 'all'
                ? articles
                : articles.filter(n => (n.category || '').toLowerCase() === category.toLowerCase());

            if (filtered.length === 0) {
                newsGrid.innerHTML = `
                    <div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--text-secondary);">
                        <i class="fas fa-newspaper" style="font-size:3rem;opacity:0.3;margin-bottom:1rem;display:block;"></i>
                        <h3>${category === 'all' ? 'No News Published Yet' : `No "${category}" articles yet`}</h3>
                        <p>Admin publishes verified news articles here.</p>
                    </div>`;
                return;
            }

            newsGrid.innerHTML = filtered.map(news => {
                const isReal    = news.status === 'Real';
                const excerpt   = (news.content || '').substring(0, 140);
                const dateStr   = news.submission_date
                    ? new Date(news.submission_date).toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'})
                    : 'Unknown date';
                const confidence = typeof news.confidence === 'number' ? news.confidence.toFixed(1) : '—';

                return `
                <div class="col-lg-4 col-md-6">
                    <div class="card-editorial h-100" style="cursor:pointer;" onclick="showNewsDetail(${news.news_id})">
                        <div class="p-4 d-flex flex-column h-100">
                            <div class="d-flex justify-content-between align-items-center mb-4">
                                <div class="badge ${isReal ? 'bg-success text-white' : 'bg-danger text-white'} fw-bold px-3 py-2 rounded-pill tracking-widest text-uppercase" style="font-size: 0.65rem; border: 1px solid rgba(0,0,0,0.1);">
                                    <i class="fas ${isReal ? 'fa-check-circle' : 'fa-exclamation-triangle'} me-1"></i> ${news.status || 'Unknown'}
                                </div>
                                <span class="news-category-badge">${news.category || 'General'}</span>
                            </div>
                            <h3 class="h5 fw-bold font-headline mb-3 text-navy">${escHtml((news.title||'Untitled').substring(0,80))}${(news.title||'').length>80?'...':''}</h3>
                            <p class="text-muted small fw-medium mb-4">${escHtml(excerpt)}${(news.content||'').length>140?'...':''}</p>
                            <div class="d-flex align-items-center justify-content-between mt-auto pt-3 border-top border-light opacity-75">
                                <span class="text-muted fw-bold" style="font-size: 0.65rem;">
                                    <i class="fas fa-calendar me-1"></i> ${dateStr}
                                </span>
                                <span class="text-navy fw-bold" style="font-size: 0.7rem;">
                                    <i class="fas fa-chart-bar me-1"></i> ${confidence}%
                                </span>
                            </div>
                            <div class="mt-3">
                                <button class="btn-navy w-100 py-2 small rounded-3 border-0" onclick="event.stopPropagation();showNewsDetail(${news.news_id})">READ MORE</button>
                            </div>
                        </div>
                    </div>
                </div>`;
            }).join('');

        } catch (err) {
            newsGrid.innerHTML = `
                <div style="grid-column:1/-1;text-align:center;padding:3rem;color:red;">
                    <i class="fas fa-exclamation-triangle" style="font-size:2rem;margin-bottom:1rem;display:block;"></i>
                    <p>Failed to load news. Make sure the backend server is running.</p>
                    <button class="btn btn-secondary" onclick="loadNews()" style="margin-top:1rem;">
                        <i class="fas fa-redo"></i> Retry
                    </button>
                </div>`;
        }
    }

    // ── Category filtering ────────────────────────────────────────────────────
    categoryBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            categoryBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentCategory = this.dataset.category;
            loadNews(currentCategory);
        });
    });

    // ── News Detail Modal ─────────────────────────────────────────────────────
    window.showNewsDetail = function(id) {
        const news = cachedArticles.find(n => n.news_id === id);
        if (!news) return;

        const isReal   = news.status === 'Real';
        const dateStr  = news.submission_date
            ? new Date(news.submission_date).toLocaleDateString('en-US', {year:'numeric',month:'long',day:'numeric'})
            : '—';

        modalTitle.textContent = news.title || 'News Details';
        modalBody.innerHTML = `
            <div class="d-flex flex-wrap gap-2 align-items-center mb-4">
                <span class="badge ${isReal ? 'bg-success text-white' : 'bg-danger text-white'} px-4 py-2 rounded-pill text-uppercase tracking-widest fw-bold">
                    <i class="fas ${isReal ? 'fa-check-circle' : 'fa-exclamation-triangle'} me-1"></i> ${news.status || 'Unknown'}
                </span>
                <span class="news-category-badge px-4 py-2">${news.category || 'General'}</span>
                <span class="text-muted small fw-bold ms-auto">
                    <i class="fas fa-calendar me-1"></i> ${dateStr}
                </span>
                ${news.confidence != null ? `
                <span class="text-navy small fw-bold">
                    <i class="fas fa-chart-bar me-1"></i> ${news.confidence.toFixed(1)}% confidence
                </span>` : ''}
            </div>
            <div class="bg-light p-4 rounded-3" style="line-height: 1.8; white-space: pre-wrap; font-size: 1.05rem;">
                ${escHtml(news.content || 'No content available.')}
            </div>`;

        if (modal) {
            const bsModal = new bootstrap.Modal(modal);
            bsModal.show();
        }
    };

    // ── Utility ───────────────────────────────────────────────────────────────
    function escHtml(str) {
        return String(str||'')
            .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
    }

    loadNews();
});