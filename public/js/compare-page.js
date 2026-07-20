    if (document.getElementById('year')) document.getElementById('year').textContent = new Date().getFullYear();

    let allProducts = [];
    let compareIds = [];

    async function init() {
      const urlParams = new URLSearchParams(window.location.search);
      const idsParam = urlParams.get('ids');
      if (idsParam) compareIds = idsParam.split(',').filter(Boolean);
      try {
        const stored = JSON.parse(localStorage.getItem('dg_compare') || '[]');
        if (!compareIds.length && stored.length) compareIds = stored;
      } catch(e) {}
      try {
        const res = await fetch('/api/products?limit=200');
        const data = await res.json();
        allProducts = data.products || data.data || [];
      } catch(e) { allProducts = []; }
      renderCompare();
    }

    function formatPrice(n) { return '\u20a6' + Number(n || 0).toLocaleString(); }
    function stars(r) {
      let s = '';
      for (let i = 1; i <= 5; i++) s += i <= Math.round(r) ? '\u2605' : '\u2606';
      return s;
    }
    function escapeHtml(t) {
      if (!t) return '';
      const d = document.createElement('div');
      d.textContent = t;
      return d.innerHTML;
    }

    function renderCompare() {
      const products = compareIds.map(id => allProducts.find(p => p._id === id)).filter(Boolean);
      const emptyEl = document.getElementById('compareEmpty');
      const tableCard = document.getElementById('compareTableCard');
      const addSection = document.getElementById('compareAddSection');
      const subtitle = document.getElementById('compareSubtitle');
      if (products.length < 2) {
        emptyEl.style.display = '';
        tableCard.style.display = 'none';
        addSection.style.display = 'none';
        subtitle.textContent = 'Add at least 2 products to compare';
        return;
      }
      emptyEl.style.display = 'none';
      tableCard.style.display = '';
      addSection.style.display = products.length < 4 ? '' : 'none';
      subtitle.textContent = 'Comparing ' + products.length + ' products';

      const specRows = [
        { label: 'Price', format: p => formatPrice(p.price) + (p.oldPrice ? ' <span style="color:var(--muted);text-decoration:line-through;font-size:0.8em">' + formatPrice(p.oldPrice) + '</span>' : '') },
        { label: 'Brand', format: p => escapeHtml(p.brand || '-') },
        { label: 'Category', format: p => escapeHtml(p.category || '-') },
        { label: 'Rating', format: p => stars(p.rating) + ' (' + p.rating + '/5)' },
        { label: 'Reviews', format: p => (p.reviews || 0) + ' reviews' },
        { label: 'Stock', format: p => p.stock > 0 ? '<span style="color:#2e7d32">In Stock (' + p.stock + ')</span>' : '<span style="color:#c62828">Out of Stock</span>' }
      ];
      const allSpecKeys = new Set();
      products.forEach(p => { if (p.specifications) Object.keys(p.specifications).forEach(k => allSpecKeys.add(k)); });
      const specOrder = ['Display', 'Processor', 'Chip', 'RAM', 'Memory', 'Storage', 'Camera', 'Battery', 'Graphics', 'Resolution', 'Water', 'Type', 'ANC', 'Codec', 'CPU', 'GPU', 'Power', 'Operating System', 'OS'];
      const orderedKeys = specOrder.filter(k => allSpecKeys.has(k));
      const extraKeys = [...allSpecKeys].filter(k => !specOrder.includes(k));
      [...orderedKeys, ...extraKeys].forEach(key => {
        specRows.push({ label: key, format: p => escapeHtml((p.specifications || {})[key] || '-') });
      });
      specRows.push({ label: 'Warranty', format: p => escapeHtml(p.warranty || '-') });

      const thead = document.getElementById('compareThead');
      thead.innerHTML = '<tr><th>Feature</th>' + products.map(p =>
        '<th><img class="compare-product-img" src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.name) + '" /><div class="compare-product-name">' + escapeHtml(p.name) + '</div><div class="compare-product-price">' + formatPrice(p.price) + '</div><div class="compare-product-actions"><a href="/product/' + escapeHtml(p.slug || p._id) + '" class="btn btn-primary btn-sm">View</a><button class="btn btn-secondary btn-sm" data-action="remove-compare" data-product-id="' + escapeHtml(p._id) + '">Remove</button></div></th>'
      ).join('') + '</tr>';

      const tbody = document.getElementById('compareTbody');
      tbody.innerHTML = specRows.map(row => {
        let bestIdx = -1;
        if (row.label === 'Price') {
          let min = Infinity;
          products.forEach((p, i) => { if (p.price < min) { min = p.price; bestIdx = i; } });
        }
        return '<tr><td>' + row.label + '</td>' + products.map((p, i) => {
          const val = row.format(p);
          return '<td' + (i === bestIdx ? ' class="compare-best"' : '') + '>' + val + '</td>';
        }).join('') + '</tr>';
      }).join('');

      localStorage.setItem('dg_compare', JSON.stringify(compareIds));
    }

    function removeCompare(id) {
      compareIds = compareIds.filter(i => i !== id);
      localStorage.setItem('dg_compare', JSON.stringify(compareIds));
      renderCompare();
    }

    async function searchAndAdd() {
      const q = document.getElementById('compareSearchInput').value.trim().toLowerCase();
      const resultsEl = document.getElementById('compareSearchResults');
      if (!q) { resultsEl.innerHTML = ''; return; }
      const matches = allProducts.filter(p =>
        !compareIds.includes(p._id) &&
        (p.name.toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q))
      ).slice(0, 5);
      if (!matches.length) {
        resultsEl.innerHTML = '<p class="compare-no-results">No products found</p>';
        return;
      }
      resultsEl.innerHTML = matches.map(p =>
        '<div class="compare-search-result" data-action="add-compare" data-product-id="' + p._id + '">' +
          '<img src="' + escapeHtml(p.image) + '" alt="" width="40" height="40" />' +
          '<div style="flex:1"><strong>' + escapeHtml(p.name) + '</strong><br><small>' + escapeHtml(p.brand || '') + ' - ' + formatPrice(p.price) + '</small></div>' +
          '<button class="btn btn-primary btn-sm">Add</button>' +
        '</div>'
      ).join('');
    }

    function addCompare(id) {
      if (compareIds.length >= 4) { alert('Maximum 4 products can be compared'); return; }
      if (!compareIds.includes(id)) {
        compareIds.push(id);
        localStorage.setItem('dg_compare', JSON.stringify(compareIds));
        renderCompare();
        document.getElementById('compareSearchInput').value = '';
        document.getElementById('compareSearchResults').innerHTML = '';
      }
    }

    document.getElementById('compareSearchInput').addEventListener('keypress', e => { if (e.key === 'Enter') searchAndAdd(); });

    setTimeout(function() { var l = document.getElementById('loader'); if (l) l.classList.add('hidden'); }, 600);
    init();
