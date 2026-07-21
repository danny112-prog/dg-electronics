/* ═══════════════════════════════════════════════
   DG Electronics – Complete Frontend JavaScript
   Updated with gallery, zoom, multiple payments
   ═══════════════════════════════════════════════ */

(function () {
  'use strict';

  const API = '';
  const DELIVERY_FEE = 2000;
  const FREE_DELIVERY_THRESHOLD = 500000;

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
  }

  const FALLBACK_PRODUCTS = [
    { _id:'1', name:'iPhone 17 Pro Max', slug:'iphone-17-pro-max', category:'phones', brand:'Apple', price:1850000, oldPrice:1950000, description:'The most powerful iPhone ever with A19 Pro chip, 48MP Fusion camera system, titanium design, and all-day battery life.', image:'/images/products/iPhone-17-Pro-Max.jpg', images:['/images/products/iPhone-17-Pro-Max.jpg'], badge:'new', rating:4.9, reviews:89, stock:15, featured:true, bestSeller:true, specifications:{Display:'6.9" Super Retina XDR',Chip:'A19 Pro',Camera:'48MP Fusion',Storage:'256GB'} },
    { _id:'2', name:'iPhone 16 Pro', slug:'iphone-16-pro', category:'phones', brand:'Apple', price:1450000, description:'Pro-level performance with A18 Pro chip, 48MP camera system, titanium design.', image:'/images/products/iPhone-16-Pro.jpg', images:['/images/products/iPhone-16-Pro.jpg'], badge:'new', rating:4.8, reviews:156, stock:20, featured:true, specifications:{Display:'6.3" Super Retina XDR',Chip:'A18 Pro',Camera:'48MP',Storage:'128GB'} },
    { _id:'3', name:'iPhone 16', slug:'iphone-16', category:'phones', brand:'Apple', price:1150000, description:'Latest generation with A18 chip, 48MP camera, Action Button.', image:'/images/products/iPhone-16.jpg', images:['/images/products/iPhone-16.jpg'], rating:4.7, reviews:203, stock:30, featured:true, specifications:{Display:'6.1" Super Retina XDR',Chip:'A18',Camera:'48MP',Storage:'128GB'} },
    { _id:'4', name:'iPhone 15', slug:'iphone-15', category:'phones', brand:'Apple', price:899000, oldPrice:950000, description:'Dynamic Island and 48MP camera. USB-C connectivity.', image:'/images/products/iPhone-15.jpg', images:['/images/products/iPhone-15.jpg'], badge:'sale', rating:4.6, reviews:312, stock:40, specifications:{Display:'6.1" Super Retina XDR',Chip:'A16 Bionic',Camera:'48MP',Storage:'128GB'} },
    { _id:'5', name:'Samsung Galaxy S25 Ultra', slug:'samsung-galaxy-s25-ultra', category:'phones', brand:'Samsung', price:1650000, description:'Galaxy AI-powered flagship with S Pen, 200MP camera.', image:'/images/products/Samsung-Galaxy-S25-Ultra.jpg', images:['/images/products/Samsung-Galaxy-S25-Ultra.jpg'], badge:'new', rating:4.8, reviews:124, stock:25, featured:true, specifications:{Display:'6.9" QHD+ AMOLED',Chip:'Snapdragon 8 Elite',Camera:'200MP',Storage:'256GB'} },
    { _id:'6', name:'MacBook Air M3', slug:'macbook-air-m3', category:'laptops', brand:'Apple', price:1850000, description:'Impossibly thin with M3 chip. Up to 18 hours battery.', image:'/images/products/MacBook-Air-M3.jpg', images:['/images/products/MacBook-Air-M3.jpg'], badge:'new', rating:4.9, reviews:156, stock:12, featured:true, bestSeller:true, specifications:{Display:'13.6" Liquid Retina',Chip:'Apple M3',Memory:'8GB',Storage:'256GB SSD'} },
    { _id:'7', name:'Dell XPS 15', slug:'dell-xps-15', category:'laptops', brand:'Dell', price:1650000, description:'InfinityEdge display, 13th Gen Intel, NVIDIA RTX graphics.', image:'/images/products/Dell-XPS-15.jpg', images:['/images/products/Dell-XPS-15.jpg'], rating:4.7, reviews:134, stock:15, featured:true, specifications:{Display:'15.6" 3.5K OLED',Processor:'Intel i7-13700H',Graphics:'RTX 4060',Memory:'16GB DDR5'} },
    { _id:'8', name:'AirPods Pro 2', slug:'airpods-pro-2', category:'accessories', brand:'Apple', price:285000, description:'Active Noise Cancellation, Adaptive Transparency, USB-C.', image:'/images/products/AirPods-Pro-2.jpg', images:['/images/products/AirPods-Pro-2.jpg'], badge:'bestseller', rating:4.8, reviews:892, stock:80, bestSeller:true, specifications:{Type:'In-ear Wireless',ANC:'Yes',Chip:'H2',Battery:'6h'} },
    { _id:'9', name:'Sony WH-1000XM5', slug:'sony-wh1000xm5', category:'accessories', brand:'Sony', price:220000, description:'Industry-leading noise cancellation, 30-hour battery.', image:'/images/products/Sony-WH-1000XM5.jpg', images:['/images/products/Sony-WH-1000XM5.jpg'], rating:4.8, reviews:567, stock:35, featured:true, specifications:{Type:'Over-ear',ANC:'Industry-leading',Battery:'30 hours',Codec:'LDAC'} },
    { _id:'10', name:'JBL Charge 5', slug:'jbl-charge-5', category:'accessories', brand:'JBL', price:95000, description:'Portable Bluetooth speaker, IP67 waterproof, 20h battery.', image:'/images/products/JBL-Charge-5.jpg', images:['/images/products/JBL-Charge-5.jpg'], badge:'bestseller', rating:4.7, reviews:892, stock:60, bestSeller:true, specifications:{Power:'30W',Battery:'20 hours',Water:'IP67'} },
    { _id:'11', name:'PlayStation 5 Slim', slug:'playstation-5-slim', category:'gaming', brand:'Sony', price:520000, description:'Slimmer PS5 with 1TB SSD, 4K gaming at 120fps.', image:'/images/products/PlayStation-5-Slim.jpg', images:['/images/products/PlayStation-5-Slim.jpg'], badge:'hot', rating:4.9, reviews:1234, stock:15, bestSeller:true, specifications:{CPU:'AMD Zen 2',GPU:'10.28 TFLOPS',Storage:'1TB SSD',Resolution:'4K 120fps'} },
    { _id:'12', name:'Anker 737 Power Bank', slug:'anker-737-power-bank', category:'accessories', brand:'Anker', price:65000, description:'140W bidirectional charging, 24,000mAh capacity.', image:'/images/products/Anker-737-Power-Bank.jpg', images:['/images/products/Anker-737-Power-Bank.jpg'], rating:4.7, reviews:445, stock:40, specifications:{Capacity:'24,000mAh',Output:'140W Max',Ports:'2 USB-C + 1 USB-A'} },
  ];

  let products = [];
  let cart = JSON.parse(localStorage.getItem('dg_cart') || '[]');
  let currentUser = null;
  let currentCategory = 'all';
  let currentSort = 'newest';
  let searchQuery = '';
  let sessionId = localStorage.getItem('dg_session') || (Math.random().toString(36).slice(2) + Date.now().toString(36));
  localStorage.setItem('dg_session', sessionId);

  function formatPrice(n) { return '\u20A6' + Number(n).toLocaleString('en-NG'); }
  function stars(rating) { const f = Math.floor(rating); const h = rating % 1 >= 0.5 ? 1 : 0; return '\u2605'.repeat(f) + (h ? '\u2606' : '') + '\u2606'.repeat(5 - f - h); }
  function stockStatus(stock) { if (stock <= 0) return { text: 'Out of Stock', class: 'out-of-stock' }; if (stock <= 10) return { text: 'Only ' + stock + ' left', class: 'low-stock' }; return { text: 'In Stock', class: 'in-stock' }; }
  function saveCart() {
    localStorage.setItem('dg_cart', JSON.stringify(cart));
    updateCartUI();
    if (currentUser && getToken()) {
      fetch(API + '/api/cart', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + getToken() },
        body: JSON.stringify({ items: cart }),
        credentials: 'include'
      }).catch(() => {});
    }
  }
  function getToken() { return localStorage.getItem('dg_token'); }
  function setAuth(user, token) {
    currentUser = user;
    if (token) localStorage.setItem('dg_token', token); else localStorage.removeItem('dg_token');
    updateAuthUI();
    if (user && token) {
      fetch(API + '/api/cart', { headers: { 'Authorization': 'Bearer ' + token }, credentials: 'include' })
        .then(r => r.json())
        .then(serverCart => {
          if (Array.isArray(serverCart) && serverCart.length > 0) {
            const localCart = JSON.parse(localStorage.getItem('dg_cart') || '[]');
            if (localCart.length > 0) {
              serverCart.forEach(item => {
                const existing = localCart.find(c => c._id === item._id);
                if (existing) existing.quantity += item.quantity;
                else localCart.push(item);
              });
              cart = localCart;
            } else {
              cart = serverCart;
            }
            saveCart();
          }
        }).catch(() => {});
    }
  }

  function getCsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  async function api(path, options = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const csrf = getCsrfToken();
    if (csrf) headers['X-CSRF-Token'] = csrf;
    try {
      const res = await fetch(API + path, { ...options, headers, credentials: 'include' });
      if (!res.ok) { const err = await res.json().catch(() => ({ error: 'Request failed' })); throw new Error(err.error || 'Request failed'); }
      return res.json();
    } catch (e) { throw e; }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    setTimeout(() => { const l = document.getElementById('loader'); if (l) l.classList.add('hidden'); }, 800);
    initScrollProgress(); initReveal(); initNavbar(); initMobileNav(); initCart(); initProductModal(); initNewsletter(); initBackToTop(); initFooterYear(); initSearch();
    initEventDelegation();
    initGlobalImageFallback();
    var path = window.location.pathname;
    if (path === '/' || path === '/index.html' || path.startsWith('/category/')) {
      var urlParams = new URLSearchParams(window.location.search);
      var searchParam = urlParams.get('search');
      if (searchParam) { searchQuery = searchParam.toLowerCase(); var navInput = document.getElementById('navSearch'); if (navInput) navInput.value = searchParam; }
      var catParam = urlParams.get('category');
      if (catParam) { currentCategory = catParam; }
      loadProducts(); initCategoryTabs(); initSort(); initCategoryCards(); initFilters();
      loadHomepageSections();
    }
    else if (path === '/login') initLoginPage();
    else if (path === '/signup') initSignupPage();
    else if (path === '/forgot-password') initForgotPasswordPage();
    else if (path === '/account') initAccountPage();
    else if (path === '/checkout') initCheckoutPage();
    else if (path === '/admin') initAdminPage();
    else if (path === '/confirmation') initConfirmationPage();
    else if (path.startsWith('/product/')) initProductPage();
    if (getToken()) { api('/api/auth/me').then(u => setAuth(u, getToken())).catch(() => setAuth(null, null)); }
    startNotificationPolling();
  }

  // ── CSP-Safe Event Delegation ──
  function initEventDelegation() {
    document.body.addEventListener('click', function(e) {
      var btn = e.target.closest('[data-action]');
      if (!btn) return;
      var action = btn.getAttribute('data-action');
      switch (action) {
        case 'add-to-cart': e.preventDefault(); e.stopPropagation(); addToCart(btn.getAttribute('data-product-id'), 1); break;
        case 'add-to-cart-qty': e.preventDefault(); e.stopPropagation(); addToCartQty(btn.getAttribute('data-product-id')); break;
        case 'add-to-cart-close': e.preventDefault(); e.stopPropagation(); addToCart(btn.getAttribute('data-product-id'), 1); closeModal(); break;
        case 'buy-now': e.preventDefault(); e.stopPropagation(); buyNow(btn.getAttribute('data-product-id')); break;
        case 'buy-now-product': e.preventDefault(); e.stopPropagation(); buyNowProduct(btn.getAttribute('data-product-id')); break;
        case 'view-product': e.preventDefault(); e.stopPropagation(); viewProduct(btn.getAttribute('data-product-slug')); break;
        case 'quick-view': e.preventDefault(); e.stopPropagation(); quickView(btn.getAttribute('data-product-id')); break;
        case 'toggle-wishlist': e.preventDefault(); e.stopPropagation(); toggleWishlist(btn.getAttribute('data-product-id'), btn); break;
        case 'toggle-compare': e.preventDefault(); e.stopPropagation(); toggleCompare(btn.getAttribute('data-product-id'), btn); break;
        case 'show-compare': e.preventDefault(); showCompare(); break;
        case 'clear-compare': e.preventDefault(); window._compareList = []; updateCompareBar(); break;
        case 'cart-qty-minus': e.preventDefault(); updateCartQty(btn.getAttribute('data-product-id'), -1); break;
        case 'cart-qty-plus': e.preventDefault(); updateCartQty(btn.getAttribute('data-product-id'), 1); break;
        case 'remove-from-cart': e.preventDefault(); removeFromCart(btn.getAttribute('data-product-id')); break;
        case 'close-modal': e.preventDefault(); closeModal(); break;
        case 'close-lightbox': e.preventDefault(); closeLightbox(); break;
        case 'load-more': e.preventDefault(); loadMore(); break;
        case 'go-to-page': e.preventDefault(); goToPage(parseInt(btn.getAttribute('data-page'))); break;
        case 'change-image': e.preventDefault(); changeImage(parseInt(btn.getAttribute('data-index'))); break;
        case 'gallery-prev': e.preventDefault(); galleryPrev(); break;
        case 'gallery-next': e.preventDefault(); galleryNext(); break;
        case 'select-color': e.preventDefault(); selectColor(btn, btn.getAttribute('data-color-name')); break;
        case 'select-storage': e.preventDefault(); selectStorage(btn, parseFloat(btn.getAttribute('data-price'))); break;
        case 'product-qty-minus': e.preventDefault(); productQty(-1); break;
        case 'product-qty-plus': e.preventDefault(); productQty(1); break;
        case 'toggle-wishlist-detail': e.preventDefault(); e.stopPropagation(); toggleWishlistDetail(btn); break;
        case 'share-product': e.preventDefault(); e.stopPropagation(); shareProduct(btn.getAttribute('data-share-text'), btn.getAttribute('data-share-url')); break;
        case 'switch-tab': e.preventDefault(); switchProductTab(btn, btn.getAttribute('data-tab-id')); break;
        case 'open-lightbox': e.preventDefault(); openLightbox(); break;
        case 'open-cart': e.preventDefault(); openCart(); break;
        case 'view-order-detail': e.preventDefault(); viewOrderDetail(btn.getAttribute('data-order-id')); break;
        case 'view-order-detail-card': e.preventDefault(); viewOrderDetail(btn.getAttribute('data-order-id')); break;
        case 'cancel-order': e.preventDefault(); e.stopPropagation(); cancelOrder(btn.getAttribute('data-order-id')); break;
        case 'download-invoice': e.preventDefault(); downloadInvoice(); break;
        case 'download-order-invoice': e.preventDefault(); downloadOrderInvoice(btn.getAttribute('data-order-id')); break;
        case 'reorder': e.preventDefault(); reorder(btn.getAttribute('data-order-id')); break;
        case 'view-orders-list': e.preventDefault(); viewOrdersList(); break;
        case 'submit-search': e.preventDefault(); submitSearch(); break;
        case 'mark-review-helpful': e.preventDefault(); markReviewHelpful(btn.getAttribute('data-review-id')); break;
        case 'edit-review': e.preventDefault(); editReview(btn.getAttribute('data-review-id')); break;
        case 'delete-review': e.preventDefault(); deleteReview(btn.getAttribute('data-review-id')); break;
        case 'go-to-review-page': e.preventDefault(); goToReviewPage(parseInt(btn.getAttribute('data-page'))); break;
        case 'submit-review': e.preventDefault(); submitReview(); break;
        case 'update-review': e.preventDefault(); updateReview(btn.getAttribute('data-review-id')); break;
        case 'cancel-edit-review': e.preventDefault(); cancelEditReview(btn.getAttribute('data-review-id')); break;
        case 'remove-from-wishlist': e.preventDefault(); removeFromWishlist(btn.getAttribute('data-product-id')); break;
        case 'retry-payment': e.preventDefault(); localStorage.setItem('dg_lastOrder', JSON.stringify(window._retryOrder)); window.location.href = '/checkout?retry=' + encodeURIComponent(window._retryOrderNumber); break;
        case 'toggle-form': e.preventDefault(); var t = document.getElementById(btn.getAttribute('data-target')); if (t) t.style.display = t.style.display === 'none' || !t.style.display ? 'block' : 'none'; break;
        case 'hide-form': e.preventDefault(); var h = document.getElementById(btn.getAttribute('data-target')); if (h) h.style.display = 'none'; break;
        case 'toggle-faq': e.preventDefault(); var fi = btn.closest('.faq-item'); if (fi) fi.classList.toggle('open'); break;
        case 'faq-helpful': e.preventDefault(); var fid = btn.getAttribute('data-faq-id'); if (typeof window.markHelpful === 'function') window.markHelpful(fid, btn); break;
        case 'reload-page': e.preventDefault(); location.reload(); break;
        case 'apply-coupon': e.preventDefault(); if (typeof applyCoupon === 'function') applyCoupon(); else if (typeof DG !== 'undefined' && DG.applyCoupon) DG.applyCoupon(); break;
        case 'download-invoice': e.preventDefault(); if (typeof downloadInvoice === 'function') downloadInvoice(); else if (typeof DG !== 'undefined' && DG.downloadInvoice) DG.downloadInvoice(); break;
        case 'compare-search': e.preventDefault(); if (typeof searchAndAdd === 'function') searchAndAdd(); break;
        case 'remove-compare': e.preventDefault(); var rid = btn.getAttribute('data-product-id'); if (typeof removeCompare === 'function') removeCompare(rid); break;
        case 'add-compare': e.preventDefault(); var acid = btn.getAttribute('data-product-id'); if (typeof addCompare === 'function') addCompare(acid); break;
        case 'switch-tracking-tab': e.preventDefault(); var tt = btn.getAttribute('data-tracking-tab'); if (typeof switchTrackingTab === 'function') switchTrackingTab(tt); break;
        case 'track-order': e.preventDefault(); if (typeof trackOrder === 'function') trackOrder(); break;
        case 'lookup-order': e.preventDefault(); if (typeof lookupOrder === 'function') lookupOrder(); break;
        case 'lightbox-prev': e.preventDefault(); e.stopPropagation(); lightboxPrev(); break;
        case 'lightbox-next': e.preventDefault(); e.stopPropagation(); lightboxNext(); break;
        default: break;
      }
    });

    document.body.addEventListener('change', function(e) {
      var el = e.target.closest('[data-action]');
      if (!el) return;
      var action = el.getAttribute('data-action');
      if (action === 'sort-reviews') { sortReviews(el.value); }
      else if (action === 'update-order-status') { updateOrderStatus(el.getAttribute('data-order-id'), el.value); }
      else if (action === 'filter-category') {
        var cat = el.getAttribute('data-category') || 'all';
        currentCategory = cat;
        document.querySelectorAll('.category-tabs .tab').forEach(function(t) { t.classList.toggle('active', t.dataset.category === cat); });
        window._visibleCount = 12;
        filterAndRenderProducts();
        closeFilters();
      }
      else if (action === 'load-orders') { if (typeof loadOrders === 'function') loadOrders(1); }
      else if (action === 'load-analytics') { if (typeof loadAnalytics === 'function') loadAnalytics(); }
    });
  }

  function initGlobalImageFallback() {
    document.addEventListener('error', function(e) {
      if (e.target.tagName === 'IMG' && !e.target.dataset.fallbackApplied) {
        e.target.dataset.fallbackApplied = '1';
        e.target.src = '/images/placeholder.svg';
      }
    }, true);
  }

  let notificationPollInterval = null;
  function startNotificationPolling() {
    if (!getToken()) return;
    if (notificationPollInterval) clearInterval(notificationPollInterval);
    pollNotifications();
    notificationPollInterval = setInterval(pollNotifications, 30000);
  }

  async function pollNotifications() {
    if (!getToken()) return;
    try {
      const data = await api('/api/notifications/unread-count');
      updateNotificationBadge(data.count);
    } catch {}
  }

  function updateNotificationBadge(count) {
    document.querySelectorAll('.notification-badge').forEach(el => {
      if (count > 0) {
        el.textContent = count > 99 ? '99+' : count;
        el.style.display = '';
      } else {
        el.style.display = 'none';
      }
    });
  }

  function initScrollProgress() { const b = document.getElementById('scrollProgress'); if (!b) return; window.addEventListener('scroll', () => { const h = document.documentElement.scrollHeight - window.innerHeight; b.style.transform = h > 0 ? 'scaleX(' + (window.scrollY / h) + ')' : 'scaleX(0)'; }, { passive: true }); }
  function initReveal() { const els = document.querySelectorAll('.reveal'); if (!els.length) return; const obs = new IntersectionObserver(entries => { entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); } }); }, { threshold: 0.12 }); els.forEach(el => obs.observe(el)); }
  function initNavbar() { const n = document.getElementById('navbar'); if (!n) return; window.addEventListener('scroll', () => n.classList.toggle('scrolled', window.scrollY > 40), { passive: true }); }
  function initMobileNav() { const t = document.getElementById('navToggle'), l = document.getElementById('navLinks'); if (!t || !l) return; t.addEventListener('click', () => { const o = l.classList.toggle('open'); t.classList.toggle('active', o); t.setAttribute('aria-expanded', o); document.body.style.overflow = o ? 'hidden' : ''; }); l.querySelectorAll('a').forEach(a => a.addEventListener('click', () => { l.classList.remove('open'); t.classList.remove('active'); document.body.style.overflow = ''; })); }
  function initNewsletter() { const f = document.getElementById('newsletterForm'); if (!f) return; f.addEventListener('submit', e => { e.preventDefault(); alert('Thank you for subscribing!'); f.reset(); }); }
  function initBackToTop() { const b = document.getElementById('backToTop'); if (!b) return; window.addEventListener('scroll', () => b.classList.toggle('visible', window.scrollY > 400), { passive: true }); b.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' })); }
  function initFooterYear() { const e = document.getElementById('year'); if (e) e.textContent = new Date().getFullYear(); }

  // ── Homepage Sections ──
  async function loadHomepageSections() {
    try {
      const data = await api('/api/homepage');
      renderFlashSale(data.flashSale);
      renderProductSection('featuredGrid', data.featured);
      renderProductSection('trendingGrid', data.trending);
      renderProductSection('newArrivalsGrid', data.newArrivals);
      renderProductSection('bestSellersGrid', data.bestSellers);
      renderProductSection('recommendedGrid', data.recommended);
      renderActivePromos(data.activePromos);
    } catch {}
  }

  function renderProductSection(containerId, products) {
    const el = document.getElementById(containerId);
    if (!el || !products || products.length === 0) return;
    el.innerHTML = products.map(p => {
      const discount = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
      return '<div class="card reveal visible" data-id="' + escapeHtml(p._id) + '">' +
        '<div class="card-img-wrapper">' +
          '<img src="' + escapeHtml(p.image || '/images/placeholder.svg') + '" alt="' + escapeHtml(p.name) + '" loading="lazy">' +
          (discount > 0 ? '<span class="card-discount-badge">-' + discount + '%</span>' : '') +
          (p.badge ? '<span class="card-badge badge-' + escapeHtml(p.badge) + '">' + escapeHtml(p.badge) + '</span>' : '') +
        '</div>' +
        '<div class="card-body">' +
          '<h3 class="card-title">' + escapeHtml(p.name) + '</h3>' +
          '<div class="card-rating">' + stars(p.rating) + ' <span>(' + (p.reviews || 0) + ')</span></div>' +
          '<div class="card-price">' +
            '<span class="price">' + formatPrice(p.price) + '</span>' +
            (p.oldPrice ? '<span class="old-price">' + formatPrice(p.oldPrice) + '</span>' : '') +
          '</div>' +
          '<div class="card-btns">' +
            '<button class="btn btn-primary btn-sm card-btn-cart" data-action="add-to-cart" data-product-id="' + escapeHtml(p._id) + '">Add to Cart</button>' +
            '<button class="btn btn-secondary btn-sm card-btn-buy" data-action="buy-now" data-product-id="' + escapeHtml(p._id) + '">Buy Now</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderFlashSale(sale) {
    const el = document.getElementById('flashSaleSection');
    const timerEl = document.getElementById('flashSaleTimer');
    const gridEl = document.getElementById('flashSaleGrid');
    if (!el) return;
    if (!sale) { el.style.display = 'none'; return; }
    el.style.display = '';
    const titleEl = document.getElementById('flashSaleTitle');
    const descEl = document.getElementById('flashSaleDesc');
    if (titleEl) titleEl.textContent = sale.title || 'Flash Sale';
    if (descEl) descEl.textContent = sale.description || '';
    if (gridEl && sale.products) {
      renderProductSection('flashSaleGrid', sale.products);
    }
    if (timerEl && sale.endDate) {
      const end = new Date(sale.endDate).getTime();
      function updateTimer() {
        const now = Date.now();
        const diff = end - now;
        if (diff <= 0) { timerEl.textContent = 'Sale Ended'; return; }
        const d = Math.floor(diff / 86400000);
        const h = Math.floor((diff % 86400000) / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        timerEl.innerHTML = '<span class="timer-unit"><span class="timer-num">' + d + '</span><span class="timer-label">Days</span></span>' +
          '<span class="timer-unit"><span class="timer-num">' + h + '</span><span class="timer-label">Hours</span></span>' +
          '<span class="timer-unit"><span class="timer-num">' + m + '</span><span class="timer-label">Mins</span></span>' +
          '<span class="timer-unit"><span class="timer-num">' + s + '</span><span class="timer-label">Secs</span></span>';
      }
      updateTimer();
      setInterval(updateTimer, 1000);
    }
  }

  function renderActivePromos(promos) {
    const el = document.getElementById('activePromosBanner');
    if (!el || !promos || promos.length === 0) { if (el) el.style.display = 'none'; return; }
    el.style.display = '';
    el.innerHTML = promos.map(p =>
      '<div class="promo-banner-item">' +
        '<strong>' + escapeHtml(p.title) + '</strong> - ' + escapeHtml(p.description || '') +
        (p.couponCode ? ' Use code: <span class="promo-code">' + escapeHtml(p.couponCode) + '</span>' : '') +
      '</div>'
    ).join('');
  }

  function updateAuthUI() {
    const loginLink = document.getElementById('loginLink'), signupLink = document.getElementById('signupLink'), accountLink = document.getElementById('accountLink'), adminLink = document.getElementById('adminLink'), logoutBtn = document.getElementById('logoutBtn'), userName = document.getElementById('userName');
    if (currentUser) { if (loginLink) loginLink.style.display = 'none'; if (signupLink) signupLink.style.display = 'none'; if (accountLink) accountLink.style.display = ''; if (adminLink) adminLink.style.display = currentUser.role === 'admin' ? '' : 'none'; if (logoutBtn) logoutBtn.style.display = ''; if (userName) userName.textContent = currentUser.name.split(' ')[0]; }
    else { if (loginLink) loginLink.style.display = ''; if (signupLink) signupLink.style.display = ''; if (accountLink) accountLink.style.display = 'none'; if (adminLink) adminLink.style.display = 'none'; if (logoutBtn) logoutBtn.style.display = 'none'; if (userName) userName.textContent = 'Account'; }
    if (logoutBtn) logoutBtn.onclick = async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); setAuth(null, null); window.location.href = '/'; };
  }

  function initSearch() {
    const input = document.getElementById('navSearch');
    if (!input) return;
    let debounce;

    function highlightMatch(text, query) {
      if (!query) return escapeHtml(text);
      const terms = query.split(/\s+/).filter(Boolean);
      var result = escapeHtml(text);
      terms.forEach(function(term) {
        var regex = new RegExp('(' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
        result = result.replace(regex, '<mark>$1</mark>');
      });
      return result;
    }

    async function fetchSuggestions(query) {
      var el = document.getElementById('searchSuggestions');
      if (!el) {
        el = document.createElement('div');
        el.id = 'searchSuggestions';
        el.className = 'search-suggestions';
        el.setAttribute('role', 'listbox');
        input.parentElement.style.position = 'relative';
        input.parentElement.appendChild(el);
      }
      if (query.length < 2) { el.style.display = 'none'; return; }
      try {
        var results = await api('/api/products/suggest?q=' + encodeURIComponent(query));
        if (!results.length) { el.innerHTML = '<div class="suggestion-empty">No suggestions found</div>'; el.style.display = ''; return; }
        el.innerHTML = results.map(function(p) {
          var discount = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
          return '<div class="suggestion-item" role="option" data-action="view-product" data-product-slug="' + escapeHtml(p.slug) + '">' +
            '<img src="' + escapeHtml(p.image) + '" alt="" width="40" height="40" loading="lazy" />' +
            '<div class="suggestion-info"><span class="suggestion-name">' + highlightMatch(p.name, query) + '</span>' +
            '<span class="suggestion-meta">' + escapeHtml(p.brand || '') + ' &middot; ' + escapeHtml(p.category || '') + '</span></div>' +
            '<div class="suggestion-right"><span class="suggestion-price">' + formatPrice(p.price) + '</span>' +
            (discount ? '<span class="suggestion-discount">-' + discount + '%</span>' : '') +
            '</div></div>';
        }).join('') + '<div class="suggestion-footer" data-action="submit-search">View all results for \u201c' + escapeHtml(query) + '\u201d &rarr;</div>';
        el.style.display = '';
      } catch (err) { el.style.display = 'none'; }
    }

    input.addEventListener('input', function() {
      clearTimeout(debounce);
      debounce = setTimeout(function() { fetchSuggestions(input.value.trim()); }, 250);
    });

    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { e.preventDefault(); submitSearch(); }
      if (e.key === 'Escape') { var el = document.getElementById('searchSuggestions'); if (el) el.style.display = 'none'; }
    });

    document.addEventListener('click', function(e) {
      var el = document.getElementById('searchSuggestions');
      if (el && !input.parentElement.contains(e.target)) el.style.display = 'none';
    });

    var mobileInput = document.getElementById('navSearchMobile');
    if (mobileInput) {
      mobileInput.addEventListener('input', function() { input.value = mobileInput.value; });
      mobileInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') { input.value = mobileInput.value; submitSearch(); var nl = document.getElementById('navLinks'); if (nl) nl.classList.remove('open'); var nt = document.getElementById('navToggle'); if (nt) { nt.classList.remove('active'); nt.setAttribute('aria-expanded', 'false'); } } });
    }
  }

  function submitSearch() {
    var input = document.getElementById('navSearch');
    var val = input ? input.value.trim() : '';
    var el = document.getElementById('searchSuggestions');
    if (el) el.style.display = 'none';
    if (!val) return;
    searchQuery = val.toLowerCase();
    if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
      filterAndRenderProducts();
      document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
    } else {
      window.location.href = '/?search=' + encodeURIComponent(val);
    }
  }

  // ── Products ──
  async function loadProducts() {
    try {
      const res = await api('/api/products?limit=100');
      products = res.products || res;
      if (res.pagination) window._pagination = res.pagination;
    } catch { products = [...FALLBACK_PRODUCTS]; }
    
    const path = window.location.pathname;
    if (path.startsWith('/category/')) {
      currentCategory = path.split('/category/')[1] || 'all';
      document.querySelectorAll('.category-tabs .tab').forEach(t => t.classList.toggle('active', t.dataset.category === currentCategory));
    }
    filterAndRenderProducts();
    renderBestSellers();
  }

  function filterAndRenderProducts() {
    var f = [...products];
    if (currentCategory !== 'all') f = f.filter(function(p) { return p.category === currentCategory; });
    if (searchQuery) {
      var terms = searchQuery.split(/\s+/).filter(Boolean);
      f = f.filter(function(p) {
        var haystack = (p.name + ' ' + p.description + ' ' + p.brand + ' ' + p.category).toLowerCase();
        return terms.every(function(t) { return haystack.includes(t); });
      });
    }
    if (window._activeFilters) {
      var af = window._activeFilters;
      if (af.brands && af.brands.length) f = f.filter(function(p) { return af.brands.includes(p.brand); });
      if (af.minPrice) f = f.filter(function(p) { return p.price >= af.minPrice; });
      if (af.maxPrice) f = f.filter(function(p) { return p.price <= af.maxPrice; });
      if (af.minRating) f = f.filter(function(p) { return p.rating >= af.minRating; });
      if (af.inStock) f = f.filter(function(p) { return p.stock > 0; });
      if (af.onSale) f = f.filter(function(p) { return p.oldPrice > 0; });
      if (af.newArrivals) f = f.filter(function(p) { return p.badge === 'new'; });
      if (af.bestSellers) f = f.filter(function(p) { return p.bestSeller; });
      if (af.featured) f = f.filter(function(p) { return p.featured; });
    }
    sortProducts(f);
    window._filteredProducts = f;
    window._visibleCount = window._visibleCount || 12;
    renderProducts(f.slice(0, window._visibleCount), 'productGrid');
    renderPagination(f.length);
    updateActiveFilterCount();
  }

  function sortProducts(arr) {
    switch (currentSort) {
      case 'price-low': arr.sort(function(a, b) { return a.price - b.price; }); break;
      case 'price-high': arr.sort(function(a, b) { return b.price - a.price; }); break;
      case 'popularity': arr.sort(function(a, b) { return b.reviews - a.reviews; }); break;
      case 'rating': arr.sort(function(a, b) { return b.rating - a.rating; }); break;
      case 'best-selling': arr.sort(function(a, b) { return (b.bestSeller ? 1 : 0) - (a.bestSeller ? 1 : 0) || b.reviews - a.reviews; }); break;
      case 'featured': arr.sort(function(a, b) { return (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || b.rating - a.rating; }); break;
      case 'name-az': arr.sort(function(a, b) { return a.name.localeCompare(b.name); }); break;
      case 'name-za': arr.sort(function(a, b) { return b.name.localeCompare(a.name); }); break;
      default: arr.sort(function(a, b) { return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); });
    }
  }

  function renderProducts(list, containerId) {
    var c = document.getElementById(containerId);
    if (!c) return;
    if (!list.length) { c.innerHTML = '<div class="no-products"><div class="no-products-icon">&#128270;</div><h3>No products found</h3><p>Try adjusting your filters or search terms.</p></div>'; return; }
    c.innerHTML = list.map(function(p) {
      var s = stockStatus(p.stock);
      var badge = p.badge ? '<span class="card-badge badge-' + escapeHtml(p.badge) + '">' + escapeHtml(p.badge === 'bestseller' ? 'Best Seller' : p.badge) + '</span>' : '';
      var oldPrice = p.oldPrice ? '<span class="card-old-price">' + formatPrice(p.oldPrice) + '</span>' : '';
      var discount = p.oldPrice ? '<span class="card-discount">-' + Math.round((1 - p.price / p.oldPrice) * 100) + '%</span>' : '';
      var slug = escapeHtml(p.slug || p._id);
      var pid = escapeHtml(p._id);
      return '<article class="card" data-id="' + pid + '" role="listitem">' + badge +
        '<div class="card-actions">' +
        '<button class="card-action-btn" title="Add to Wishlist" data-action="toggle-wishlist" data-product-id="' + pid + '"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button>' +
        '<button class="card-action-btn" title="Quick View" data-action="quick-view" data-product-id="' + pid + '"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button>' +
        '<button class="card-action-btn" title="Compare" data-action="toggle-compare" data-product-id="' + pid + '"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg></button>' +
        '</div>' +
        '<div class="card-img-wrapper"><img src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.name) + '" width="600" height="400" loading="lazy" decoding="async" />' +
        discount +
        '<div class="card-overlay"><button class="overlay-buy" data-action="buy-now" data-product-id="' + pid + '">Buy Now</button>' +
        '<button class="overlay-cart" data-action="add-to-cart" data-product-id="' + pid + '">Add to Cart</button>' +
        '<button class="overlay-view" data-action="view-product" data-product-slug="' + slug + '">View Details</button></div></div>' +
        '<div class="card-rating"><span class="stars">' + stars(p.rating) + '</span><span class="count">(' + p.reviews + ')</span></div>' +
        '<h3>' + escapeHtml(p.name) + '</h3><p class="card-desc">' + escapeHtml(p.description) + '</p>' +
        '<span class="card-stock ' + s.class + '">' + s.text + '</span>' +
        '<div class="card-bottom"><span class="card-price">' + formatPrice(p.price) + oldPrice + '</span>' +
        '<div class="card-btns"><button class="card-btn-details" data-action="view-product" data-product-slug="' + slug + '" title="View Details">Details &#8594;</button>' +
        '<button class="card-btn-cart" data-action="add-to-cart" data-product-id="' + pid + '" title="Add to Cart"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg></button>' +
        '<button class="card-btn-buy" data-action="buy-now" data-product-id="' + pid + '">Buy Now</button></div></div></article>';
    }).join('');
    initCardReveal();
  }

  var _cardObserver = null;
  function initCardReveal() {
    if (!_cardObserver) {
      _cardObserver = new IntersectionObserver(function(entries) {
        entries.forEach(function(entry) {
          if (entry.isIntersecting) { entry.target.classList.add('card-reveal'); _cardObserver.unobserve(entry.target); }
        });
      }, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });
    }
    document.querySelectorAll('.card:not(.card-reveal)').forEach(function(c) { _cardObserver.observe(c); });
  }

  function renderBestSellers() {
    const best = products.filter(function(p) { return p.bestSeller; }).slice(0, 4);
    renderProducts(best, 'bestSellersGrid');
    renderProducts(best, 'bestSellersGridAlt');
  }
  function initCategoryTabs() { document.querySelectorAll('.category-tabs .tab').forEach(function(t) { t.addEventListener('click', function() { document.querySelectorAll('.category-tabs .tab').forEach(function(x) { x.classList.remove('active'); }); t.classList.add('active'); currentCategory = t.dataset.category; window._visibleCount = 12; filterAndRenderProducts(); }); }); }
  function initSort() { var s = document.getElementById('sortSelect'); if (s) s.addEventListener('change', function() { currentSort = s.value; filterAndRenderProducts(); }); }
  function initCategoryCards() { document.querySelectorAll('.category-card[data-filter]').forEach(function(c) { c.addEventListener('click', function(e) { e.preventDefault(); currentCategory = c.dataset.filter; document.querySelectorAll('.category-tabs .tab').forEach(function(t) { t.classList.toggle('active', t.dataset.category === currentCategory); }); window._visibleCount = 12; filterAndRenderProducts(); document.getElementById('products').scrollIntoView({ behavior: 'smooth' }); }); }); }

  // ── Filter Sidebar ──
  function initFilters() {
    window._activeFilters = {};
    var filterToggle = document.getElementById('filterToggle');
    var filterSidebar = document.getElementById('filterSidebar');
    var filterClose = document.getElementById('filterClose');
    var filterOverlay = document.getElementById('filterOverlay');
    var clearFilters = document.getElementById('clearFilters');

    if (filterToggle) filterToggle.addEventListener('click', function() {
      filterSidebar.classList.toggle('open');
      filterOverlay.classList.toggle('open');
      document.body.style.overflow = filterSidebar.classList.contains('open') ? 'hidden' : '';
    });
    if (filterClose) filterClose.addEventListener('click', closeFilters);
    if (filterOverlay) filterOverlay.addEventListener('click', closeFilters);
    if (clearFilters) clearFilters.addEventListener('click', function() {
      window._activeFilters = {};
      document.querySelectorAll('.filter-checkbox').forEach(function(cb) { cb.checked = false; });
      document.querySelectorAll('.filter-radio').forEach(function(rb) { rb.checked = false; });
      var minP = document.getElementById('filterMinPrice');
      var maxP = document.getElementById('filterMaxPrice');
      if (minP) minP.value = '';
      if (maxP) maxP.value = '';
      window._visibleCount = 12;
      filterAndRenderProducts();
    });

    document.querySelectorAll('.filter-checkbox, .filter-radio').forEach(function(el) {
      el.addEventListener('change', applyFilters);
    });

    var priceApply = document.getElementById('filterPriceApply');
    if (priceApply) priceApply.addEventListener('click', applyFilters);

    loadBrandFilters();
  }

  function closeFilters() {
    document.getElementById('filterSidebar')?.classList.remove('open');
    document.getElementById('filterOverlay')?.classList.remove('open');
    document.body.style.overflow = '';
  }

  function applyFilters() {
    var af = {};
    var brandChecks = document.querySelectorAll('.filter-brand:checked');
    if (brandChecks.length) af.brands = Array.from(brandChecks).map(function(cb) { return cb.value; });
    var minP = document.getElementById('filterMinPrice');
    var maxP = document.getElementById('filterMaxPrice');
    if (minP && minP.value) af.minPrice = Number(minP.value);
    if (maxP && maxP.value) af.maxPrice = Number(maxP.value);
    var ratingCheck = document.querySelector('.filter-rating:checked');
    if (ratingCheck) af.minRating = Number(ratingCheck.value);
    if (document.getElementById('filterInStock')) af.inStock = document.getElementById('filterInStock').checked;
    if (document.getElementById('filterOnSale')) af.onSale = document.getElementById('filterOnSale').checked;
    if (document.getElementById('filterNewArrivals')) af.newArrivals = document.getElementById('filterNewArrivals').checked;
    if (document.getElementById('filterBestSellers')) af.bestSellers = document.getElementById('filterBestSellers').checked;
    if (document.getElementById('filterFeatured')) af.featured = document.getElementById('filterFeatured').checked;
    window._activeFilters = af;
    window._visibleCount = 12;
    filterAndRenderProducts();
  }

  function loadBrandFilters() {
    var brandContainer = document.getElementById('brandFilters');
    if (!brandContainer) return;
    var uniqueBrands = [...new Set(products.map(function(p) { return p.brand; }).filter(Boolean))].sort();
    brandContainer.innerHTML = uniqueBrands.map(function(b) {
      return '<label class="filter-option"><input type="checkbox" class="filter-checkbox filter-brand" value="' + escapeHtml(b) + '" /><span>' + escapeHtml(b) + '</span></label>';
    }).join('');
    brandContainer.querySelectorAll('.filter-checkbox').forEach(function(cb) {
      cb.addEventListener('change', applyFilters);
    });
  }
  function renderPagination(totalFiltered) {
    var container = document.getElementById('pagination');
    if (!container) return;
    var perPage = window._visibleCount || 12;
    var totalPages = Math.ceil(totalFiltered / perPage);
    if (totalFiltered <= 12) { container.innerHTML = ''; return; }
    var html = '<button class="page-btn load-more-btn" data-action="load-more">Load More</button>';
    for (var i = 1; i <= totalPages; i++) {
      html += '<button class="page-btn' + (i === 1 ? ' active' : '') + '" data-action="go-to-page" data-page="' + i + '">' + i + '</button>';
    }
    container.innerHTML = html;
  }

  function loadMore() {
    window._visibleCount = (window._visibleCount || 12) + 12;
    var filtered = window._filteredProducts || products;
    renderProducts(filtered.slice(0, window._visibleCount), 'productGrid');
    renderPagination(filtered.length);
  }

  function goToPage(page) {
    window._visibleCount = page * 12;
    var filtered = window._filteredProducts || products;
    renderProducts(filtered.slice(0, window._visibleCount), 'productGrid');
    renderPagination(filtered.length);
    document.getElementById('products').scrollIntoView({ behavior: 'smooth' });
  }

  // ── Quick View Modal ──
  function quickView(productId) {
    var p = products.find(function(x) { return x._id === productId; });
    if (!p) return;
    var s = stockStatus(p.stock);
    var discount = p.oldPrice ? Math.round((1 - p.price / p.oldPrice) * 100) : 0;
    var o = document.getElementById('modalOverlay');
    var m = document.getElementById('productModal');
    var b = document.getElementById('modalBody');
    if (!b) return;
    var colorsHtml = '';
    if (p.colors && p.colors.length) {
      colorsHtml = '<div class="qv-colors"><span>Colors: </span>' + p.colors.map(function(c) { return '<span class="qv-color-dot" style="background:' + escapeHtml(c.hex) + '" title="' + escapeHtml(c.name) + '"></span>'; }).join('') + '</div>';
    }
    b.innerHTML = '<div class="quick-view">' +
      '<div class="qv-img"><img src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.name) + '" width="300" height="300" loading="lazy" decoding="async" /></div>' +
      '<div class="qv-info"><span class="qv-category">' + escapeHtml(p.category) + '</span><h2>' + escapeHtml(p.name) + '</h2>' +
      '<div class="card-rating"><span class="stars">' + stars(p.rating) + '</span><span class="count">(' + p.reviews + ' reviews)</span></div>' +
      '<div class="qv-price">' + formatPrice(p.price) + (p.oldPrice ? '<span class="card-old-price">' + formatPrice(p.oldPrice) + '</span><span class="card-discount">-' + discount + '%</span>' : '') + '</div>' +
      '<span class="card-stock ' + s.class + '">' + s.text + '</span>' +
      '<p class="qv-desc">' + escapeHtml(p.description) + '</p>' +
      colorsHtml +
      '<div class="qv-actions"><button class="btn btn-primary" data-action="buy-now" data-product-id="' + escapeHtml(p._id) + '">Buy Now</button>' +
      '<button class="btn btn-secondary" data-action="add-to-cart-close" data-product-id="' + escapeHtml(p._id) + '">Add to Cart</button>' +
      '<a class="btn btn-secondary" href="/product/' + escapeHtml(p.slug) + '">View Full Details</a></div></div></div>';
    o.classList.add('open');
    m.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  // ── Compare ──
  window._compareList = [];
  function toggleCompare(productId, btn) {
    var idx = window._compareList.indexOf(productId);
    if (idx > -1) {
      window._compareList.splice(idx, 1);
      if (btn) btn.classList.remove('wishlisted');
    } else {
      if (window._compareList.length >= 4) { showToast('You can compare up to 4 products'); return; }
      window._compareList.push(productId);
      if (btn) btn.classList.add('wishlisted');
    }
    updateCompareBar();
  }

  function updateCompareBar() {
    var bar = document.getElementById('compareBar');
    if (!bar) return;
    if (window._compareList.length < 2) { bar.style.display = 'none'; return; }
    bar.style.display = '';
    var items = window._compareList.map(function(id) {
      var p = products.find(function(x) { return x._id === id; });
      return p ? '<div class="compare-item"><img src="' + escapeHtml(p.image) + '" alt="" width="40" height="40" /><span>' + escapeHtml(p.name) + '</span><button data-action="toggle-compare" data-product-id="' + escapeHtml(p._id) + '">&times;</button></div>' : '';
    }).join('');
    bar.innerHTML = '<div class="compare-items">' + items + '</div><div class="compare-actions"><button class="btn btn-primary btn-sm" data-action="show-compare">Compare (' + window._compareList.length + ')</button><button class="btn btn-secondary btn-sm" data-action="clear-compare">Clear</button></div>';
  }

  function showCompare() {
    if (window._compareList.length < 2) return;
    var compareProducts = window._compareList.map(function(id) { return products.find(function(x) { return x._id === id; }); }).filter(Boolean);
    var specRows = [
      { label: 'Price', key: 'price', format: function(p) { return formatPrice(p.price) + (p.oldPrice ? ' <span class="card-old-price">' + formatPrice(p.oldPrice) + '</span>' : ''); } },
      { label: 'Brand', key: 'brand' },
      { label: 'Category', key: 'category' },
      { label: 'Rating', key: 'rating', format: function(p) { return stars(p.rating) + ' (' + p.rating + '/5, ' + p.reviews + ' reviews)'; } },
      { label: 'In Stock', key: 'stock', format: function(p) { return p.stock > 0 ? '<span style="color:#2e7d32">Yes (' + p.stock + ')</span>' : '<span style="color:#c62828">Out of Stock</span>'; } }
    ];
    var specFields = ['Display', 'Processor', 'Chip', 'RAM', 'Memory', 'Storage', 'Camera', 'Battery', 'Graphics', 'Resolution', 'Water', 'Type', 'ANC', 'Codec', 'CPU', 'GPU', 'Power', 'Operating System', 'OS'];
    var addedFields = {};
    specFields.forEach(function(field) {
      compareProducts.forEach(function(p) {
        var specs = p.specifications || {};
        if (specs[field] && !addedFields[field]) {
          addedFields[field] = true;
          specRows.push({ label: field, key: 'spec_' + field, format: function(p) { return (p.specifications || {})[field] || '-'; } });
        }
      });
    });
    specRows.push({ label: 'Warranty', key: 'warranty', format: function(p) { return p.warranty || '-'; } });

    var html = '<div class="compare-table-wrapper"><table class="compare-table"><thead><tr><th>Feature</th>';
    compareProducts.forEach(function(p) { html += '<th><img src="' + escapeHtml(p.image) + '" alt="" width="80" height="80" style="border-radius:10px;object-fit:cover" /><br><strong>' + escapeHtml(p.name) + '</strong></th>'; });
    html += '</tr></thead><tbody>';
    specRows.forEach(function(row) {
      html += '<tr><td><strong>' + row.label + '</strong></td>';
      compareProducts.forEach(function(p) {
        var val = row.format ? row.format(p) : (p[row.key] || '-');
        html += '<td>' + val + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    html += '<div style="text-align:center;margin-top:1rem"><a href="/compare?ids=' + window._compareList.join(',') + '" class="btn btn-secondary btn-sm">Open Full Comparison Page</a></div>';
    var o = document.getElementById('modalOverlay');
    var m = document.getElementById('productModal');
    var b = document.getElementById('modalBody');
    if (!b) return;
    b.innerHTML = '<h2 style="margin-bottom:1rem">Product Comparison</h2>' + html;
    o.classList.add('open');
    m.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  // ── Active Filter Count ──
  function updateActiveFilterCount() {
    var countEl = document.getElementById('activeFilterCount');
    if (!countEl) return;
    var count = 0;
    if (window._activeFilters) {
      var af = window._activeFilters;
      if (af.brands && af.brands.length) count += af.brands.length;
      if (af.minPrice) count++;
      if (af.maxPrice) count++;
      if (af.minRating) count++;
      if (af.inStock) count++;
      if (af.onSale) count++;
      if (af.newArrivals) count++;
      if (af.bestSellers) count++;
      if (af.featured) count++;
    }
    countEl.textContent = count || '';
    countEl.style.display = count ? '' : 'none';
  }

  // ── Cart ──
  function initCart() {
    const btn = document.getElementById('cartButton'), close = document.getElementById('cartClose'), overlay = document.getElementById('cartOverlay'), checkoutBtn = document.getElementById('checkoutBtn');
    if (btn) btn.addEventListener('click', openCart);
    if (close) close.addEventListener('click', closeCart);
    if (overlay) overlay.addEventListener('click', closeCart);
    if (checkoutBtn) checkoutBtn.addEventListener('click', () => { closeCart(); window.location.href = '/checkout'; });
    updateCartUI();
  }

  function openCart() { document.getElementById('cartSidebar')?.classList.add('open'); document.getElementById('cartOverlay')?.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeCart() { document.getElementById('cartSidebar')?.classList.remove('open'); document.getElementById('cartOverlay')?.classList.remove('open'); document.body.style.overflow = ''; }
  function addToCart(productId, qty = 1) { const p = products.find(x => x._id === productId); if (!p) return; const ex = cart.find(i => i._id === productId); if (ex) ex.quantity += qty; else cart.push({ _id: p._id, name: p.name, price: p.price, image: p.image, quantity: qty }); saveCart(); openCart(); const c = document.getElementById('cartCount'); if (c) { c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); } }
  function removeFromCart(id) { cart = cart.filter(i => i._id !== id); saveCart(); }
  function updateCartQty(id, d) { const i = cart.find(x => x._id === id); if (!i) return; i.quantity += d; if (i.quantity <= 0) return removeFromCart(id); saveCart(); }
  function getCartTotal() { return cart.reduce((s, i) => s + i.price * i.quantity, 0); }

  function updateCartUI() {
    const countEl = document.getElementById('cartCount'), itemsEl = document.getElementById('cartItems'), subEl = document.getElementById('cartSubtotal'), delEl = document.getElementById('cartDelivery'), totEl = document.getElementById('cartTotal');
    if (countEl) countEl.textContent = cart.reduce((s, i) => s + i.quantity, 0);
    if (itemsEl) {
      if (!cart.length) itemsEl.innerHTML = '<p class="cart-empty">Your cart is empty</p>';
      else itemsEl.innerHTML = cart.map(i => '<div class="cart-item"><img src="' + escapeHtml(i.image) + '" alt="' + escapeHtml(i.name) + '" width="56" height="56" /><div class="cart-item-info"><div class="cart-item-name">' + escapeHtml(i.name) + '</div><div class="cart-item-price">' + formatPrice(i.price) + '</div></div><div class="cart-item-qty"><button class="qty-btn" data-action="cart-qty-minus" data-product-id="' + escapeHtml(i._id) + '">-</button><span class="qty-value">' + i.quantity + '</span><button class="qty-btn" data-action="cart-qty-plus" data-product-id="' + escapeHtml(i._id) + '">+</button></div><button class="cart-item-remove" data-action="remove-from-cart" data-product-id="' + escapeHtml(i._id) + '"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button></div>').join('');
    }
    const sub = getCartTotal(), del = sub >= FREE_DELIVERY_THRESHOLD ? 0 : (cart.length ? DELIVERY_FEE : 0);
    if (subEl) subEl.textContent = formatPrice(sub);
    if (delEl) delEl.textContent = del === 0 ? 'FREE' : formatPrice(del);
    if (totEl) totEl.textContent = formatPrice(sub + del);
  }

  // ── Product Modal ──
  function initProductModal() { const o = document.getElementById('modalOverlay'), m = document.getElementById('productModal'), c = document.getElementById('modalClose'); if (o) o.addEventListener('click', closeModal); if (c) c.addEventListener('click', closeModal); }
  function openModal(p) { const o = document.getElementById('modalOverlay'), m = document.getElementById('productModal'), b = document.getElementById('modalBody'); if (!b) return; b.innerHTML = '<img src="' + escapeHtml(p.image) + '" alt="' + escapeHtml(p.name) + '" width="400" height="300" loading="lazy" decoding="async" /><h2>' + escapeHtml(p.name) + '</h2><div class="card-rating"><span class="stars">' + stars(p.rating) + '</span><span class="count">(' + p.reviews + ' reviews)</span></div><div class="modal-price">' + formatPrice(p.price) + '</div><p>' + escapeHtml(p.description) + '</p><div class="modal-actions"><button class="btn btn-primary" data-action="buy-now" data-product-id="' + escapeHtml(p._id) + '">Buy Now</button><button class="btn btn-secondary" data-action="add-to-cart-close" data-product-id="' + escapeHtml(p._id) + '">Add to Cart</button></div>'; o?.classList.add('open'); m?.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeModal() { document.getElementById('modalOverlay')?.classList.remove('open'); document.getElementById('productModal')?.classList.remove('open'); document.body.style.overflow = ''; }
  function viewProduct(slug) { window.location.href = '/product/' + slug; }
  function buyNow(id) { addToCart(id, 1); closeCart(); window.location.href = '/checkout'; }

  // ── Auth Pages ──
  function showError(el, msg) { if (!el) return; el.textContent = msg; el.classList.add('show'); }
  function showSuccess(el, msg) { if (!el) return; el.textContent = msg; el.classList.add('show'); }

  function initLoginPage() { const f = document.getElementById('loginForm'), e = document.getElementById('loginError'); if (!f) return; f.addEventListener('submit', async ev => { ev.preventDefault(); const email = f.querySelector('[name="email"]').value.trim(), pw = f.querySelector('[name="password"]').value; if (!email || !pw) return showError(e, 'Please fill in all fields'); try { const d = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password: pw }) }); setAuth(d.user, d.token); window.location.href = d.user.role === 'admin' ? '/admin' : '/account'; } catch (err) { showError(e, err.message); } }); }

  function initSignupPage() { const f = document.getElementById('signupForm'), e = document.getElementById('signupError'); if (!f) return; f.addEventListener('submit', async ev => { ev.preventDefault(); const name = f.querySelector('[name="name"]').value.trim(), email = f.querySelector('[name="email"]').value.trim(), phone = f.querySelector('[name="phone"]').value.trim(), pw = f.querySelector('[name="password"]').value, cpw = f.querySelector('[name="confirmPassword"]')?.value; if (!name || !email || !pw) return showError(e, 'Please fill in all required fields'); if (pw.length < 6) return showError(e, 'Password must be at least 6 characters'); if (cpw && pw !== cpw) return showError(e, 'Passwords do not match'); try { const d = await api('/api/auth/signup', { method: 'POST', body: JSON.stringify({ name, email, phone, password: pw }) }); setAuth(d.user, d.token); window.location.href = '/account'; } catch (err) { showError(e, err.message); } }); }

  function initForgotPasswordPage() { const f = document.getElementById('forgotForm'), e = document.getElementById('forgotError'), s = document.getElementById('forgotSuccess'); if (!f) return; f.addEventListener('submit', async ev => { ev.preventDefault(); const email = f.querySelector('[name="email"]').value.trim(); if (!email) return showError(e, 'Please enter your email'); try { await api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }); showSuccess(s, 'Password reset link sent to your email.'); e?.classList.remove('show'); } catch (err) { showError(e, err.message); } }); }

  // (Account page init moved to new initAccountPage below)

  // ── Checkout ──
  let checkoutStep = 1;
  let checkoutOrderData = null;

  function initCheckoutPage() {
    const emptyEl = document.getElementById('checkoutEmpty');
    const layoutEl = document.getElementById('checkoutLayout');
    if (!cart.length) {
      if (emptyEl) emptyEl.style.display = '';
      if (layoutEl) layoutEl.style.display = 'none';
      return;
    }
    if (emptyEl) emptyEl.style.display = 'none';
    if (layoutEl) layoutEl.style.display = '';

    checkoutStep = 1;
    renderCheckoutSummary();
    initPaymentMethodSelection();
    updateCheckoutStep();
    prefillCheckoutForm();

    const form = document.getElementById('checkoutForm'), err = document.getElementById('checkoutError');
    const backBtn = document.getElementById('checkoutBackBtn');
    const submitBtn = document.getElementById('placeOrderBtn');

    if (backBtn) backBtn.addEventListener('click', () => { checkoutStep--; updateCheckoutStep(); });

    if (!form) return;
    form.addEventListener('submit', async ev => {
      ev.preventDefault();
      if (checkoutStep === 1) {
        const customer_name = form.querySelector('[name="name"]').value.trim();
        const customer_email = form.querySelector('[name="email"]').value.trim();
        const customer_phone = form.querySelector('[name="phone"]').value.trim();
        const delivery_address = form.querySelector('[name="address"]').value.trim();
        const delivery_state = form.querySelector('[name="state"]').value;
        const delivery_city = form.querySelector('[name="city"]').value.trim();
        if (!customer_name || !customer_email || !customer_phone || !delivery_address || !delivery_state || !delivery_city) return showError(err, 'Please fill in all required fields');
        checkoutStep = 2;
        updateCheckoutStep();
        return;
      }
      if (checkoutStep === 2) {
        checkoutStep = 3;
        updateCheckoutStep();
        renderReviewSection();
        submitBtn.textContent = 'Place Order & Pay';
        return;
      }
      // Step 3: Place order
      await placeOrder();
    });
  }

  function updateCheckoutStep() {
    const s1 = document.getElementById('step1Section');
    const s2 = document.getElementById('step2Section');
    const s3 = document.getElementById('step3Section');
    const backBtn = document.getElementById('checkoutBackBtn');
    const submitBtn = document.getElementById('placeOrderBtn');
    const err = document.getElementById('checkoutError');
    if (err) { err.textContent = ''; err.classList.remove('show'); }

    document.querySelectorAll('.checkout-step').forEach(el => {
      const step = parseInt(el.dataset.step);
      el.classList.toggle('active', step === checkoutStep);
      el.classList.toggle('completed', step < checkoutStep);
    });

    if (s1) s1.style.display = checkoutStep === 1 ? '' : 'none';
    if (s2) s2.style.display = checkoutStep === 2 ? '' : 'none';
    if (s3) s3.style.display = checkoutStep === 3 ? '' : 'none';
    if (backBtn) backBtn.style.display = checkoutStep > 1 ? '' : 'none';
    if (submitBtn) {
      if (checkoutStep === 1) submitBtn.textContent = 'Continue to Payment';
      else if (checkoutStep === 2) submitBtn.textContent = 'Review Order';
      else submitBtn.textContent = 'Place Order & Pay';
    }
  }

  function renderReviewSection() {
    const form = document.getElementById('checkoutForm');
    const reviewDelivery = document.getElementById('reviewDelivery');
    const reviewItems = document.getElementById('reviewItems');
    const reviewPayment = document.getElementById('reviewPayment');

    if (reviewDelivery) {
      const name = form.querySelector('[name="name"]').value.trim();
      const email = form.querySelector('[name="email"]').value.trim();
      const phone = form.querySelector('[name="phone"]').value.trim();
      const address = form.querySelector('[name="address"]').value.trim();
      const state = form.querySelector('[name="state"]').value;
      const city = form.querySelector('[name="city"]').value.trim();
      reviewDelivery.innerHTML =
        '<div class="review-detail"><span>Name:</span><strong>' + escapeHtml(name) + '</strong></div>' +
        '<div class="review-detail"><span>Email:</span><strong>' + escapeHtml(email) + '</strong></div>' +
        '<div class="review-detail"><span>Phone:</span><strong>' + escapeHtml(phone) + '</strong></div>' +
        '<div class="review-detail"><span>Address:</span><strong>' + escapeHtml(address + ', ' + city + ', ' + state) + '</strong></div>';
    }

    if (reviewItems) {
      reviewItems.innerHTML = cart.map(i =>
        '<div class="review-detail"><span>' + escapeHtml(i.name) + ' x' + i.quantity + '</span><strong>' + formatPrice(i.price * i.quantity) + '</strong></div>'
      ).join('');
    }

    const paymentMethod = document.querySelector('input[name="payment_method"]:checked')?.value || 'paystack_card';
    const paymentLabels = {
      'paystack_card': 'Card Payment (Paystack)',
      'flutterwave_card': 'Card Payment (Flutterwave)',
      'paystack_bank': 'Bank Transfer (Paystack)',
      'paystack_ussd': 'USSD Payment',
      'flutterwave_bank': 'Bank Transfer (Flutterwave)',
      'bank_transfer': 'Manual Bank Transfer',
      'cod': 'Cash on Delivery'
    };
    if (reviewPayment) {
      reviewPayment.innerHTML =
        '<div class="review-detail"><span>Method:</span><strong>' + (paymentLabels[paymentMethod] || paymentMethod) + '</strong></div>' +
        '<div class="review-detail"><span>Subtotal:</span><strong>' + formatPrice(getCartTotal()) + '</strong></div>' +
        '<div class="review-detail"><span>Delivery:</span><strong>' + (getCartTotal() >= FREE_DELIVERY_THRESHOLD ? 'FREE' : formatPrice(DELIVERY_FEE)) + '</strong></div>' +
        '<div class="review-detail total"><span>Total:</span><strong>' + formatPrice(getCartTotal() + (getCartTotal() >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE)) + '</strong></div>';
    }
  }

  function prefillCheckoutForm() {
    if (!currentUser) return;
    const form = document.getElementById('checkoutForm');
    if (!form) return;
    const nameEl = form.querySelector('[name="name"]');
    const emailEl = form.querySelector('[name="email"]');
    const phoneEl = form.querySelector('[name="phone"]');
    const addressEl = form.querySelector('[name="address"]');
    const stateEl = form.querySelector('[name="state"]');
    const cityEl = form.querySelector('[name="city"]');
    if (nameEl && !nameEl.value) nameEl.value = currentUser.name || '';
    if (emailEl && !emailEl.value) emailEl.value = currentUser.email || '';
    if (phoneEl && !phoneEl.value) phoneEl.value = currentUser.phone || '';
    if (addressEl && !addressEl.value) addressEl.value = currentUser.address || '';
    if (stateEl && !stateEl.value && currentUser.state) stateEl.value = currentUser.state;
    if (cityEl && !cityEl.value && currentUser.city) cityEl.value = currentUser.city;
  }

  async function placeOrder() {
    const form = document.getElementById('checkoutForm');
    const err = document.getElementById('checkoutError');
    const loading = document.getElementById('checkoutLoading');
    const loadingMsg = document.getElementById('loadingMessage');

    const customer_name = form.querySelector('[name="name"]').value.trim();
    const customer_email = form.querySelector('[name="email"]').value.trim();
    const customer_phone = form.querySelector('[name="phone"]').value.trim();
    const delivery_address = form.querySelector('[name="address"]').value.trim();
    const delivery_state = form.querySelector('[name="state"]').value;
    const delivery_city = form.querySelector('[name="city"]').value.trim();
    const payment_method = form.querySelector('input[name="payment_method"]:checked')?.value || 'paystack_card';
    const notes = form.querySelector('[name="notes"]')?.value.trim() || '';

    if (!customer_name || !customer_email || !customer_phone || !delivery_address || !delivery_state || !delivery_city) {
      return showError(err, 'Please fill in all required fields');
    }

    const items = cart.map(i => ({ product_id: i._id, quantity: i.quantity }));

    if (loading) loading.style.display = '';
    if (loadingMsg) loadingMsg.textContent = 'Creating your order...';

    try {
      const order = await api('/api/orders', {
        method: 'POST',
        body: JSON.stringify({ customer_name, customer_email, customer_phone, delivery_address, delivery_state, delivery_city, items, payment_method, notes, coupon_code: _appliedCoupon?.code || '', discount: _appliedCoupon ? (_appliedCoupon.type === 'percentage' ? Math.min(getCartTotal() * (_appliedCoupon.value / 100), _appliedCoupon.maxDiscount || Infinity) : (_appliedCoupon.type === 'fixed' ? _appliedCoupon.value : 0)) : 0 })
      });

      checkoutOrderData = order;

      if (payment_method === 'cod' || payment_method === 'bank_transfer') {
        if (loadingMsg) loadingMsg.textContent = 'Order placed successfully!';
        localStorage.setItem('dg_lastOrder', JSON.stringify(order));
        cart = []; saveCart();
        setTimeout(() => { window.location.href = '/confirmation?order=' + order.orderNumber; }, 800);
      } else if (payment_method.startsWith('paystack')) {
        if (loadingMsg) loadingMsg.textContent = 'Redirecting to Paystack...';
        initPaystackPayment(order, payment_method, customer_email);
      } else if (payment_method.startsWith('flutterwave')) {
        if (loadingMsg) loadingMsg.textContent = 'Redirecting to Flutterwave...';
        initFlutterwavePayment(order, payment_method, customer_email, customer_name, customer_phone);
      } else {
        localStorage.setItem('dg_lastOrder', JSON.stringify(order));
        cart = []; saveCart();
        window.location.href = '/confirmation?order=' + order.orderNumber;
      }
    } catch (e) {
      if (loading) loading.style.display = 'none';
      showError(err, e.message);
    }
  }

  async function initPaystackPayment(order, method, email) {
    if (typeof PaystackPop === 'undefined') {
      alert('Paystack payment gateway failed to load. Please refresh the page or try again later.');
      return;
    }
    // Fetch public key from server (never hardcoded)
    let paystackKey;
    try {
      const configRes = await fetch('/api/config/paystack');
      const configData = await configRes.json();
      paystackKey = configData.publicKey;
      if (!paystackKey || paystackKey.startsWith('pk_test_xxx')) {
        alert('Paystack is not configured. Please contact support.');
        return;
      }
    } catch {
      alert('Failed to load payment configuration. Please try again.');
      return;
    }
    const handler = PaystackPop.setup({
      key: paystackKey,
      email: email,
      amount: order.total * 100,
      currency: 'NGN',
      ref: order.orderNumber,
      metadata: { custom_fields: [{ display_name: 'Payment Method', variable_name: 'payment_method', value: method }] },
      callback: response => confirmPayment(order, 'paystack', response.reference),
      onClose: () => {
        const loading = document.getElementById('checkoutLoading');
        if (loading) loading.style.display = 'none';
        alert('Payment cancelled. Your order has been saved but payment is incomplete. You can retry from your order history.');
      }
    });
    handler.openIframe();
  }

  async function initFlutterwavePayment(order, method, email, name, phone) {
    if (typeof FlutterwaveCheckout === 'undefined') {
      alert('Flutterwave payment gateway failed to load. Please refresh the page or try again later.');
      return;
    }
    let flutterwaveKey = '';
    try {
      const configRes = await fetch('/api/config/paystack');
      const configData = await configRes.json();
      flutterwaveKey = configData.flutterwavePublicKey || '';
    } catch (e) { /* ignore */ }
    if (!flutterwaveKey) {
      alert('Flutterwave payment is not configured. Please try Paystack instead.');
      return;
    }
    FlutterwaveCheckout({
      public_key: flutterwaveKey,
      tx_ref: order.orderNumber,
      amount: order.total,
      currency: 'NGN',
      customer: { email, name, phone_number: phone },
      callback: response => confirmPayment(order, 'flutterwave', response.transaction_id),
      onclose: () => {
        const loading = document.getElementById('checkoutLoading');
        if (loading) loading.style.display = 'none';
        alert('Payment cancelled. Your order has been saved but payment is incomplete. You can retry from your order history.');
      }
    });
  }

  async function confirmPayment(order, gateway, ref) {
    const loading = document.getElementById('checkoutLoading');
    const loadingMsg = document.getElementById('loadingMessage');
    if (loading) loading.style.display = 'flex';
    if (loadingMsg) loadingMsg.textContent = 'Verifying payment with Paystack...';

    try {
      if (gateway === 'paystack') {
        // Server-side verification via Paystack API
        const verifyRes = await fetch('/api/paystack/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reference: ref, orderNumber: order.orderNumber })
        });
        const verifyData = await verifyRes.json();

        if (verifyData.success) {
          localStorage.setItem('dg_lastOrder', JSON.stringify(order));
          cart = []; saveCart();
          window.location.href = '/confirmation?order=' + order.orderNumber + '&status=success';
        } else {
          window.location.href = '/confirmation?order=' + order.orderNumber + '&status=failed&reason=' + encodeURIComponent(verifyData.message || 'Payment verification failed');
        }
      } else {
        // Flutterwave - use existing PATCH endpoint
        await api('/api/orders/' + order._id + '/payment', { method: 'PATCH', body: JSON.stringify({ payment_status: 'paid', payment_ref: gateway + ':' + ref }) });
        localStorage.setItem('dg_lastOrder', JSON.stringify(order));
        cart = []; saveCart();
        window.location.href = '/confirmation?order=' + order.orderNumber + '&status=success';
      }
    } catch (err) {
      console.error('Payment confirmation error:', err);
      window.location.href = '/confirmation?order=' + order.orderNumber + '&status=failed&reason=' + encodeURIComponent('Network error during payment verification');
    }
  }

  function simulatePayment(order, gateway) {
    localStorage.setItem('dg_lastOrder', JSON.stringify(order));
    cart = []; saveCart();
    window.location.href = '/confirmation?order=' + order.orderNumber;
  }

  function initPaymentMethodSelection() {
    document.querySelectorAll('.payment-option').forEach(opt => {
      opt.addEventListener('click', () => {
        document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        opt.querySelector('input[type="radio"]').checked = true;
        const method = opt.dataset.method;
        const bankDetails = document.getElementById('bankTransferDetails');
        if (bankDetails) bankDetails.style.display = method === 'bank_transfer' ? 'block' : 'none';
      });
    });
  }

  let _appliedCoupon = null;

  function renderCheckoutSummary() {
    const c = document.getElementById('checkoutItems'), subEl = document.getElementById('checkoutSubtotal'), delEl = document.getElementById('checkoutDelivery'), totEl = document.getElementById('checkoutTotal');
    if (!c) return;
    c.innerHTML = cart.map(i => '<div class="summary-item"><img src="' + escapeHtml(i.image) + '" alt="' + escapeHtml(i.name) + '" width="48" height="48" /><div class="summary-item-info"><div class="summary-item-name">' + escapeHtml(i.name) + '</div><div class="summary-item-qty">Qty: ' + i.quantity + ' &times; ' + formatPrice(i.price) + '</div></div><span class="summary-item-price">' + formatPrice(i.price * i.quantity) + '</span></div>').join('');
    const sub = getCartTotal(), del = sub >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
    let discount = 0;
    if (_appliedCoupon) {
      if (_appliedCoupon.type === 'percentage') discount = Math.min(sub * (_appliedCoupon.value / 100), _appliedCoupon.maxDiscount || Infinity);
      else if (_appliedCoupon.type === 'fixed') discount = Math.min(_appliedCoupon.value, sub);
      else if (_appliedCoupon.type === 'free_shipping') { discount = 0; }
    }
    const total = Math.max(0, sub - discount + (_appliedCoupon?.type === 'free_shipping' ? 0 : del));
    if (subEl) subEl.textContent = formatPrice(sub);
    const discRow = document.getElementById('couponDiscountRow');
    if (discRow) {
      if (discount > 0) { discRow.style.display = ''; document.getElementById('couponDiscount').textContent = '-' + formatPrice(discount); }
      else { discRow.style.display = 'none'; }
    }
    if (delEl) delEl.textContent = (_appliedCoupon?.type === 'free_shipping') ? 'FREE (Coupon)' : (del === 0 ? 'FREE' : formatPrice(del));
    if (totEl) totEl.textContent = formatPrice(total);
  }

  async function applyCoupon() {
    const input = document.getElementById('couponInput');
    const msgEl = document.getElementById('couponMessage');
    if (!input) return;
    const code = input.value.trim();
    if (!code) return;
    try {
      const result = await validateCoupon(code, getCartTotal());
      if (result.valid || result.success) {
        _appliedCoupon = result.coupon || result;
        if (msgEl) { msgEl.style.display = 'block'; msgEl.style.background = '#e8f5e9'; msgEl.style.color = '#2e7d32'; msgEl.textContent = 'Coupon applied! ' + (_appliedCoupon.description || _appliedCoupon.code || code); }
        renderCheckoutSummary();
        showToast('Coupon applied successfully');
      }
    } catch (err) {
      _appliedCoupon = null;
      if (msgEl) { msgEl.style.display = 'block'; msgEl.style.background = '#fce4ec'; msgEl.style.color = '#c62828'; msgEl.textContent = err.message || 'Invalid coupon code'; }
      renderCheckoutSummary();
    }
  }

  // ── Confirmation Page ──
  async function initConfirmationPage() {
    const params = new URLSearchParams(window.location.search);
    const orderNum = params.get('order');
    const loadingEl = document.getElementById('confirmLoading');
    const successEl = document.getElementById('confirmSuccess');
    const failureEl = document.getElementById('confirmFailure');

    if (!orderNum) {
      if (loadingEl) loadingEl.style.display = 'none';
      if (failureEl) failureEl.style.display = '';
      return;
    }

    let order = null;

    // Try to fetch order from server using lookup endpoint
    try {
      order = await api('/api/orders/lookup/' + encodeURIComponent(orderNum));
    } catch {}

    // Fallback: try fetching by order number directly
    if (!order) {
      try {
        order = await api('/api/orders/' + encodeURIComponent(orderNum));
      } catch {}
    }

    // Fallback to localStorage
    if (!order) {
      const localOrder = JSON.parse(localStorage.getItem('dg_lastOrder') || 'null');
      if (localOrder && (localOrder.orderNumber === orderNum || localOrder._id === orderNum)) {
        order = localOrder;
      }
    }

    if (!order) {
      if (loadingEl) loadingEl.style.display = 'none';
      if (failureEl) failureEl.style.display = '';
      return;
    }

    const paymentFailedEl = document.getElementById('confirmPaymentFailed');
    const status = params.get('status');
    const reason = params.get('reason');

    // Payment failed state
    if (status === 'failed') {
      if (loadingEl) loadingEl.style.display = 'none';
      if (paymentFailedEl) paymentFailedEl.style.display = '';
      document.getElementById('paymentFailedReason').textContent = reason || 'Your payment could not be verified. This may be due to an incomplete transaction or a network issue.';
      document.getElementById('failedOrderNumber').textContent = '#' + escapeHtml(order.orderNumber || orderNum);
      document.getElementById('failedOrderTotal').textContent = order.total ? formatPrice(order.total) : 'N/A';
      document.getElementById('paymentFailedDetails').style.display = '';
      // Retry button - redirects to checkout with the order number for retry
      const retryBtn = document.getElementById('retryPaymentBtn');
      if (retryBtn) {
        retryBtn.onclick = () => {
          localStorage.setItem('dg_lastOrder', JSON.stringify(order));
          window.location.href = '/checkout?retry=' + encodeURIComponent(order.orderNumber);
        };
      }
      return;
    }

    if (loadingEl) loadingEl.style.display = 'none';
    if (successEl) successEl.style.display = '';

    document.getElementById('orderNumber').textContent = '#' + escapeHtml(order.orderNumber || orderNum);
    document.getElementById('orderNumDetail').textContent = escapeHtml(order.orderNumber || orderNum);
    document.getElementById('orderTotal').textContent = order.total ? formatPrice(order.total) : 'N/A';
    document.getElementById('orderEmail').textContent = escapeHtml(order.customer_email || '');
    document.getElementById('orderDate').textContent = order.createdAt ? new Date(order.createdAt).toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const paymentLabels = {
      'paystack_card': 'Card (Paystack)', 'flutterwave_card': 'Card (Flutterwave)',
      'paystack_bank': 'Bank Transfer (Paystack)', 'paystack_ussd': 'USSD',
      'flutterwave_bank': 'Bank Transfer (Flutterwave)', 'bank_transfer': 'Manual Bank Transfer', 'cod': 'Cash on Delivery'
    };
    document.getElementById('orderPaymentMethod').textContent = paymentLabels[order.payment_method] || order.payment_method || 'N/A';

    const paymentStatusEl = document.getElementById('orderPaymentStatus');
    paymentStatusEl.textContent = (order.payment_status || 'pending').charAt(0).toUpperCase() + (order.payment_status || 'pending').slice(1);
    paymentStatusEl.className = 'value badge badge-' + (order.payment_status || 'pending');

    document.getElementById('orderAddress').textContent = escapeHtml([order.delivery_address, order.delivery_city, order.delivery_state].filter(Boolean).join(', '));

    // Show tracking number if available
    if (order.trackingNumber) {
      const addrEl = document.getElementById('orderAddress');
      if (addrEl && addrEl.parentElement) {
        const trackingDiv = document.createElement('div');
        trackingDiv.className = 'tracking-info-box';
        trackingDiv.style.marginTop = '12px';
        trackingDiv.innerHTML = '<strong>Tracking Number:</strong> <span class="tracking-number">' + escapeHtml(order.trackingNumber) + '</span> <a href="/track?tn=' + escapeHtml(order.trackingNumber) + '" class="track-link">Track Order →</a>';
        addrEl.parentElement.appendChild(trackingDiv);
      }
    }

    // Render order items
    const itemsEl = document.getElementById('confirmationItems');
    if (itemsEl && order.items) {
      itemsEl.innerHTML = '<h3>Order Items</h3>' + order.items.map(i =>
        '<div class="confirmation-item">' +
          '<img src="' + escapeHtml(i.image || '/images/placeholder.svg') + '" alt="' + escapeHtml(i.name) + '" width="48" height="48" />' +
          '<div class="confirmation-item-info"><span class="name">' + escapeHtml(i.name) + '</span><span class="qty">Qty: ' + i.quantity + '</span></div>' +
          '<span class="price">' + formatPrice(i.price * i.quantity) + '</span>' +
        '</div>'
      ).join('');
    }

    // Update timeline
    updateOrderTimeline(order.order_status || 'pending');

    // Store for invoice
    window._confirmationOrder = order;
  }

  function updateOrderTimeline(status) {
    const statuses = ['pending', 'processing', 'confirmed', 'shipped', 'out_for_delivery', 'delivered'];
    const currentIdx = statuses.indexOf(status);
    if (status === 'cancelled') {
      document.querySelectorAll('.timeline-item').forEach(el => {
        el.classList.remove('active', 'completed');
        if (el.dataset.status === 'pending') el.classList.add('completed');
      });
      return;
    }
    document.querySelectorAll('.timeline-item').forEach(el => {
      const s = el.dataset.status;
      const idx = statuses.indexOf(s);
      el.classList.remove('active', 'completed');
      if (idx < currentIdx) el.classList.add('completed');
      else if (idx === currentIdx) el.classList.add('active');
    });
  }

  // ── Invoice Download ──
  function downloadInvoice() {
    const order = window._confirmationOrder;
    if (!order) return showToast('No order data available');

    const items = order.items || [];
    let invoiceContent = 'DG ELECTRONICS - INVOICE\n';
    invoiceContent += '========================\n\n';
    invoiceContent += 'Order Number: ' + (order.orderNumber || 'N/A') + '\n';
    if (order.trackingNumber) invoiceContent += 'Tracking Number: ' + order.trackingNumber + '\n';
    invoiceContent += 'Date: ' + (order.createdAt ? new Date(order.createdAt).toLocaleDateString() : new Date().toLocaleDateString()) + '\n';
    invoiceContent += 'Customer: ' + (order.customer_name || '') + '\n';
    invoiceContent += 'Email: ' + (order.customer_email || '') + '\n';
    invoiceContent += 'Phone: ' + (order.customer_phone || '') + '\n';
    invoiceContent += 'Delivery: ' + [order.delivery_address, order.delivery_city, order.delivery_state].filter(Boolean).join(', ') + '\n\n';
    invoiceContent += 'ITEMS:\n';
    invoiceContent += '------\n';
    items.forEach(i => {
      invoiceContent += i.name + ' x' + i.quantity + ' - ' + formatPrice(i.price * i.quantity) + '\n';
    });
    invoiceContent += '\nSubtotal: ' + formatPrice(order.subtotal || 0) + '\n';
    invoiceContent += 'Delivery: ' + (order.delivery_fee === 0 ? 'FREE' : formatPrice(order.delivery_fee || 0)) + '\n';
    invoiceContent += 'TOTAL: ' + formatPrice(order.total || 0) + '\n\n';
    invoiceContent += 'Payment Method: ' + (order.payment_method || 'N/A') + '\n';
    invoiceContent += 'Payment Status: ' + (order.payment_status || 'pending') + '\n';
    invoiceContent += 'Order Status: ' + (order.order_status || 'pending') + '\n';
    if (order.trackingNumber) invoiceContent += '\nTrack your order at: ' + window.location.origin + '/track?tn=' + order.trackingNumber + '\n';
    invoiceContent += '\nThank you for shopping with DG Electronics!\n';
    invoiceContent += 'WhatsApp: +234 (903) 135-5560\n';

    const blob = new Blob([invoiceContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'DG-Electronics-Invoice-' + (order.orderNumber || 'order') + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Invoice downloaded!');
  }

  // ── Account Page ──
  function initAccountPage() {
    if (!getToken()) { window.location.href = '/login'; return; }
    api('/api/auth/me').then(u => {
      setAuth(u, getToken());
      const nameEl = document.getElementById('accountName');
      const emailEl = document.getElementById('accountEmail');
      const phoneEl = document.getElementById('accountPhone');
      if (nameEl) nameEl.textContent = u.name || '';
      if (emailEl) emailEl.textContent = u.email || '';
      if (phoneEl) phoneEl.textContent = u.phone || 'Not set';
      initAccountTabs();
      loadOrders();
      initProfileForm();
      const backBtn = document.getElementById('backToOrders');
      if (backBtn) backBtn.addEventListener('click', viewOrdersList);
    }).catch(() => window.location.href = '/login');
  }

  function initAccountTabs() {
    document.querySelectorAll('.account-nav a').forEach(link => {
      link.addEventListener('click', e => {
        e.preventDefault();
        const tab = link.dataset.tab;
        document.querySelectorAll('.account-nav a').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        document.querySelectorAll('.account-section').forEach(s => s.style.display = 'none');
        const section = document.getElementById(tab);
        if (section) section.style.display = '';
        const orderDetail = document.getElementById('orderDetail');
        if (orderDetail && tab !== 'orders') orderDetail.style.display = 'none';
        if (tab === 'tickets') loadMyTickets();
        if (tab === 'returns') loadMyReturns();
        if (tab === 'wishlist') loadMyWishlist();
      });
    });
    initTicketForm();
    initReturnForm();
  }

  function initTicketForm() {
    const form = document.getElementById('ticketForm');
    if (!form) return;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const data = {
        name: document.getElementById('accountName')?.textContent || 'Customer',
        email: document.getElementById('accountEmail')?.textContent || '',
        subject: document.getElementById('ticketSubject').value.trim(),
        category: document.getElementById('ticketCategory').value,
        priority: document.getElementById('ticketPriority').value,
        orderRef: document.getElementById('ticketOrderRef').value.trim() || undefined,
        message: document.getElementById('ticketMessage').value.trim()
      };
      if (!data.subject || !data.message) return showToast('Please fill in all required fields');
      try {
        await api('/api/tickets', { method: 'POST', body: JSON.stringify(data) });
        showToast('Ticket submitted successfully!');
        form.reset();
        document.getElementById('newTicketForm').style.display = 'none';
        loadMyTickets();
      } catch (err) { showToast(err.message); }
    });
  }

  function initReturnForm() {
    const form = document.getElementById('returnForm');
    if (!form) return;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const orderNum = document.getElementById('returnOrderNumber').value.trim();
      if (!orderNum) return showToast('Please enter your order number');
      try {
        const orders = await api('/api/users/orders');
        const order = orders.find(o => o.orderNumber === orderNum || o._id === orderNum);
        if (!order) return showToast('Order not found. Please check your order number.');
        const data = {
          orderId: order._id,
          items: order.items.map(i => ({ productId: i.product?._id || i.product, name: i.name, quantity: i.quantity, price: i.price })),
          type: document.getElementById('returnType').value,
          reason: document.getElementById('returnReason').value,
          description: document.getElementById('returnDescription').value.trim()
        };
        await api('/api/returns', { method: 'POST', body: JSON.stringify(data) });
        showToast('Return request submitted!');
        form.reset();
        document.getElementById('newReturnForm').style.display = 'none';
        loadMyReturns();
      } catch (err) { showToast(err.message); }
    });
  }

  async function loadMyTickets() {
    const c = document.getElementById('ticketsList');
    if (!c) return;
    try {
      const tickets = await api('/api/tickets/my');
      if (!tickets.length) { c.innerHTML = '<div class="orders-empty"><p>No support tickets yet.</p></div>'; return; }
      c.innerHTML = tickets.map(t => {
        const date = new Date(t.createdAt).toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' });
        return '<div class="ticket-card"><div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px"><div><h4 style="margin:0;color:var(--primary-dark)">' + escapeHtml(t.ticketNumber) + '</h4><p style="color:var(--muted);font-size:0.85rem;margin:2px 0">' + escapeHtml(t.subject) + '</p></div><span class="badge badge-' + t.status + '" style="text-transform:capitalize">' + t.status.replace('_', ' ') + '</span></div><p style="font-size:0.85rem;color:#666">' + escapeHtml((t.messages[t.messages.length - 1] || {}).text || '').substring(0, 120) + '</p><p style="font-size:0.75rem;color:var(--muted);margin-top:6px">' + date + ' &middot; ' + (t.category || 'other') + '</p></div>';
      }).join('');
    } catch { c.innerHTML = '<p>Could not load tickets.</p>'; }
  }

  async function loadMyReturns() {
    const c = document.getElementById('returnsList');
    if (!c) return;
    try {
      const returns = await api('/api/returns/my');
      if (!returns.length) { c.innerHTML = '<div class="orders-empty"><p>No return requests yet.</p></div>'; return; }
      c.innerHTML = returns.map(r => {
        const date = new Date(r.createdAt).toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' });
        return '<div class="ticket-card"><div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px"><div><h4 style="margin:0;color:var(--primary-dark)">' + escapeHtml(r.requestNumber) + '</h4><p style="color:var(--muted);font-size:0.85rem;margin:2px 0">Order: ' + escapeHtml(r.orderNumber || '') + '</p></div><span class="badge badge-' + r.status + '" style="text-transform:capitalize">' + r.status + '</span></div><p style="font-size:0.85rem;color:#666">Type: ' + (r.type || 'return') + ' &middot; Reason: ' + escapeHtml(r.reason || '') + '</p>' + (r.adminResponse ? '<p style="font-size:0.85rem;color:var(--primary);margin-top:4px"><strong>Admin:</strong> ' + escapeHtml(r.adminResponse) + '</p>' : '') + '<p style="font-size:0.75rem;color:var(--muted);margin-top:6px">' + date + '</p></div>';
      }).join('');
    } catch { c.innerHTML = '<p>Could not load return requests.</p>'; }
  }

  async function loadMyWishlist() {
    const c = document.getElementById('wishlistList');
    if (!c) return;
    try {
      const products = await api('/api/users/wishlist');
      if (!products || !products.length) { c.innerHTML = '<div class="orders-empty"><p>Your wishlist is empty.</p><a href="/#products" class="btn btn-primary btn-sm">Browse Products</a></div>'; return; }
      c.innerHTML = '<div class="wishlist-grid">' + products.map(p => {
        return '<div class="wishlist-item"><img src="' + (p.image || '/images/placeholder.svg') + '" alt="' + escapeHtml(p.name) + '" /><h4>' + escapeHtml(p.name) + '</h4><p class="price">₦' + (p.price || 0).toLocaleString() + '</p><div style="display:flex;gap:8px"><a href="/product/' + p.slug + '" class="btn btn-primary btn-sm" style="flex:1">View</a><button class="btn btn-secondary btn-sm" data-action="remove-from-wishlist" data-product-id="' + p._id + '">Remove</button></div></div>';
      }).join('') + '</div>';
    } catch { c.innerHTML = '<p>Could not load wishlist.</p>'; }
  }

  window.removeFromWishlist = async function(productId) {
    try {
      await api('/api/users/wishlist/' + productId, { method: 'DELETE' });
      showToast('Removed from wishlist');
      loadMyWishlist();
    } catch (err) { showToast(err.message); }
  };

  function initProfileForm() {
    const form = document.getElementById('profileForm');
    if (!form) return;
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const name = form.querySelector('[name="name"]').value.trim();
      const phone = form.querySelector('[name="phone"]').value.trim();
      if (!name) return;
      try {
        await api('/api/users/profile', { method: 'PUT', body: JSON.stringify({ name, phone }) });
        document.getElementById('accountName').textContent = name;
        if (phone) document.getElementById('accountPhone').textContent = phone;
        showToast('Profile updated!');
      } catch (err) { showToast(err.message); }
    });
  }

  let allOrders = [];

  async function loadOrders() {
    const c = document.getElementById('ordersList');
    if (!c) return;
    c.innerHTML = '<div class="orders-loading"><div class="order-loading-spinner"></div><p>Loading your orders...</p></div>';
    try {
      allOrders = await api('/api/users/orders');
      renderOrdersList(allOrders);
      initOrderFilters();
    } catch { c.innerHTML = '<div class="orders-empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="1.5"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg><p>No orders yet</p><a href="/#products" class="btn btn-primary btn-sm">Start Shopping</a></div>'; }
  }

  function renderOrdersList(orders) {
    const c = document.getElementById('ordersList');
    if (!c) return;
    if (!orders.length) {
      c.innerHTML = '<div class="orders-empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="1.5"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg><p>No orders found</p><span>Once you place an order, it will appear here.</span><a href="/#products" class="btn btn-primary btn-sm">Browse Products</a></div>';
      return;
    }
    c.innerHTML = orders.map(x => {
      const date = new Date(x.createdAt).toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' });
      const statusClass = 'badge-' + escapeHtml(x.order_status || 'pending');
      const canCancel = ['pending', 'processing'].includes(x.order_status);
      return '<div class="order-card" data-action="view-order-detail-card" data-order-id="' + escapeHtml(x._id) + '">' +
        '<div class="order-card-header">' +
          '<div><strong>' + escapeHtml(x.orderNumber) + '</strong><br><small style="color:var(--muted)">' + date + '</small></div>' +
          '<div class="order-card-right"><span class="badge ' + statusClass + '">' + escapeHtml(x.order_status || 'pending') + '</span>' +
          (canCancel ? '<button class="btn-cancel-order" data-action="cancel-order" data-order-id="' + escapeHtml(x._id) + '">Cancel</button>' : '') +
          '</div>' +
        '</div>' +
        '<div class="order-items-preview">' +
          (x.items || []).slice(0, 3).map(i =>
            '<div class="order-item-mini"><img src="' + escapeHtml(i.image || '/images/placeholder.svg') + '" alt="' + escapeHtml(i.name) + '" width="36" height="36" /><span>' + escapeHtml(i.name) + ' &times; ' + i.quantity + '</span></div>'
          ).join('') +
          ((x.items || []).length > 3 ? '<span class="more-items">+' + (x.items.length - 3) + ' more</span>' : '') +
        '</div>' +
        '<div class="order-card-footer"><span class="badge badge-' + escapeHtml(x.payment_status || 'pending') + '">' + escapeHtml(x.payment_status || 'pending') + '</span><span class="order-total">' + formatPrice(x.total) + '</span></div>' +
      '</div>';
    }).join('');
  }

  function initOrderFilters() {
    document.querySelectorAll('.order-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.order-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.dataset.filter;
        if (filter === 'all') renderOrdersList(allOrders);
        else renderOrdersList(allOrders.filter(o => o.order_status === filter));
      });
    });
  }

  async function viewOrderDetail(orderId) {
    const listEl = document.getElementById('orders');
    const detailEl = document.getElementById('orderDetail');
    const contentEl = document.getElementById('orderDetailContent');
    if (!detailEl || !contentEl) return;

    if (listEl) listEl.style.display = 'none';
    detailEl.style.display = '';
    contentEl.innerHTML = '<div class="orders-loading"><div class="order-loading-spinner"></div><p>Loading order details...</p></div>';

    let order = null;
    try { order = await api('/api/orders/' + encodeURIComponent(orderId)); } catch {}
    if (!order) {       contentEl.innerHTML = '<div class="orders-empty"><svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg><p>Order not found</p><button class="btn btn-secondary btn-sm" data-action="view-orders-list">Back to Orders</button></div>'; return; }

    const date = new Date(order.createdAt).toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const paymentLabels = {
      'paystack_card': 'Card (Paystack)', 'flutterwave_card': 'Card (Flutterwave)',
      'paystack_bank': 'Bank Transfer (Paystack)', 'bank_transfer': 'Manual Bank Transfer', 'cod': 'Cash on Delivery'
    };
    const canCancel = ['pending', 'processing'].includes(order.order_status);
    const isDelivered = order.order_status === 'delivered';
    const isCancelled = order.order_status === 'cancelled';

    const timelineStatuses = ['pending', 'processing', 'confirmed', 'shipped', 'out_for_delivery', 'delivered'];
    const currentIdx = timelineStatuses.indexOf(order.order_status);

    const trackingSection = order.trackingNumber
      ? '<div class="tracking-info-box"><strong>Tracking Number:</strong> <span class="tracking-number">' + escapeHtml(order.trackingNumber) + '</span> <a href="/track?tn=' + escapeHtml(order.trackingNumber) + '" target="_blank" class="track-link">Track Order &rarr;</a></div>'
      : '';

    const estDelivery = order.estimatedDeliveryDate && !isDelivered && !isCancelled
      ? '<div class="est-delivery-banner"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><div><strong>Estimated Delivery:</strong> ' + new Date(order.estimatedDeliveryDate).toLocaleDateString('en-NG', { weekday: 'long', month: 'long', day: 'numeric' }) + '</div></div>'
      : '';

    contentEl.innerHTML =
      '<div class="order-detail-card">' +
        '<div class="order-detail-header"><h2>Order #' + escapeHtml(order.orderNumber) + '</h2><span class="badge badge-' + escapeHtml(order.order_status) + '">' + escapeHtml(order.order_status) + '</span></div>' +
        '<div class="order-detail-info">' +
          '<div><strong>Date:</strong> ' + date + '</div>' +
          '<div><strong>Payment:</strong> ' + escapeHtml(paymentLabels[order.payment_method] || order.payment_method || 'N/A') + '</div>' +
          '<div><strong>Payment Status:</strong> <span class="badge badge-' + escapeHtml(order.payment_status) + '">' + escapeHtml(order.payment_status) + '</span></div>' +
          '<div><strong>Delivery:</strong> ' + escapeHtml([order.delivery_address, order.delivery_city, order.delivery_state].filter(Boolean).join(', ')) + '</div>' +
          '<div><strong>Phone:</strong> ' + escapeHtml(order.customer_phone || '') + '</div>' +
        '</div>' +
        estDelivery +
        trackingSection +
        '<div class="order-detail-items">' +
          (order.items || []).map(i =>
            '<div class="order-detail-item"><img src="' + escapeHtml(i.image || '/images/placeholder.svg') + '" alt="' + escapeHtml(i.name) + '" width="48" height="48" /><div><strong>' + escapeHtml(i.name) + '</strong><br><small>Qty: ' + i.quantity + ' &times; ' + formatPrice(i.price) + '</small></div><span class="price">' + formatPrice(i.price * i.quantity) + '</span></div>'
          ).join('') +
        '</div>' +
        '<div class="order-detail-totals">' +
          '<div class="summary-row"><span>Subtotal</span><span>' + formatPrice(order.subtotal || 0) + '</span></div>' +
          '<div class="summary-row"><span>Delivery</span><span>' + (order.delivery_fee === 0 ? 'FREE' : formatPrice(order.delivery_fee || 0)) + '</span></div>' +
          (order.discount ? '<div class="summary-row" style="color:var(--success)"><span>Discount</span><span>-' + formatPrice(order.discount) + '</span></div>' : '') +
          '<div class="summary-row total"><span>Total</span><span>' + formatPrice(order.total || 0) + '</span></div>' +
        '</div>' +
        '<div class="order-detail-timeline">' +
          '<h3>Order Status</h3>' +
          '<div class="timeline">' +
            timelineStatuses.map(s => {
              const idx = timelineStatuses.indexOf(s);
              let cls = '';
              if (isCancelled) cls = idx === 0 ? 'completed' : '';
              else if (idx < currentIdx) cls = 'completed';
              else if (idx === currentIdx) cls = 'active';
              const labels = { pending: 'Order Received', processing: 'Processing', confirmed: 'Confirmed', shipped: 'Shipped', out_for_delivery: 'Out for Delivery', delivered: 'Delivered' };
              return '<div class="timeline-item ' + cls + '"><div class="timeline-dot"></div><div class="timeline-content"><h4>' + (labels[s] || s) + '</h4></div></div>';
            }).join('') +
            (isCancelled ? '<div class="timeline-item cancelled"><div class="timeline-dot"></div><div class="timeline-content"><h4>Cancelled</h4></div></div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="order-detail-actions">' +
          '<button class="btn btn-primary btn-sm" data-action="download-order-invoice" data-order-id="' + escapeHtml(order._id) + '">Download Invoice</button>' +
          (isDelivered ? '<button class="btn btn-secondary btn-sm" data-action="reorder" data-order-id="' + escapeHtml(order._id) + '">Reorder</button>' : '') +
          '<button class="btn btn-secondary btn-sm" data-action="view-orders-list">Back to Orders</button>' +
          (canCancel ? '<button class="btn btn-danger btn-sm" data-action="cancel-order" data-order-id="' + escapeHtml(order._id) + '">Cancel Order</button>' : '') +
        '</div>' +
      '</div>';

    window._detailOrder = order;
  }

  async function cancelOrder(orderId) {
    if (!confirm('Are you sure you want to cancel this order? This cannot be undone.')) return;
    try {
      await api('/api/orders/' + orderId + '/cancel', { method: 'PATCH' });
      showToast('Order cancelled successfully');
      loadOrders();
      // Refresh detail view if open
      const detailEl = document.getElementById('orderDetail');
      if (detailEl && detailEl.style.display !== 'none') viewOrderDetail(orderId);
    } catch (err) { showToast(err.message); }
  }

  function downloadOrderInvoice(orderId) {
    const order = window._detailOrder;
    if (!order) return showToast('No order data available');
    window._confirmationOrder = order;
    downloadInvoice();
  }

  async function reorder(orderId) {
    const order = window._detailOrder || allOrders.find(o => o._id === orderId);
    if (!order || !order.items || !order.items.length) return showToast('No items to reorder');
    try {
      const cart = JSON.parse(localStorage.getItem('dg_cart') || '[]');
      let added = 0;
      for (const item of order.items) {
        const productId = item.product?._id || item.product;
        if (!productId) continue;
        const existing = cart.find(c => c._id === productId || c.product === productId);
        if (existing) {
          existing.quantity = (existing.quantity || 1) + (item.quantity || 1);
        } else {
          cart.push({ _id: productId, name: item.name, price: item.price, image: item.image, quantity: item.quantity || 1 });
        }
        added++;
      }
      localStorage.setItem('dg_cart', JSON.stringify(cart));
      showToast(added + ' item(s) added to cart');
      if (typeof updateCartCount === 'function') updateCartCount();
    } catch (err) { showToast('Failed to add items to cart'); }
  }

  // ── Product Detail Page ──
  async function initProductPage() {
    const slug = window.location.pathname.split('/product/')[1];
    const container = document.getElementById('productDetail');
    if (!container) return;

    if (!slug) { renderProductNotFound(container); return; }

    showProductLoading(container);

    let product = null;
    try {
      product = await api('/api/products/' + encodeURIComponent(slug));
    } catch (err) {
      product = FALLBACK_PRODUCTS.find(p => p.slug === slug || p._id === slug);
      if (!product) { renderProductNotFound(container, slug); return; }
    }
    if (!product) { renderProductNotFound(container, slug); return; }

    if (!products.find(p => p._id === product._id)) products.push(product);

    document.title = escapeHtml(product.name) + ' | DG Electronics';
    let metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.content = product.description.slice(0, 160);

    trackRecentlyViewed(product._id);

    const images = product.images?.length ? product.images : [product.image];
    const s = stockStatus(product.stock);
    const discount = product.oldPrice ? Math.round((1 - product.price / product.oldPrice) * 100) : 0;
    const reviewCount = Array.isArray(product.reviews) ? product.reviews.length : (product.reviewCount || 0);
    const avgRating = product.rating || 0;

    const shareUrl = window.location.href;
    const shareText = encodeURIComponent(product.name + ' - ' + formatPrice(product.price) + ' at DG Electronics').replace(/'/g, '%27');
    const categoryLabel = product.category ? (product.category.charAt(0).toUpperCase() + product.category.slice(1)) : '';

    const warrantyText = escapeHtml(product.warranty || '2-year manufacturer warranty');
    const returnText = escapeHtml(product.returnPolicy || '30-day hassle-free returns');
    const deliveryText = escapeHtml(product.estimatedDelivery || '2-5 business days');

    let thumbsHtml = '';
    if (images.length > 1) {
      thumbsHtml = '<div class="gallery-thumbs" id="galleryThumbs">' +
        images.map((img, i) => '<div class="gallery-thumb ' + (i === 0 ? 'active' : '') + '" data-action="change-image" data-index="' + i + '"><img src="' + escapeHtml(img) + '" alt="' + escapeHtml(product.name) + ' ' + (i + 1) + '" width="80" height="80" loading="lazy" decoding="async" /></div>').join('') +
        '</div>';
    }

    let galleryNavHtml = '';
    if (images.length > 1) {
      galleryNavHtml = '<button class="gallery-nav prev" data-action="gallery-prev" aria-label="Previous image">&#8249;</button>' +
        '<button class="gallery-nav next" data-action="gallery-next" aria-label="Next image">&#8250;</button>';
    }

    let colorsHtml = '';
    if (product.colors && product.colors.length) {
      colorsHtml = '<div class="product-colors"><label>Color: <strong id="selectedColorName">' + escapeHtml(product.colors[0].name) + '</strong></label><div class="color-options">' +
        product.colors.map((c, i) => '<div class="color-swatch' + (i === 0 ? ' active' : '') + '" style="background:' + escapeHtml(c.hex) + '" title="' + escapeHtml(c.name) + '" data-action="select-color" data-color-name="' + escapeHtml(c.name) + '"></div>').join('') +
        '</div></div>';
    }

    let storageHtml = '';
    if (product.storageOptions && product.storageOptions.length) {
      storageHtml = '<div class="product-storage"><label>Storage / Variant:</label><div class="storage-options">' +
        product.storageOptions.map((st, i) => '<button class="storage-btn' + (i === 0 ? ' active' : '') + '" data-action="select-storage" data-price="' + st.price + '">' + escapeHtml(st.label) + '<span class="storage-price">' + formatPrice(st.price) + '</span></button>').join('') +
        '</div></div>';
    }

    window._currentProductId = product._id;

    let specsHtml = '';
    if (product.specifications && Object.keys(product.specifications).length) {
      specsHtml = '<div class="specs-grid">' +
        Object.entries(product.specifications).map(([k, v]) => '<div class="spec-row"><span class="spec-label">' + escapeHtml(k.replace(/_/g, ' ')) + '</span><span class="spec-value">' + escapeHtml(v) + '</span></div>').join('') +
        '</div>';
    }

    let featuresHtml = '';
    if (product.features && product.features.length) {
      featuresHtml = '<div class="features-list">' +
        product.features.map(f => '<div class="feature-item">' + escapeHtml(f) + '</div>').join('') +
        '</div>';
    }

    const related = product.related || products.filter(p => p.category === product.category && p._id !== product._id).slice(0, 4);

    container.innerHTML = `
      <div class="breadcrumb"><a href="/">Home</a><span class="sep">/</span><a href="/#products">Products</a><span class="sep">/</span><a href="/#products">${escapeHtml(categoryLabel)}</a><span class="sep">/</span><span>${escapeHtml(product.name)}</span></div>
      <div class="product-page-layout">
        <div class="product-gallery">
          <div class="gallery-main" id="galleryMain">
            ${product.badge ? '<span class="gallery-badge badge-' + escapeHtml(product.badge) + '">' + escapeHtml(product.badge) + '</span>' : ''}
            <img src="${escapeHtml(images[0])}" alt="${escapeHtml(product.name)}" id="galleryMainImg" />
            ${galleryNavHtml}
            <span class="zoom-hint">Hover to zoom</span>
          </div>
          ${thumbsHtml}
          <div class="gallery-actions">
            <button class="gallery-action-btn" data-action="open-lightbox"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg> Fullscreen</button>
          </div>
        </div>
        <div class="product-info">
          <h1>${escapeHtml(product.name)}</h1>
          <div class="product-rating"><span class="stars">${stars(avgRating)}</span><span class="count">(${reviewCount} reviews)</span></div>
          <div class="product-price-block">
            <span class="product-price" id="productPrice">${formatPrice(product.price)}</span>
            ${product.oldPrice ? '<span class="product-old-price">' + formatPrice(product.oldPrice) + '</span><span class="product-discount">-' + discount + '%</span>' : ''}
          </div>
          <span class="product-stock-status ${s.class}">${s.text}</span>
          <p class="product-desc">${escapeHtml(product.description)}</p>
          <div class="product-meta">
            <span>Brand: <strong>${escapeHtml(product.brand || 'N/A')}</strong></span>
            <span>Category: <strong>${escapeHtml(categoryLabel)}</strong></span>
          </div>
          ${colorsHtml}
          ${storageHtml}
          <div class="quantity-selector">
            <label>Quantity:</label>
            <div class="qty-control">
              <button data-action="product-qty-minus">-</button>
              <input type="number" class="qty-num" id="productQty" value="1" min="1" max="${product.stock}" readonly />
              <button data-action="product-qty-plus">+</button>
            </div>
          </div>
          <div class="product-actions">
            <button class="btn btn-primary" data-action="buy-now-product" data-product-id="${escapeHtml(product._id)}">Buy Now</button>
            <button class="btn btn-secondary" data-action="add-to-cart-qty" data-product-id="${escapeHtml(product._id)}">Add to Cart</button>
          </div>
          <div class="product-actions-secondary">
            <button class="btn-wishlist" data-action="toggle-wishlist-detail"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> Wishlist</button>
            <button class="btn-share" data-action="share-product" data-share-text="${shareText}" data-share-url="${escapeHtml(shareUrl)}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg> Share</button>
          </div>
        </div>
      </div>

      <div class="product-tabs">
        <div class="product-tabs-header">
          <button class="product-tab-btn active" data-action="switch-tab" data-tab-id="tab-desc">Description</button>
          <button class="product-tab-btn" data-action="switch-tab" data-tab-id="tab-specs">Specifications</button>
          <button class="product-tab-btn" data-action="switch-tab" data-tab-id="tab-features">Features</button>
          <button class="product-tab-btn" data-action="switch-tab" data-tab-id="tab-policies">Warranty & Returns</button>
          <button class="product-tab-btn" data-action="switch-tab" data-tab-id="tab-reviews">Reviews (${reviewCount})</button>
          <button class="product-tab-btn" data-action="switch-tab" data-tab-id="tab-qa">Q&A</button>
        </div>
        <div class="product-tab-panel active" id="tab-desc">
          <div class="product-description-content">${escapeHtml(product.description).replace(/\n/g, '<br>')}</div>
        </div>
        <div class="product-tab-panel" id="tab-specs">
          ${specsHtml || '<p style="color:var(--muted);text-align:center;padding:2rem 0;">No specifications available for this product.</p>'}
        </div>
        <div class="product-tab-panel" id="tab-features">
          ${featuresHtml || '<p style="color:var(--muted);text-align:center;padding:2rem 0;">No features listed for this product.</p>'}
        </div>
        <div class="product-tab-panel" id="tab-policies">
          <div class="product-policies-detail">
            <div class="policy-detail-card">
              <div class="policy-detail-icon">🚚</div>
              <h4>Delivery</h4>
              <p>${deliveryText}. Free delivery on orders above ₦500,000.</p>
            </div>
            <div class="policy-detail-card">
              <div class="policy-detail-icon">🛡️</div>
              <h4>Warranty</h4>
              <p>${warrantyText}. Covers manufacturing defects and hardware failures.</p>
            </div>
            <div class="policy-detail-card">
              <div class="policy-detail-icon">🔄</div>
              <h4>Returns</h4>
              <p>${returnText}. Items must be unused and in original packaging.</p>
            </div>
          </div>
        </div>
        <div class="product-tab-panel" id="tab-reviews">
          <div class="review-summary-inline" id="reviewSummary"></div>
          <div id="reviewFormContainer"></div>
          <div id="reviewListContainer"><div class="review-loading"><div class="loading-spinner"></div></div></div>
        </div>
        <div class="product-tab-panel" id="tab-qa">
          <div class="qa-section">
            <div class="qa-empty">No questions yet. Be the first to ask a question about this product!</div>
            <button class="btn btn-secondary qa-ask-btn" data-action="open-cart">Ask a Question</button>
          </div>
        </div>
      </div>

      <div class="product-policies-detail" style="margin-top:1rem;">
        <div class="policy-detail-card">
          <div class="policy-detail-icon">🚚</div>
          <h4>Fast Delivery</h4>
          <p>${deliveryText}</p>
        </div>
        <div class="policy-detail-card">
          <div class="policy-detail-icon">🛡️</div>
          <h4>${warrantyText}</h4>
          <p>Full manufacturer coverage on all products</p>
        </div>
        <div class="policy-detail-card">
          <div class="policy-detail-icon">🔄</div>
          <h4>${returnText}</h4>
          <p>Not satisfied? Return hassle-free</p>
        </div>
      </div>

      <div class="related-section" id="relatedSection" style="display:none;">
        <h2 class="section-title" style="text-align:left;margin-bottom:1.2rem;">Related Products</h2>
        <div class="product-grid" id="relatedGrid"></div>
      </div>
    `;

    window._galleryImages = images;
    window._galleryIndex = 0;

    var galleryMain = document.getElementById('galleryMain');
    if (galleryMain) {
      galleryMain.addEventListener('mousemove', hoverZoom);
      galleryMain.addEventListener('mouseleave', resetZoom);
    }

    if (related.length) {
      const relSection = document.getElementById('relatedSection');
      const relGrid = document.getElementById('relatedGrid');
      if (relSection && relGrid) {
        relSection.style.display = '';
        renderProducts(related, 'relatedGrid');
      }
    }

    loadRecentlyViewed(product._id);
    loadReviews(product._id);

    initGalleryTouch();
    initLightboxTouch();
  }

  function showProductLoading(container) {
    if (!container) return;
    container.innerHTML = '<div class="product-loading"><div class="loading-spinner"></div><p>Loading product...</p></div>';
  }

  function renderProductNotFound(container, slug) {
    if (!container) return;
    container.innerHTML =
      '<div class="product-not-found">' +
        '<div class="not-found-icon">🔍</div>' +
        '<h1>Product Not Found</h1>' +
        '<p>' + (slug ? 'We couldn\'t find "' + escapeHtml(slug) + '". ' : '') + 'The product may have been removed or the link is incorrect.</p>' +
        '<div class="not-found-actions">' +
          '<a href="/#products" class="btn btn-primary">Browse Products</a>' +
          '<a href="/" class="btn btn-secondary">Back to Home</a>' +
        '</div>' +
      '</div>';
  }

  function changeImage(index) {
    const imgs = window._galleryImages;
    if (!imgs || !imgs[index]) return;
    const mainImg = document.getElementById('galleryMainImg');
    if (mainImg) {
      mainImg.classList.add('switching');
      setTimeout(() => {
        mainImg.src = imgs[index];
        mainImg.classList.remove('switching');
      }, 200);
    }
    document.querySelectorAll('.gallery-thumb').forEach((t, i) => t.classList.toggle('active', i === index));
    window._galleryIndex = index;
  }

  function galleryPrev() {
    const imgs = window._galleryImages;
    if (!imgs || imgs.length <= 1) return;
    const idx = (window._galleryIndex - 1 + imgs.length) % imgs.length;
    changeImage(idx);
  }

  function galleryNext() {
    const imgs = window._galleryImages;
    if (!imgs || imgs.length <= 1) return;
    const idx = (window._galleryIndex + 1) % imgs.length;
    changeImage(idx);
  }

  function toggleZoom() {
    const main = document.getElementById('galleryMain');
    if (main) main.classList.toggle('zoomed');
  }

  function hoverZoom(e) {
    const main = document.getElementById('galleryMain');
    const img = document.getElementById('galleryMainImg');
    if (!main || !img) return;
    const rect = main.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    img.style.transformOrigin = x + '% ' + y + '%';
    img.style.transform = 'scale(2.2)';
  }

  function resetZoom() {
    const img = document.getElementById('galleryMainImg');
    if (img) {
      img.style.transformOrigin = 'center center';
      img.style.transform = 'scale(1)';
    }
  }

  // ── Touch: Gallery swipe & tap-to-zoom ──
  function initGalleryTouch() {
    const main = document.getElementById('galleryMain');
    if (!main) return;
    let touchStartX = 0, touchStartY = 0, swiped = false;
    main.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      swiped = false;
    }, { passive: true });
    main.addEventListener('touchmove', (e) => {
      if (swiped) return;
      const dx = e.touches[0].clientX - touchStartX;
      const dy = e.touches[0].clientY - touchStartY;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 30) {
        swiped = true;
        if (dx > 0) galleryPrev(); else galleryNext();
      }
    }, { passive: true });
    main.addEventListener('click', (e) => {
      if ('ontouchstart' in window) { toggleZoom(); e.preventDefault(); }
    });
  }

  // ── Touch: Lightbox swipe ──
  function initLightboxTouch() {
    const overlay = document.getElementById('lightboxOverlay');
    if (!overlay) return;
    let touchStartX = 0, swiped = false;
    overlay.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      swiped = false;
    }, { passive: true });
    overlay.addEventListener('touchmove', (e) => {
      if (swiped) return;
      const dx = e.touches[0].clientX - touchStartX;
      if (Math.abs(dx) > 40) {
        swiped = true;
        if (dx > 0) { const p = document.getElementById('lightboxPrev'); if (p) p.click(); }
        else { const n = document.getElementById('lightboxNext'); if (n) n.click(); }
      }
    }, { passive: true });
  }

  function switchProductTab(btn, tabId) {
    document.querySelectorAll('.product-tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.product-tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const panel = document.getElementById(tabId);
    if (panel) panel.classList.add('active');
  }

  function productQty(delta) {
    const input = document.getElementById('productQty');
    if (!input) return;
    let val = parseInt(input.value) + delta;
    if (val < 1) val = 1;
    if (val > parseInt(input.max)) val = parseInt(input.max);
    input.value = val;
  }

  function addToCartQty(productId) {
    const qty = parseInt(document.getElementById('productQty')?.value || '1');
    addToCart(productId, qty);
  }

  function buyNowProduct(productId) {
    const qty = parseInt(document.getElementById('productQty')?.value || '1');
    addToCart(productId, qty);
    closeCart();
    window.location.href = '/checkout';
  }

  // ── Admin ──
  async function initAdminPage() {
    if (!getToken()) { window.location.href = '/login'; return; }
    try {
      const user = await api('/api/auth/me');
      if (user.role !== 'admin') { window.location.href = '/account'; return; }
      setAuth(user, getToken());
      loadAdminStats(); loadAdminOrders(); loadAdminSettings();
    } catch { window.location.href = '/login'; }
  }

  async function loadAdminStats() {
    try {
      const s = await api('/api/admin/stats');
      const ordersEl = document.getElementById('statOrders');
      const revenueEl = document.getElementById('statRevenue');
      const pendingEl = document.getElementById('statPending');
      const customersEl = document.getElementById('statCustomers');
      if (ordersEl) ordersEl.textContent = s.totalOrders;
      if (revenueEl) revenueEl.textContent = formatPrice(s.totalRevenue);
      if (pendingEl) pendingEl.textContent = s.pendingOrders;
      if (customersEl) customersEl.textContent = s.totalCustomers;
    } catch {}
  }

  async function loadAdminOrders() {
    const c = document.getElementById('adminOrdersBody');
    if (!c) return;
    try {
      const orders = await api('/api/admin/orders');
      if (!orders.length) { c.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--muted)">No orders yet.</td></tr>'; return; }
      c.innerHTML = orders.map(o => '<tr><td><strong>' + escapeHtml(o.orderNumber) + '</strong><br><small style="color:var(--muted)">' + new Date(o.createdAt).toLocaleDateString() + '</small></td><td>' + escapeHtml(o.customer_name) + '<br><small>' + escapeHtml(o.customer_email) + '</small></td><td>' + (o.items || []).map(i => escapeHtml(i.name)).join(', ') + '</td><td>' + formatPrice(o.total) + '</td><td><span class="badge badge-' + escapeHtml(o.payment_status) + '">' + escapeHtml(o.payment_status) + '</span><br><small>' + escapeHtml(o.payment_method || 'paystack') + '</small></td><td><select class="admin-status-select" data-action="update-order-status" data-order-id="' + escapeHtml(o._id) + '"><option value="processing"' + (o.order_status === 'processing' ? ' selected' : '') + '>Processing</option><option value="confirmed"' + (o.order_status === 'confirmed' ? ' selected' : '') + '>Confirmed</option><option value="shipped"' + (o.order_status === 'shipped' ? ' selected' : '') + '>Shipped</option><option value="delivered"' + (o.order_status === 'delivered' ? ' selected' : '') + '>Delivered</option><option value="cancelled"' + (o.order_status === 'cancelled' ? ' selected' : '') + '>Cancelled</option></select></td></tr>').join('');
    } catch { c.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:var(--muted)">Could not load orders.</td></tr>'; }
  }

  async function updateOrderStatus(id, status) { try { await api('/api/admin/orders/' + encodeURIComponent(id) + '/status', { method: 'PATCH', body: JSON.stringify({ order_status: status }) }); showToast('Order status updated'); } catch (err) { showToast(err.message); } }

  async function loadAdminSettings() {
    try {
      const settings = await api('/api/settings');
      const codEl = document.getElementById('codEnabled');
      const feeEl = document.getElementById('deliveryFeeInput');
      const threshEl = document.getElementById('freeThresholdInput');
      if (codEl) codEl.checked = settings.cash_on_delivery !== false;
      if (feeEl) feeEl.value = settings.delivery_fee || 2000;
      if (threshEl) threshEl.value = settings.free_delivery_threshold || 500000;
    } catch {}
  }

  async function saveAdminSettings() {
    const cod = document.getElementById('codEnabled')?.checked;
    const fee = parseInt(document.getElementById('deliveryFeeInput')?.value || '2000');
    const threshold = parseInt(document.getElementById('freeThresholdInput')?.value || '500000');
    try {
      await api('/api/admin/settings', { method: 'PUT', body: JSON.stringify({ cash_on_delivery: cod, delivery_fee: fee, free_delivery_threshold: threshold }) });
      showToast('Settings saved!');
    } catch (err) { showToast(err.message); }
  }

  // ── Lightbox ──
  let lightboxIndex = 0;

  function openLightbox() {
    const imgs = window._galleryImages;
    if (!imgs || !imgs.length) return;
    lightboxIndex = window._galleryIndex || 0;
    const overlay = document.getElementById('lightboxOverlay');
    const img = document.getElementById('lightboxImg');
    const counter = document.getElementById('lightboxCounter');
    if (!overlay || !img) return;
    img.src = imgs[lightboxIndex];
    if (counter) counter.textContent = (lightboxIndex + 1) + ' / ' + imgs.length;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    updateLightboxNav();
  }

  function closeLightbox() {
    const overlay = document.getElementById('lightboxOverlay');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  function lightboxPrev() {
    const imgs = window._galleryImages;
    if (!imgs || imgs.length <= 1) return;
    lightboxIndex = (lightboxIndex - 1 + imgs.length) % imgs.length;
    updateLightboxImage();
  }

  function lightboxNext() {
    const imgs = window._galleryImages;
    if (!imgs || imgs.length <= 1) return;
    lightboxIndex = (lightboxIndex + 1) % imgs.length;
    updateLightboxImage();
  }

  function updateLightboxImage() {
    const imgs = window._galleryImages;
    const img = document.getElementById('lightboxImg');
    const counter = document.getElementById('lightboxCounter');
    if (!img || !imgs || !imgs[lightboxIndex]) return;
    img.style.opacity = '0.5';
    img.style.transform = 'scale(0.95)';
    setTimeout(() => {
      img.src = imgs[lightboxIndex];
      img.style.opacity = '1';
      img.style.transform = 'scale(1)';
      if (counter) counter.textContent = (lightboxIndex + 1) + ' / ' + imgs.length;
    }, 150);
    updateLightboxNav();
  }

  function updateLightboxNav() {
    const imgs = window._galleryImages;
    const prevBtn = document.getElementById('lightboxPrev');
    const nextBtn = document.getElementById('lightboxNext');
    if (prevBtn) prevBtn.style.display = imgs && imgs.length > 1 ? '' : 'none';
    if (nextBtn) nextBtn.style.display = imgs && imgs.length > 1 ? '' : 'none';
  }

  // ── Color Selector ──
  function selectColor(el, name) {
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    el.classList.add('active');
    const nameEl = document.getElementById('selectedColorName');
    if (nameEl) nameEl.textContent = name;
  }

  // ── Storage Selector ──
  function selectStorage(el, price) {
    document.querySelectorAll('.storage-btn').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    const priceEl = document.getElementById('productPrice');
    if (priceEl) priceEl.textContent = formatPrice(price);
  }

  // ── Wishlist Detail ──
  function toggleWishlistDetail(btn) {
    btn.classList.toggle('active');
    if (btn.classList.contains('active')) {
      btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> Wishlisted';
    } else {
      btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg> Wishlist';
    }
  }

  // ── Global API ──
  function toggleWishlist(productId, btn) {
    btn.classList.toggle('wishlisted');
    if (btn.classList.contains('wishlisted')) {
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
    } else {
      btn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
    }
  }

  // ── Recently Viewed Tracking ──
  async function trackRecentlyViewed(productId) {
    try {
      await fetch(API + '/api/recently-viewed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (getToken() || '') },
        body: JSON.stringify({ productId, sessionId })
      });
    } catch {}
  }

  async function loadRecentlyViewed(currentProductId) {
    const section = document.getElementById('recentlyViewedSection');
    const grid = document.getElementById('recentlyViewedGrid');
    if (!section || !grid) return;
    try {
      const items = await fetch(API + '/api/recently-viewed?sessionId=' + sessionId, {
        headers: { 'Authorization': 'Bearer ' + (getToken() || '') }
      }).then(r => r.json());
      const filtered = items.filter(p => p._id !== currentProductId).slice(0, 6);
      if (filtered.length) {
        section.style.display = '';
        renderProducts(filtered, 'recentlyViewedGrid');
      }
    } catch {}
  }

  // ── Share Product ──
  function shareProduct(text, url) {
    if (navigator.share) {
      navigator.share({ title: text.split(' - ')[0], text: decodeURIComponent(text), url: url }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(decodeURIComponent(text) + ' ' + url).then(() => {
        showToast('Link copied to clipboard!');
      }).catch(() => {
        prompt('Copy this link:', url);
      });
    } else {
      prompt('Copy this link:', url);
    }
  }

  // ── Toast Notification ──
  function showToast(message) {
    if (!message) return;
    let toast = document.getElementById('dgToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'dgToast';
      toast.className = 'dg-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }

  // ── View Orders List (back from detail) ──
  function viewOrdersList() {
    const listEl = document.getElementById('orders');
    const detailEl = document.getElementById('orderDetail');
    if (listEl) listEl.style.display = '';
    if (detailEl) detailEl.style.display = 'none';
  }

  // ── Global Error Handler ──
  window.addEventListener('unhandledrejection', function (event) {
    console.error('Unhandled promise rejection:', event.reason);
    event.preventDefault();
  });

  // ── Coupon Functions ──
  async function validateCoupon(code, subtotal) {
    try {
      const result = await api('/api/coupons/validate', { method: 'POST', body: JSON.stringify({ code, subtotal }) });
      return result;
    } catch (err) {
      throw err;
    }
  }

  // ── Review System ──
  let _reviewPage = 1;
  let _reviewSort = 'newest';
  let _reviewProductId = null;

  async function loadReviews(productId, page, sort) {
    _reviewProductId = productId;
    _reviewPage = page || 1;
    _reviewSort = sort || _reviewSort;
    const summaryEl = document.getElementById('reviewSummary');
    const formEl = document.getElementById('reviewFormContainer');
    const listEl = document.getElementById('reviewListContainer');
    if (!listEl) return;

    try {
      const data = await api('/api/reviews/product/' + productId + '?page=' + _reviewPage + '&limit=5&sort=' + _reviewSort);
      // Render summary
      if (summaryEl) {
        const dist = data.distribution || {};
        const total = data.total || 0;
        const avg = data.avgRating || 0;
        let distHtml = '';
        for (let i = 5; i >= 1; i--) {
          const count = dist[i] || 0;
          const pct = total > 0 ? Math.round((count / total) * 100) : 0;
          distHtml += '<div class="dist-row"><span class="dist-label">' + i + ' ★</span><div class="dist-bar-bg"><div class="dist-bar-fill" style="width:' + pct + '%"></div></div><span class="dist-count">' + count + '</span></div>';
        }
        summaryEl.innerHTML = '<div class="review-summary"><div class="review-summary-left"><div class="rating-big">' + avg.toFixed(1) + '</div><div class="rating-big-stars">' + stars(avg) + '</div><div class="rating-big-count">' + total + ' review' + (total !== 1 ? 's' : '') + '</div></div><div class="review-summary-right">' + distHtml + '</div></div>';
      }
      // Render form
      if (formEl) {
        if (getToken()) {
          formEl.innerHTML = '<div class="review-form-wrapper"><h3>Write a Review</h3><div class="review-form" id="reviewForm"><div class="star-picker" id="reviewStarPicker"><span class="star" data-val="1">&#9733;</span><span class="star" data-val="2">&#9733;</span><span class="star" data-val="3">&#9733;</span><span class="star" data-val="4">&#9733;</span><span class="star" data-val="5">&#9733;</span></div><input type="text" id="reviewTitle" placeholder="Review title (optional)" maxlength="100" /><textarea id="reviewComment" placeholder="Share your experience with this product..." maxlength="1000"></textarea><div class="review-form-actions"><button class="btn btn-primary" data-action="submit-review">Submit Review</button></div></div></div>';
          renderStarPicker('reviewStarPicker');
        } else {
          formEl.innerHTML = '<div class="review-form-wrapper"><p class="review-login-prompt"><a href="/login">Login</a> to write a review.</p></div>';
        }
      }
      // Render reviews
      renderReviewList(listEl, data.reviews, data.page, data.pages, total);
    } catch (err) {
      listEl.innerHTML = '<p class="no-reviews">Failed to load reviews.</p>';
    }
  }

  function renderReviewList(container, reviews, page, pages, total) {
    if (!reviews || reviews.length === 0) {
      container.innerHTML = '<p class="no-reviews">No reviews yet. Be the first to review!</p>';
      return;
    }
    const userId = currentUser ? currentUser._id || currentUser.id : null;
    let html = '<div class="review-controls"><div class="review-sort"><label>Sort:</label><select data-action="sort-reviews"><option value="newest"' + (_reviewSort === 'newest' ? ' selected' : '') + '>Newest</option><option value="helpful"' + (_reviewSort === 'helpful' ? ' selected' : '') + '>Most Helpful</option><option value="rating_high"' + (_reviewSort === 'rating_high' ? ' selected' : '') + '>Highest Rated</option><option value="rating_low"' + (_reviewSort === 'rating_low' ? ' selected' : '') + '>Lowest Rated</option></select></div></div>';
    reviews.forEach(r => {
      const isOwner = userId && r.user && (r.user._id === userId || r.user === userId);
      const date = new Date(r.createdAt).toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' });
      html += '<div class="review-item" data-review-id="' + r._id + '">';
      html += '<div class="review-header"><div class="review-meta"><div class="card-rating"><span class="stars">' + stars(r.rating) + '</span></div>';
      if (r.verified) html += '<span class="verified-badge">Verified Purchase</span>';
      html += '<span class="review-date">' + date + '</span></div></div>';
      if (r.title) html += '<div class="review-title">' + escapeHtml(r.title) + '</div>';
      html += '<p class="review-comment">' + escapeHtml(r.comment || '') + '</p>';
      if (r.photos && r.photos.length) {
        html += '<div class="review-photos">';
        r.photos.forEach(p => { html += '<img src="' + escapeHtml(p) + '" class="review-photo" alt="Review photo" />'; });
        html += '</div>';
      }
      html += '<div class="review-actions">';
      html += '<button class="review-helpful-btn" data-review-helpful="' + r._id + '" data-action="mark-review-helpful" data-review-id="' + r._id + '">Helpful (' + (r.helpful || 0) + ')</button>';
      if (isOwner) {
        html += '<button class="review-edit-btn" data-action="edit-review" data-review-id="' + r._id + '">Edit</button>';
        html += '<button class="review-delete-btn" data-action="delete-review" data-review-id="' + r._id + '">Delete</button>';
      }
      html += '</div></div>';
    });
    // Pagination
    if (pages > 1) {
      html += '<div class="review-pagination">';
      for (let i = 1; i <= pages; i++) {
        html += '<button class="review-page-btn' + (i === page ? ' active' : '') + '" data-action="go-to-review-page" data-page="' + i + '">' + i + '</button>';
      }
      html += '</div>';
    }
    container.innerHTML = html;
  }

  function renderStarPicker(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    let selected = 0;
    const stars = container.querySelectorAll('.star');
    stars.forEach(star => {
      star.addEventListener('click', () => {
        selected = parseInt(star.dataset.val);
        container.dataset.rating = selected;
        stars.forEach((s, i) => { s.classList.toggle('active', i < selected); });
      });
      star.addEventListener('mouseenter', () => {
        const val = parseInt(star.dataset.val);
        stars.forEach((s, i) => { s.classList.toggle('active', i < val); });
      });
      star.addEventListener('mouseleave', () => {
        stars.forEach((s, i) => { s.classList.toggle('active', i < selected); });
      });
    });
  }

  async function submitReview() {
    if (!getToken()) { showToast('Please login to submit a review'); return; }
    const picker = document.getElementById('reviewStarPicker');
    const rating = picker ? parseInt(picker.dataset.rating || 0) : 0;
    if (!rating || rating < 1 || rating > 5) { showToast('Please select a star rating'); return; }
    const title = (document.getElementById('reviewTitle') || {}).value || '';
    const comment = (document.getElementById('reviewComment') || {}).value || '';
    if (!comment.trim()) { showToast('Please write a comment'); return; }
    try {
      await api('/api/reviews', { method: 'POST', body: JSON.stringify({ product_id: _reviewProductId, rating, title, comment }) });
      showToast('Review submitted successfully!');
      loadReviews(_reviewProductId);
    } catch (err) { showToast(err.message); }
  }

  function editReview(reviewId) {
    const item = document.querySelector('[data-review-id="' + reviewId + '"]');
    if (!item) return;
    const currentTitle = item.querySelector('.review-title')?.textContent || '';
    const currentComment = item.querySelector('.review-comment')?.textContent || '';
    const currentStars = item.querySelectorAll('.card-rating .stars')[0]?.textContent || '';
    const currentRating = (currentStars.match(/★/g) || []).length;
    const editDiv = document.createElement('div');
    editDiv.className = 'review-edit-form';
    editDiv.id = 'editForm-' + reviewId;
    editDiv.innerHTML = '<div class="star-picker" id="editStarPicker-' + reviewId + '" data-rating="' + currentRating + '"><span class="star' + (currentRating >= 1 ? ' active' : '') + '" data-val="1">&#9733;</span><span class="star' + (currentRating >= 2 ? ' active' : '') + '" data-val="2">&#9733;</span><span class="star' + (currentRating >= 3 ? ' active' : '') + '" data-val="3">&#9733;</span><span class="star' + (currentRating >= 4 ? ' active' : '') + '" data-val="4">&#9733;</span><span class="star' + (currentRating >= 5 ? ' active' : '') + '" data-val="5">&#9733;</span></div><input type="text" id="editTitle-' + reviewId + '" value="' + escapeHtml(currentTitle) + '" placeholder="Review title" maxlength="100" /><textarea id="editComment-' + reviewId + '" placeholder="Your review" maxlength="1000">' + escapeHtml(currentComment) + '</textarea><div class="review-form-actions"><button class="btn btn-primary" data-action="update-review" data-review-id="' + reviewId + '">Save</button><button class="btn btn-secondary" data-action="cancel-edit-review" data-review-id="' + reviewId + '">Cancel</button></div>';
    item.appendChild(editDiv);
    renderStarPicker('editStarPicker-' + reviewId);
  }

  function cancelEditReview(reviewId) {
    const form = document.getElementById('editForm-' + reviewId);
    if (form) form.remove();
  }

  async function updateReview(reviewId) {
    const picker = document.getElementById('editStarPicker-' + reviewId);
    const rating = picker ? parseInt(picker.dataset.rating || 0) : 0;
    if (!rating) { showToast('Please select a rating'); return; }
    const title = (document.getElementById('editTitle-' + reviewId) || {}).value || '';
    const comment = (document.getElementById('editComment-' + reviewId) || {}).value || '';
    try {
      await api('/api/reviews/' + reviewId, { method: 'PATCH', body: JSON.stringify({ rating, title, comment }) });
      showToast('Review updated!');
      loadReviews(_reviewProductId);
    } catch (err) { showToast(err.message); }
  }

  async function deleteReview(reviewId) {
    if (!confirm('Are you sure you want to delete this review?')) return;
    try {
      await api('/api/reviews/' + reviewId, { method: 'DELETE' });
      showToast('Review deleted');
      loadReviews(_reviewProductId);
    } catch (err) { showToast(err.message); }
  }

  function sortReviews(sort) {
    _reviewSort = sort;
    loadReviews(_reviewProductId, 1, sort);
  }

  function goToReviewPage(page) {
    loadReviews(_reviewProductId, page);
  }

  async function markReviewHelpful(reviewId) {
    if (!getToken()) { showToast('Please login to mark reviews'); return; }
    try {
      const result = await api('/api/reviews/' + reviewId + '/helpful', { method: 'POST' });
      const btn = document.querySelector('[data-review-helpful="' + reviewId + '"]');
      if (btn) {
        btn.textContent = 'Helpful (' + result.helpful + ')';
        btn.classList.toggle('active', result.marked);
      }
    } catch (err) { showToast(err.message); }
  }

  window.DG = {
    addToCart, removeFromCart, updateCartQty, buyNow, viewProduct,
    openModal, closeModal, updateOrderStatus, saveAdminSettings,
    changeImage, toggleZoom, productQty, addToCartQty, buyNowProduct,
    galleryPrev, galleryNext, toggleWishlist,
    openLightbox, closeLightbox, lightboxPrev, lightboxNext,
    selectColor, selectStorage, toggleWishlistDetail,
    shareProduct, showToast, hoverZoom, resetZoom, switchProductTab,
    viewOrderDetail, cancelOrder, downloadInvoice, downloadOrderInvoice,
    viewOrdersList, reorder,
    submitSearch, quickView, toggleCompare, showCompare, updateCompareBar,
    loadMore, goToPage, closeFilters,
    validateCoupon, markReviewHelpful, applyCoupon,
    submitReview, editReview, updateReview, deleteReview, sortReviews, goToReviewPage
  };

})();
