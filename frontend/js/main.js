document.addEventListener('DOMContentLoaded', function() {
    // ── Mobile navbar ────────────────────────────────────────────────────────
    const hamburger = document.querySelector('.hamburger');
    const navLinks  = document.querySelector('.nav-links');

    if (hamburger) {
        hamburger.addEventListener('click', function() {
            navLinks.classList.toggle('active');
        });
        document.addEventListener('click', function(e) {
            if (!hamburger.contains(e.target) && !navLinks.contains(e.target)) {
                navLinks.classList.remove('active');
            }
        });
    }

    // ── Contact form → backend API ───────────────────────────────────────────
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const formMessage = document.getElementById('formMessage');
            const submitBtn   = contactForm.querySelector('button[type="submit"]');

            const name    = document.getElementById('name').value.trim();
            const email   = document.getElementById('email').value.trim();
            const subject = document.getElementById('subject').value.trim();
            const message = document.getElementById('message').value.trim();

            if (!name || !email || !message) {
                formMessage.className = 'form-message error';
                formMessage.textContent = 'Please fill in all required fields.';
                return;
            }

            submitBtn.disabled = true;
            submitBtn.textContent = 'Sending...';

            try {
                const response = await fetch('/api/contact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, subject, message })
                });
                const data = await response.json();

                if (response.ok) {
                    formMessage.className = 'form-message success';
                    formMessage.textContent = data.message || 'Message sent! We will get back to you soon.';
                    contactForm.reset();
                } else {
                    formMessage.className = 'form-message error';
                    formMessage.textContent = data.error || 'Failed to send message. Try again.';
                }
            } catch (err) {
                formMessage.className = 'form-message error';
                formMessage.textContent = 'Connection error. Make sure the backend server is running.';
            } finally {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Send Message';
                setTimeout(() => { formMessage.className = 'form-message'; }, 6000);
            }
        });
    }
});
