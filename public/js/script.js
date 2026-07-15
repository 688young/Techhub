document.addEventListener('DOMContentLoaded', function() {
  var contactForm = document.getElementById('contactForm');
  if (contactForm) {
    contactForm.addEventListener('submit', function(e) {
      e.preventDefault();
      var formData = new FormData(this);
      var data = {
        name: formData.get('name') || this.querySelector('input[placeholder="Your Name"]')?.value || '',
        email: formData.get('email') || this.querySelector('input[placeholder="Your Email"]')?.value || '',
        message: formData.get('message') || this.querySelector('textarea')?.value || ''
      };
      var btn = this.querySelector('.btn');
      btn.textContent = 'Sending...';
      btn.disabled = true;

      fetch('/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })
      .then(function(r) { return r.json(); })
      .then(function(res) {
        var msgEl = document.getElementById('formMsg');
        if (msgEl) {
          msgEl.textContent = res.message;
          msgEl.style.color = '#28a745';
        }
        contactForm.reset();
      })
      .catch(function() {
        var msgEl = document.getElementById('formMsg');
        if (msgEl) {
          msgEl.textContent = 'Failed to send. Please try again.';
          msgEl.style.color = '#e74c3c';
        }
      })
      .finally(function() {
        btn.textContent = 'Send Message';
        btn.disabled = false;
      });
    });
  }

  var cards = document.querySelectorAll('.card');
  var observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, { threshold: 0.1 });

  cards.forEach(function(card) {
    card.style.opacity = '0';
    card.style.transform = 'translateY(30px)';
    card.style.transition = 'all 0.5s ease';
    observer.observe(card);
  });
});
