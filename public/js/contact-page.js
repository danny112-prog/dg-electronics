  document.addEventListener('DOMContentLoaded', function() {
    var form = document.getElementById('contactForm');
    if (!form) return;
    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      var btn = document.getElementById('contactSubmitBtn');
      var success = document.getElementById('contactSuccess');
      var error = document.getElementById('contactError');
      btn.disabled = true; btn.textContent = 'Sending...';
      success.style.display = 'none'; error.style.display = 'none';
      try {
        var data = {
          name: document.getElementById('contactName').value.trim(),
          email: document.getElementById('contactEmail').value.trim(),
          phone: document.getElementById('contactPhone').value.trim(),
          subject: document.getElementById('contactSubject').value,
          message: document.getElementById('contactMessage').value.trim()
        };
        var resp = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        var result = await resp.json();
        if (!resp.ok) throw new Error(result.error || 'Failed to send message');
        success.style.display = 'block';
        form.reset();
      } catch (err) {
        error.textContent = err.message;
        error.style.display = 'block';
      }
      btn.disabled = false; btn.textContent = 'Send Message';
    });
  });
