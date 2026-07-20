  document.addEventListener('DOMContentLoaded', function() {
    var faqList = document.getElementById('faqList');
    var faqSearch = document.getElementById('faqSearch');
    var categories = document.getElementById('faqCategories');
    var allFaqs = [];
    var activeCategory = 'all';

    async function loadFaqs() {
      try {
        var url = '/api/faqs';
        var resp = await fetch(url);
        allFaqs = await resp.json();
        renderFaqs();
      } catch (err) {
        faqList.innerHTML = '<p class="faq-empty">Failed to load FAQs. Please try again later.</p>';
      }
    }

    function renderFaqs() {
      var search = (faqSearch.value || '').toLowerCase().trim();
      var filtered = allFaqs.filter(function(faq) {
        var matchCat = activeCategory === 'all' || faq.category === activeCategory;
        var matchSearch = !search || faq.question.toLowerCase().indexOf(search) !== -1 || faq.answer.toLowerCase().indexOf(search) !== -1;
        return matchCat && matchSearch;
      });

      if (filtered.length === 0) {
        faqList.innerHTML = '<p class="faq-empty">No questions found. Try a different search or category.</p>';
        return;
      }

      var categoryLabels = { orders: 'Orders', payments: 'Payments', shipping: 'Shipping', returns: 'Returns', warranty: 'Warranty', account: 'Account' };
      var grouped = {};
      filtered.forEach(function(faq) {
        if (!grouped[faq.category]) grouped[faq.category] = [];
        grouped[faq.category].push(faq);
      });

      var html = '';
      Object.keys(grouped).forEach(function(cat) {
        html += '<div class="faq-group">';
        html += '<h3 class="faq-group-title">' + (categoryLabels[cat] || cat) + '</h3>';
        grouped[cat].forEach(function(faq, i) {
          html += '<div class="faq-item" data-id="' + faq._id + '">';
          html += '<button class="faq-question" data-action="toggle-faq" aria-expanded="false">';
          html += '<span>' + faq.question + '</span>';
          html += '<svg class="faq-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';
          html += '</button>';
          html += '<div class="faq-answer"><p>' + faq.answer + '</p>';
          html += '<button class="faq-helpful-btn" data-action="faq-helpful" data-faq-id="' + faq._id + '">Helpful (' + (faq.helpful || 0) + ')</button>';
          html += '</div></div>';
        });
        html += '</div>';
      });
      faqList.innerHTML = html;
    }

    categories.addEventListener('click', function(e) {
      var btn = e.target.closest('.faq-cat-btn');
      if (!btn) return;
      categories.querySelectorAll('.faq-cat-btn').forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      activeCategory = btn.dataset.category;
      renderFaqs();
    });

    faqSearch.addEventListener('input', function() { renderFaqs(); });

    window.markHelpful = async function(id, btn) {
      try {
        var resp = await fetch('/api/faqs/' + id + '/helpful', { method: 'POST' });
        var data = await resp.json();
        btn.textContent = 'Helpful (' + data.helpful + ')';
        btn.disabled = true;
        btn.style.opacity = '0.6';
      } catch (err) {}
    };

    loadFaqs();
  });
