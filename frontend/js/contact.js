document.addEventListener('DOMContentLoaded', () => {
    const form = document.querySelector('form');
    if(form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = form.querySelector('button[type="submit"]');
            const originalBtnHtml = btn.innerHTML;
            btn.innerHTML = 'Sending... <i class="fas fa-spinner fa-spin ms-2"></i>';
            btn.disabled = true;

            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());

            try {
                const response = await fetch('/api/contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(data)
                });
                
                const result = await response.json();
                
                if (response.ok) {
                    alert(result.message || 'Message sent successfully!');
                    form.reset();
                } else {
                    alert(result.error || 'Failed to send message.');
                }
            } catch (err) {
                alert('Connection error. Could not send message.');
            } finally {
                btn.innerHTML = originalBtnHtml;
                btn.disabled = false;
            }
        });
    }
});
