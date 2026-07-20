const API = '';
let token = localStorage.getItem('dg_token');
let currentUser = null;
let currentPage = 'dashboard';

/* ============================================================
   Payment Gateway API Keys
   ============================================================
   Before enabling online payments, obtain your API keys:

   Paystack:
   - Sign up / log in at https://dashboard.paystack.com
   - Go to Settings > API Keys & Webhooks
   - Copy your Test and Live keys

   Flutterwave:
   - Sign up / log in at https://dashboard.flutterwave.com
   - Go to Settings > API Keys
   - Copy your Public Key and Secret Key

   Store keys in environment variables on the server:
     PAYSTACK_PUBLIC_KEY, PAYSTACK_SECRET_KEY
     FLUTTERWAVE_PUBLIC_KEY, FLUTTERWAVE_SECRET_KEY
   ============================================================ */

let charts = {};
let currentOrderFilter = '';
let currentOrderSearch = '';
let currentProductSearch = '';
let currentCustomerSearch = '';
let editingProductId = null;

function formatPrice(num) {
  return '\u20A6' + Number(num || 0).toLocaleString('en-NG');
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function debounce(fn, delay) {
  let timer;
  return function () {
    const args = arguments;
    const ctx = this;
    clearTimeout(timer);
    timer = setTimeout(function () { fn.apply(ctx, args); }, delay);
  };
}

function generateSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function paymentBadge(status) {
  const map = { paid: 'badge-success', pending: 'badge-warning', failed: 'badge-danger', refunded: 'badge-info' };
  return '<span class="badge ' + (map[status] || 'badge-secondary') + '">' + escapeHtml(status) + '</span>';
}

function orderStatusBadge(status) {
  const map = { processing: 'badge-warning', confirmed: 'badge-info', shipped: 'badge-primary', delivered: 'badge-success', cancelled: 'badge-danger' };
  return '<span class="badge ' + (map[status] || 'badge-secondary') + '">' + escapeHtml(status) + '</span>';
}

function stockColor(stock) {
  if (stock === 0) return 'color: #ef4444; font-weight: 600;';
  if (stock < 5) return 'color: #f97316; font-weight: 600;';
  return 'color: #22c55e; font-weight: 600;';
}

function stockStatusLabel(stock) {
  if (stock === 0) return '<span style="color:#ef4444;font-weight:600">Out of Stock</span>';
  if (stock < 5) return '<span style="color:#f97316;font-weight:600">Low Stock</span>';
  return '<span style="color:#22c55e;font-weight:600">In Stock</span>';
}

async function api(path, options) {
  options = options || {};
  const headers = {};
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(API + path, Object.assign({}, options, { headers: Object.assign({}, headers, options.headers) }));
  if (res.status === 401) { logout(); throw new Error('Session expired'); }
  if (!res.ok) { const err = await res.json().catch(function () { return {}; }); throw new Error(err.error || 'Request failed'); }
  return res.json();
}

function showToast(message, type) {
  type = type || 'success';
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toastMessage');
  if (!toast || !toastMessage) return;
  toastMessage.textContent = message;
  toast.className = 'toast show ' + type;
  toast.style.display = 'flex';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(function () {
    toast.className = 'toast';
    toast.style.display = 'none';
  }, 3000);
}

function showLoading(btn, loading) {
  if (!btn) return;
  const text = btn.querySelector('.btn-text');
  const spinner = btn.querySelector('.btn-spinner');
  if (text) text.style.display = loading ? 'none' : '';
  if (spinner) spinner.style.display = loading ? 'inline-block' : 'none';
  btn.disabled = loading;
}

function showPageLoader(tbodyId, colspan) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="' + colspan + '" class="no-data">Loading...</td></tr>';
}

function showEmpty(tbodyId, colspan, message) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="' + colspan + '" class="no-data">' + (message || 'No data found') + '</td></tr>';
}

function renderPagination(containerId, totalPages, currentPage, loadFn) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (totalPages <= 1) { container.innerHTML = ''; return; }
  let html = '';
  html += '<button class="pagination-btn" data-page="' + (currentPage - 1) + '"' + (currentPage <= 1 ? ' disabled' : '') + '>&laquo; Prev</button>';
  for (var i = 1; i <= totalPages; i++) {
    if (totalPages > 7 && i > 3 && i < totalPages - 2 && Math.abs(i - currentPage) > 1) {
      if (i === 4 || i === totalPages - 3) html += '<span class="pagination-ellipsis">...</span>';
      continue;
    }
    html += '<button class="pagination-btn' + (i === currentPage ? ' active' : '') + '" data-page="' + i + '">' + i + '</button>';
  }
  html += '<button class="pagination-btn" data-page="' + (currentPage + 1) + '"' + (currentPage >= totalPages ? ' disabled' : '') + '>Next &raquo;</button>';
  container.innerHTML = html;
  var buttons = container.querySelectorAll('.pagination-btn');
  buttons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var p = parseInt(this.getAttribute('data-page'));
      if (!isNaN(p) && p >= 1 && p <= totalPages) loadFn(p);
    });
  });
}

function logout() {
  token = null;
  currentUser = null;
  localStorage.removeItem('dg_token');
  if (adminNotificationInterval) { clearInterval(adminNotificationInterval); adminNotificationInterval = null; }
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('adminLayout').style.display = 'none';
}

function init() {
  if (token) {
    api('/api/auth/me').then(function (u) {
      currentUser = u;
      if (currentUser.role !== 'admin') { logout(); return; }
      var adminNameEl = document.getElementById('adminName');
      if (adminNameEl) adminNameEl.textContent = currentUser.name || 'Admin';
      loadDashboard();
      startNotificationPolling();
    }).catch(function () { logout(); });
  }
}

var adminNotificationInterval = null;
function startNotificationPolling() {
  if (adminNotificationInterval) clearInterval(adminNotificationInterval);
  pollAdminNotifications();
  adminNotificationInterval = setInterval(pollAdminNotifications, 20000);
}

async function pollAdminNotifications() {
  try {
    var data = await api('/api/notifications/unread-count');
    var badge = document.getElementById('notificationBadge');
    if (badge) {
      if (data.count > 0) {
        badge.textContent = data.count > 99 ? '99+' : data.count;
        badge.style.display = '';
      } else {
        badge.style.display = 'none';
      }
    }
  } catch {}
}

async function loadNotifications() {
  try {
    var data = await api('/api/notifications?limit=20');
    var container = document.getElementById('notificationList');
    if (!container) return;
    if (!data.notifications || data.notifications.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No notifications yet.</p></div>';
      return;
    }
    var html = data.notifications.map(function (n) {
      return '<div class="notification-item ' + (n.read ? '' : 'unread') + '" data-action="mark-notification-read" data-notification-id="' + n._id + '">' +
        '<div class="notification-icon">' + getNotificationIcon(n.type) + '</div>' +
        '<div class="notification-content">' +
          '<div class="notification-title">' + escapeHtml(n.title) + '</div>' +
          '<div class="notification-message">' + escapeHtml(n.message) + '</div>' +
          '<div class="notification-time">' + formatDateTime(n.createdAt) + '</div>' +
        '</div>' +
      '</div>';
    }).join('');
    container.innerHTML = html;
  } catch (err) {
    console.error('Failed to load notifications:', err);
  }
}

function getNotificationIcon(type) {
  var icons = {
    'new_order': '🛒', 'order_status': '📦', 'low_stock': '⚠️', 'review': '⭐', 'system': '⚙️'
  };
  return icons[type] || '🔔';
}

async function markNotificationRead(id) {
  try {
    await api('/api/notifications/' + id + '/read', { method: 'PATCH' });
    pollAdminNotifications();
  } catch {}
}

async function markAllNotificationsRead() {
  try {
    await api('/api/notifications/read-all', { method: 'PATCH' });
    pollAdminNotifications();
    loadNotifications();
  } catch {}
}

function navigateTo(page) {
  currentPage = page;
  var pages = document.querySelectorAll('.page');
  pages.forEach(function (p) { p.style.display = 'none'; p.classList.remove('active'); });
  var target = document.getElementById('page-' + page);
  if (target) { target.style.display = ''; target.classList.add('active'); }
  var links = document.querySelectorAll('.nav-link');
  links.forEach(function (l) { l.classList.remove('active'); if (l.getAttribute('data-page') === page) l.classList.add('active'); });

  switch (page) {
    case 'dashboard': loadDashboard(); break;
    case 'products': loadProducts(1, currentProductSearch); break;
    case 'categories': loadCategories(); break;
    case 'brands': loadBrands(); break;
    case 'customers': loadCustomers(1, currentCustomerSearch); break;
    case 'orders': loadOrders(1, currentOrderSearch, currentOrderFilter); break;
    case 'inventory': loadInventory(); break;
    case 'reports': loadReports(); break;
    case 'settings': loadSettings(); break;
    case 'promotions': loadPromotions(); break;
    case 'coupons': loadCoupons(); break;
    case 'newsletter': loadNewsletter(); break;
    case 'analytics': loadAnalytics(); break;
    case 'reviews': loadAdminReviews(); break;
    case 'support-tickets': loadAdminTickets(); break;
    case 'returns-admin': loadAdminReturns(); break;
    case 'live-chat': loadAdminChats(); break;
  }
}

function destroyChart(name) {
  if (charts[name]) { charts[name].destroy(); charts[name] = null; }
}

function renderSalesChart(canvasId, data, chartName) {
  destroyChart(chartName);
  var canvas = document.getElementById(canvasId);
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var isDark = document.body.classList.contains('dark-mode');
  var textColor = isDark ? '#e2e8f0' : '#64748b';
  var gridColor = isDark ? 'rgba(148,163,184,0.15)' : 'rgba(0,0,0,0.06)';
  charts[chartName] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.map(function (d) { return d.date; }),
      datasets: [{
        label: 'Revenue',
        data: data.map(function (d) { return d.revenue; }),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointBackgroundColor: '#2563eb'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: textColor } } },
      scales: {
        x: { ticks: { color: textColor }, grid: { color: gridColor } },
        y: { ticks: { color: textColor, callback: function (v) { return formatPrice(v); } }, grid: { color: gridColor } }
      }
    }
  });
}

function renderOrderStatusChart(breakdown) {
  destroyChart('orderStatus');
  var canvas = document.getElementById('orderStatusChart');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var isDark = document.body.classList.contains('dark-mode');
  var textColor = isDark ? '#e2e8f0' : '#64748b';
  var colors = {
    pending: '#f59e0b', processing: '#3b82f6', confirmed: '#6366f1',
    shipped: '#8b5cf6', out_for_delivery: '#f97316', delivered: '#10b981', cancelled: '#ef4444'
  };
  var labels = breakdown.map(function (b) { return b._id ? b._id.replace('_', ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : 'Unknown'; });
  var values = breakdown.map(function (b) { return b.count; });
  var bgColors = breakdown.map(function (b) { return colors[b._id] || '#94a3b8'; });
  charts['orderStatus'] = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{ data: values, backgroundColor: bgColors, borderWidth: 2, borderColor: isDark ? '#1e293b' : '#ffffff' }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { color: textColor, padding: 12, usePointStyle: true, pointStyle: 'circle' } }
      }
    }
  });
}

function loadDashboard() {
  var periodSelect = document.getElementById('dashboardChartPeriod');
  var selectedPeriod = periodSelect ? periodSelect.value : 'daily';

  api('/api/admin/stats').then(function (data) {
    var setEl = function (id, val) {
      var el = document.getElementById(id);
      if (el) el.textContent = val;
    };
    setEl('totalProducts', data.totalProducts || 0);
    setEl('totalCustomers', data.totalCustomers || 0);
    setEl('totalOrders', data.totalOrders || 0);
    setEl('pendingOrders', data.pendingOrders || 0);
    setEl('completedOrders', data.completedOrders || 0);
    setEl('outOfStock', data.outOfStockProducts || 0);
    setEl('totalRevenue', formatPrice(data.totalRevenue || 0));
    setEl('lowStockAlerts', data.lowStockProducts ? data.lowStockProducts.length : 0);

    var recentOrdersBody = document.getElementById('recentOrdersBody');
    if (recentOrdersBody) {
      if (!data.recentOrders || data.recentOrders.length === 0) {
        recentOrdersBody.innerHTML = '<tr><td colspan="5" class="no-data">No recent orders</td></tr>';
      } else {
        recentOrdersBody.innerHTML = data.recentOrders.map(function (o) {
          return '<tr>' +
            '<td>' + escapeHtml(o.orderNumber || '-') + '</td>' +
            '<td>' + escapeHtml(o.customer_name || '-') + '</td>' +
            '<td>' + formatPrice(o.total) + '</td>' +
            '<td>' + orderStatusBadge(o.order_status) + '</td>' +
            '<td>' + formatDate(o.createdAt) + '</td>' +
            '</tr>';
        }).join('');
      }
    }

    var lowStockList = document.getElementById('lowStockList');
    if (lowStockList) {
      if (!data.lowStockProducts || data.lowStockProducts.length === 0) {
        lowStockList.innerHTML = '<p class="no-data">No low stock alerts</p>';
      } else {
        lowStockList.innerHTML = data.lowStockProducts.map(function (p) {
          return '<div class="low-stock-item" style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid var(--border)">' +
            '<span>' + escapeHtml(p.name) + '</span>' +
            '<span style="' + stockColor(p.stock) + '">' + p.stock + ' left</span>' +
            '</div>';
        }).join('');
      }
    }

    // Render order status donut chart
    if (data.orderStatusBreakdown && data.orderStatusBreakdown.length > 0) {
      renderOrderStatusChart(data.orderStatusBreakdown);
    }
  }).catch(function (err) { showToast(err.message, 'error'); });

  api('/api/admin/sales-chart?period=' + selectedPeriod).then(function (data) {
    renderSalesChart('salesChart', data || [], 'dashboardSales');
  }).catch(function () {});

  api('/api/admin/bestsellers').then(function (data) {
    var list = document.getElementById('bestSellersList');
    if (!list) return;
    if (!data || data.length === 0) {
      list.innerHTML = '<p class="no-data">No sales data yet</p>';
      return;
    }
    list.innerHTML = data.map(function (p, i) {
      var img = p.image ? '<img src="' + escapeHtml(p.image) + '" style="width:36px;height:36px;object-fit:cover;border-radius:6px">' : '<div style="width:36px;height:36px;background:var(--bg-secondary,#f1f5f9);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px">#' + (i + 1) + '</div>';
      return '<div class="bestseller-item" style="display:flex;justify-content:space-between;align-items:center;padding:10px 16px;border-bottom:1px solid var(--border,#f0f4f8)">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
        '<span style="font-weight:700;color:var(--text-secondary,#94a3b8);min-width:20px">#' + (i + 1) + '</span>' +
        img +
        '<span>' + escapeHtml(p.name) + '</span>' +
        '</div>' +
        '<div style="text-align:right">' +
        '<span style="font-weight:600">' + (p.totalQuantity || 0) + ' sold</span>' +
        '<br><small style="color:var(--text-secondary,#94a3b8)">' + formatPrice(p.totalRevenue) + '</small>' +
        '</div>' +
        '</div>';
    }).join('');
  }).catch(function () {});
}

function loadProducts(page, search) {
  showPageLoader('productsTableBody', 7);
  var params = '?page=' + page + '&limit=10';
  if (search) params += '&search=' + encodeURIComponent(search);
  api('/api/admin/products' + params).then(function (data) {
    var tbody = document.getElementById('productsTableBody');
    if (!data.products || data.products.length === 0) {
      showEmpty('productsTableBody', 7, 'No products found');
      renderPagination('productsPagination', 0, 1, function () {});
      return;
    }
    tbody.innerHTML = data.products.map(function (p) {
      var img = p.image ? '<img src="' + escapeHtml(p.image) + '" alt="" style="width:40px;height:40px;object-fit:cover;border-radius:6px">' : '<div style="width:40px;height:40px;background:var(--bg-secondary,#f1f5f9);border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:12px">N/A</div>';
      var badge = '';
      if (p.badge) badge = '<span class="badge badge-' + p.badge + '">' + escapeHtml(p.badge) + '</span>';
      return '<tr>' +
        '<td>' + img + '</td>' +
        '<td>' + escapeHtml(p.name) + '</td>' +
        '<td>' + escapeHtml(p.category) + '</td>' +
        '<td>' + formatPrice(p.price) + (p.oldPrice ? ' <small style="text-decoration:line-through;color:#94a3b8">' + formatPrice(p.oldPrice) + '</small>' : '') + '</td>' +
        '<td style="' + stockColor(p.stock) + '">' + p.stock + '</td>' +
        '<td>' + badge + '</td>' +
        '<td>' +
        '<button class="btn btn-sm btn-icon product-edit-btn" data-id="' + p._id + '" title="Edit"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button> ' +
        '<button class="btn btn-sm btn-icon btn-danger product-delete-btn" data-id="' + p._id + '" title="Delete"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>' +
        '</td></tr>';
    }).join('');

    renderPagination('productsPagination', data.pages, data.page, function (p) { loadProducts(p, currentProductSearch); });

    tbody.querySelectorAll('.product-edit-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { openProductModal(this.getAttribute('data-id')); });
    });
    tbody.querySelectorAll('.product-delete-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { deleteProduct(this.getAttribute('data-id')); });
    });
  }).catch(function (err) { showEmpty('productsTableBody', 7, 'Error loading products'); showToast(err.message, 'error'); });
}

function openProductModal(productId) {
  var modal = document.getElementById('productModal');
  var form = document.getElementById('productForm');
  var title = document.getElementById('productModalTitle');
  if (!modal || !form) return;
  form.reset();
  uploadedImages = [];
  renderImageGallery();
  document.getElementById('specificationsEditor').innerHTML = '';
  document.getElementById('colorsEditor').innerHTML = '';
  document.getElementById('featuresEditor').innerHTML = '';
  document.getElementById('storageEditor').innerHTML = '';

  if (productId) {
    editingProductId = productId;
    if (title) title.textContent = 'Edit Product';
    api('/api/products/' + productId).then(function (p) {
      fillProductForm(p);
      if (p.images && p.images.length > 0) {
        uploadedImages = p.images.map(function (url) { return { url: url }; });
        renderImageGallery();
      }
    }).catch(function () {
      showToast('Error loading product', 'error');
    });
  } else {
    editingProductId = null;
    if (title) title.textContent = 'Add Product';
    addEditorRow('specificationsEditor', 'key-value');
    addEditorRow('colorsEditor', 'list');
    addEditorRow('featuresEditor', 'list');
    addEditorRow('storageEditor', 'list');
  }
  modal.style.display = 'flex';
}

function fillProductForm(p) {
  var val = function (id, v) { var el = document.getElementById(id); if (el) el.value = v || ''; };
  var check = function (id, v) { var el = document.getElementById(id); if (el) el.checked = !!v; };
  val('productName', p.name);
  val('productSlug', p.slug);
  val('productCategory', p.category);
  val('productBrand', p.brand);
  val('productPrice', p.price);
  val('productOldPrice', p.oldPrice);
  val('productDescription', p.description);
  val('productStock', p.stock);
  val('productBadge', p.badge || '');
  check('productFeatured', p.featured);
  check('productBestSeller', p.bestSeller);
  val('productImage', p.image);
  uploadedImages = [];
  if (p.images && p.images.length > 0) {
    uploadedImages = p.images.map(function (url) { return { url: url }; });
  } else if (p.image) {
    uploadedImages = [{ url: p.image }];
  }
  renderImageGallery();
  val('productWarranty', p.warranty);
  val('productReturnPolicy', p.returnPolicy);
  val('productDelivery', p.estimatedDelivery);

  var specContainer = document.getElementById('specificationsEditor');
  specContainer.innerHTML = '';
  if (p.specifications && typeof p.specifications === 'object') {
    var specEntries = Object.entries(p.specifications);
    if (specEntries.length > 0) {
      specEntries.forEach(function (entry) {
        addEditorRow('specificationsEditor', 'key-value', entry[0], entry[1]);
      });
    } else {
      addEditorRow('specificationsEditor', 'key-value');
    }
  } else {
    addEditorRow('specificationsEditor', 'key-value');
  }

  var colorContainer = document.getElementById('colorsEditor');
  colorContainer.innerHTML = '';
  if (p.colors && p.colors.length > 0) {
    p.colors.forEach(function (c) {
      addEditorRow('colorsEditor', 'list', typeof c === 'string' ? c : c.name);
    });
  } else {
    addEditorRow('colorsEditor', 'list');
  }

  var featContainer = document.getElementById('featuresEditor');
  featContainer.innerHTML = '';
  if (p.features && p.features.length > 0) {
    p.features.forEach(function (f) { addEditorRow('featuresEditor', 'list', f); });
  } else {
    addEditorRow('featuresEditor', 'list');
  }

  var storContainer = document.getElementById('storageEditor');
  storContainer.innerHTML = '';
  if (p.storageOptions && p.storageOptions.length > 0) {
    p.storageOptions.forEach(function (s) {
      addEditorRow('storageEditor', 'list', typeof s === 'string' ? s : s.label);
    });
  } else {
    addEditorRow('storageEditor', 'list');
  }
}

function addEditorRow(containerId, type, val1, val2) {
  var container = document.getElementById(containerId);
  if (!container) return;
  var row = document.createElement('div');
  row.className = 'editor-row';
  var removeBtn = '<button type="button" class="btn btn-icon remove-row" aria-label="Remove row"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>';
  if (type === 'key-value') {
    row.innerHTML = '<input type="text" placeholder="Key" class="spec-key" value="' + escapeHtml(val1 || '') + '">' +
      '<input type="text" placeholder="Value" class="spec-value" value="' + escapeHtml(val2 || '') + '">' + removeBtn;
  } else {
    row.innerHTML = '<input type="text" placeholder="Value" class="list-input" value="' + escapeHtml(val1 || '') + '">' + removeBtn;
  }
  container.appendChild(row);
  row.querySelector('.remove-row').addEventListener('click', function () {
    if (container.children.length > 1) row.remove();
  });
}

function deleteProduct(id) {
  if (!confirm('Are you sure you want to delete this product?')) return;
  api('/api/admin/products/' + id, { method: 'DELETE' }).then(function () {
    showToast('Product deleted successfully');
    loadProducts(1, currentProductSearch);
  }).catch(function (err) { showToast(err.message, 'error'); });
}

// ═══════════════════════════════════════════════
// MULTI-IMAGE MANAGEMENT
// ═══════════════════════════════════════════════

var uploadedImages = [];

function renderImageGallery() {
  var gallery = document.getElementById('imageGallery');
  if (!gallery) return;
  if (uploadedImages.length === 0) { gallery.style.display = 'none'; gallery.innerHTML = ''; return; }
  gallery.style.display = 'flex';
  gallery.style.flexWrap = 'wrap';
  gallery.style.gap = '8px';
  gallery.innerHTML = uploadedImages.map(function (img, i) {
    return '<div class="gallery-item" style="position:relative;width:80px;height:80px;border-radius:6px;overflow:hidden;border:2px solid #e0e6f0">' +
      '<img src="' + img.url + '" style="width:100%;height:100%;object-fit:cover" alt="Product image">' +
      '<button type="button" data-action="remove-image" data-index="' + i + '" style="position:absolute;top:2px;right:2px;background:#e53935;color:white;border:none;border-radius:50%;width:20px;height:20px;font-size:12px;cursor:pointer;line-height:1" aria-label="Remove image">&times;</button>' +
      '</div>';
  }).join('');
}

window.removeImage = function (index) {
  var img = uploadedImages[index];
  if (img && img.filename) {
    api('/api/admin/products/images', { method: 'DELETE', body: JSON.stringify({ filename: img.filename, productId: editingProductId }) }).catch(function () {});
  }
  uploadedImages.splice(index, 1);
  renderImageGallery();
  if (uploadedImages.length > 0) {
    document.getElementById('productImage').value = uploadedImages[0].url;
  } else {
    document.getElementById('productImage').value = '';
  }
};

// ═══════════════════════════════════════════════
// CATEGORY MANAGEMENT
// ═══════════════════════════════════════════════

function loadCategories() {
  showPageLoader('categoriesTableBody', 4);
  api('/api/admin/categories').then(function (data) {
    var tbody = document.getElementById('categoriesTableBody');
    if (!data.categories || data.categories.length === 0) { showEmpty('categoriesTableBody', 4, 'No categories found'); return; }
    tbody.innerHTML = data.categories.map(function (c) {
      var displayName = c.name.replace(/_/g, ' ').replace(/\b\w/g, function (l) { return l.toUpperCase(); });
      return '<tr>' +
        '<td><strong>' + escapeHtml(displayName) + '</strong><br><small style="color:#94a3b8">' + escapeHtml(c.name) + '</small></td>' +
        '<td>' + c.count + ' products</td>' +
        '<td>' + (c.brands.length > 0 ? c.brands.slice(0, 3).join(', ') + (c.brands.length > 3 ? ' +' + (c.brands.length - 3) : '') : '<em>None</em>') + '</td>' +
        '<td><button class="btn btn-danger btn-sm" data-action="delete-category" data-category-name="' + escapeHtml(c.name) + '" ' + (c.count > 0 ? 'disabled title="Cannot delete: products exist"' : '') + '>Delete</button></td>' +
        '</tr>';
    }).join('');
  }).catch(function (err) { showEmpty('categoriesTableBody', 4, 'Error loading categories'); });
}

window.showAddCategory = function () {
  var name = prompt('Enter category name (lowercase, underscores for spaces):');
  if (!name) return;
  var slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
  api('/api/admin/categories', { method: 'POST', body: JSON.stringify({ name: slug }) }).then(function () {
    showToast('Category added');
    loadCategories();
  }).catch(function (err) { showToast(err.message, 'error'); });
};

window.deleteCategory = function (name) {
  if (!confirm('Delete category "' + name + '"?')) return;
  api('/api/admin/categories/' + name, { method: 'DELETE' }).then(function () {
    showToast('Category deleted');
    loadCategories();
  }).catch(function (err) { showToast(err.message, 'error'); });
};

// ═══════════════════════════════════════════════
// BRAND MANAGEMENT
// ═══════════════════════════════════════════════

function loadBrands() {
  showPageLoader('brandsTableBody', 4);
  api('/api/admin/brands').then(function (data) {
    var tbody = document.getElementById('brandsTableBody');
    if (!data.brands || data.brands.length === 0) { showEmpty('brandsTableBody', 4, 'No brands found'); return; }
    tbody.innerHTML = data.brands.map(function (b) {
      return '<tr>' +
        '<td><strong>' + escapeHtml(b.name) + '</strong></td>' +
        '<td>' + b.count + ' products</td>' +
        '<td>' + b.categories.map(function (c) { return escapeHtml(c.replace(/_/g, ' ')); }).join(', ') + '</td>' +
        '<td>' +
          '<button class="btn btn-secondary btn-sm" data-action="rename-brand" data-brand-name="' + escapeHtml(b.name).replace(/'/g, "\\'") + '">Rename</button> ' +
          '<button class="btn btn-danger btn-sm" data-action="delete-brand" data-brand-name="' + escapeHtml(b.name).replace(/'/g, "\\'") + '">Remove</button>' +
        '</td>' +
        '</tr>';
    }).join('');
  }).catch(function (err) { showEmpty('brandsTableBody', 4, 'Error loading brands'); });
}

window.renameBrand = function (oldName) {
  var newName = prompt('Rename brand "' + oldName + '" to:', oldName);
  if (!newName || newName === oldName) return;
  api('/api/admin/brands/' + encodeURIComponent(oldName), { method: 'PUT', body: JSON.stringify({ name: newName }) }).then(function (res) {
    showToast('Brand renamed. ' + res.updated + ' products updated.');
    loadBrands();
  }).catch(function (err) { showToast(err.message, 'error'); });
};

window.deleteBrand = function (name) {
  if (!confirm('Remove brand "' + name + '" from all products? Products will have no brand.')) return;
  api('/api/admin/brands/' + encodeURIComponent(name), { method: 'DELETE' }).then(function (res) {
    showToast('Brand removed. ' + res.updated + ' products updated.');
    loadBrands();
  }).catch(function (err) { showToast(err.message, 'error'); });
};

function loadCustomers(page, search) {
  showPageLoader('customersTableBody', 7);
  var params = '?page=' + page + '&limit=10';
  if (search) params += '&search=' + encodeURIComponent(search);
  api('/api/admin/customers' + params).then(function (data) {
    var tbody = document.getElementById('customersTableBody');
    if (!data.customers || data.customers.length === 0) {
      showEmpty('customersTableBody', 7, 'No customers found');
      renderPagination('customersPagination', 0, 1, function () {});
      return;
    }
    tbody.innerHTML = data.customers.map(function (c) {
      return '<tr>' +
        '<td>' + escapeHtml(c.name) + '</td>' +
        '<td>' + escapeHtml(c.email) + '</td>' +
        '<td>' + escapeHtml(c.phone || '-') + '</td>' +
        '<td>' + formatDate(c.createdAt) + '</td>' +
        '<td>' + (c.orderCount || 0) + '</td>' +
        '<td>' + (c.blocked ? '<span class="badge badge-danger">Blocked</span>' : '<span class="badge badge-success">Active</span>') + '</td>' +
        '<td>' +
        '<button class="btn btn-sm btn-icon customer-view-btn" data-id="' + c._id + '" title="View Orders"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button> ' +
        '<button class="btn btn-sm btn-icon ' + (c.blocked ? 'btn-warning' : 'btn-danger') + ' customer-block-btn" data-id="' + c._id + '" title="' + (c.blocked ? 'Unblock' : 'Block') + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">' + (c.blocked ? '<path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="M9 12l2 2 4-4"/>' : '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>') + '</svg></button>' +
        '</td></tr>';
    }).join('');

    renderPagination('customersPagination', data.pages, data.page, function (p) { loadCustomers(p, currentCustomerSearch); });

    tbody.querySelectorAll('.customer-view-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { openCustomerModal(this.getAttribute('data-id')); });
    });
    tbody.querySelectorAll('.customer-block-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { toggleBlockCustomer(this.getAttribute('data-id')); });
    });
  }).catch(function (err) { showEmpty('customersTableBody', 7, 'Error loading customers'); showToast(err.message, 'error'); });
}

function openCustomerModal(customerId) {
  var modal = document.getElementById('customerModal');
  if (!modal) return;
  modal.style.display = 'flex';
  document.getElementById('customerModalName').textContent = 'Loading...';
  document.getElementById('customerModalEmail').textContent = '';
  document.getElementById('customerModalPhone').textContent = '';
  var ordersBody = document.getElementById('customerOrdersBody');
  if (ordersBody) ordersBody.innerHTML = '<tr><td colspan="5" class="no-data">Loading...</td></tr>';

  api('/api/admin/customers/' + customerId).then(function (data) {
    document.getElementById('customerModalName').textContent = data.name || 'Customer';
    document.getElementById('customerModalEmail').textContent = data.email || '';
    document.getElementById('customerModalPhone').textContent = data.phone || '';
    if (ordersBody) {
      if (!data.orders || data.orders.length === 0) {
        ordersBody.innerHTML = '<tr><td colspan="5" class="no-data">No orders found</td></tr>';
      } else {
        ordersBody.innerHTML = data.orders.map(function (o) {
          var itemsSummary = o.items.map(function (i) { return i.name + ' x' + i.quantity; }).join(', ');
          return '<tr>' +
            '<td>' + escapeHtml(o.orderNumber || '-') + '</td>' +
            '<td>' + formatDate(o.createdAt) + '</td>' +
            '<td>' + escapeHtml(itemsSummary.substring(0, 50)) + (itemsSummary.length > 50 ? '...' : '') + '</td>' +
            '<td>' + formatPrice(o.total) + '</td>' +
            '<td>' + orderStatusBadge(o.order_status) + '</td>' +
            '</tr>';
        }).join('');
      }
    }
  }).catch(function (err) {
    document.getElementById('customerModalName').textContent = 'Error loading customer';
    showToast(err.message, 'error');
  });
}

function toggleBlockCustomer(customerId) {
  var msg = 'Are you sure you want to toggle this customer\'s access?';
  if (!confirm(msg)) return;
  api('/api/admin/customers/' + customerId + '/block', { method: 'PATCH' }).then(function (data) {
    showToast(data.blocked ? 'Customer blocked' : 'Customer unblocked');
    loadCustomers(1, currentCustomerSearch);
  }).catch(function (err) { showToast(err.message, 'error'); });
}

var currentOrderData = null;

function loadOrders(page, search, status) {
  showPageLoader('ordersTableBody', 8);
  var params = '?page=' + page + '&limit=10';
  if (search) params += '&search=' + encodeURIComponent(search);
  if (status) params += '&status=' + encodeURIComponent(status);
  var paymentFilter = document.getElementById('paymentStatusFilter');
  if (paymentFilter && paymentFilter.value) params += '&payment_status=' + encodeURIComponent(paymentFilter.value);
  api('/api/admin/orders' + params).then(function (data) {
    var tbody = document.getElementById('ordersTableBody');
    if (!data.orders || data.orders.length === 0) {
      showEmpty('ordersTableBody', 8, 'No orders found');
      renderPagination('ordersPagination', 0, 1, function () {});
      return;
    }
    tbody.innerHTML = data.orders.map(function (o) {
      var itemsSummary = o.items.map(function (i) { return i.name + ' x' + i.quantity; }).join(', ');
      return '<tr>' +
        '<td>' + escapeHtml(o.orderNumber || '-') + '</td>' +
        '<td>' + escapeHtml(o.customer_name || '-') + '</td>' +
        '<td title="' + escapeHtml(itemsSummary) + '">' + escapeHtml(itemsSummary.substring(0, 40)) + (itemsSummary.length > 40 ? '...' : '') + '</td>' +
        '<td>' + formatPrice(o.total) + '</td>' +
        '<td>' + paymentBadge(o.payment_status) + '</td>' +
        '<td>' + orderStatusBadge(o.order_status) + '</td>' +
        '<td>' + formatDate(o.createdAt) + '</td>' +
        '<td><button class="btn btn-sm btn-primary order-view-btn" data-id="' + o._id + '">View</button></td>' +
        '</tr>';
    }).join('');

    renderPagination('ordersPagination', data.pages, data.page, function (p) { loadOrders(p, currentOrderSearch, currentOrderFilter); });

    tbody.querySelectorAll('.order-view-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { openOrderModal(this.getAttribute('data-id')); });
    });
  }).catch(function (err) { showEmpty('ordersTableBody', 8, 'Error loading orders'); showToast(err.message, 'error'); });
}

function openOrderModal(orderId) {
  var modal = document.getElementById('orderModal');
  if (!modal) return;
  modal.style.display = 'flex';
  currentOrderData = null;

  api('/api/admin/orders/' + orderId).then(function (data) {
    currentOrderData = data;
    var setT = function (id, val) { var el = document.getElementById(id); if (el) el.textContent = val; };
    setT('orderDetailNumber', data.orderNumber || '-');
    setT('orderDetailDate', formatDateTime(data.createdAt));
    setT('orderDetailPaymentStatus', data.payment_status || '-');
    setT('orderDetailStatus', data.order_status || '-');
    setT('orderDetailCustomerName', data.customer_name || '-');
    setT('orderDetailCustomerEmail', data.customer_email || '-');
    setT('orderDetailCustomerPhone', data.customer_phone || '-');
    setT('orderDetailAddress', data.delivery_address || '-');
    setT('orderSubtotal', formatPrice(data.subtotal));
    setT('orderDelivery', formatPrice(data.delivery_fee));
    setT('orderTotal', formatPrice(data.total));

    // Tracking number display
    var trackingEl = document.getElementById('orderDetailTracking');
    if (trackingEl) {
      if (data.trackingNumber) {
        trackingEl.textContent = data.trackingNumber;
        trackingEl.parentElement.style.display = '';
      } else {
        trackingEl.parentElement.style.display = 'none';
      }
    }

    var select = document.getElementById('orderStatusSelect');
    if (select) select.value = data.order_status;

    var paySelect = document.getElementById('orderPaymentStatusSelect');
    if (paySelect) paySelect.value = data.payment_status;

    // Show cancel/refund section for non-cancelled orders
    var cancelSection = document.getElementById('cancelRefundSection');
    if (cancelSection) {
      cancelSection.style.display = (data.order_status !== 'cancelled' && data.order_status !== 'delivered') ? 'block' : 'none';
    }

    // Render admin order timeline
    var timelineContainer = document.getElementById('adminOrderTimeline');
    if (timelineContainer) {
      var timelineStatuses = ['pending', 'processing', 'confirmed', 'shipped', 'out_for_delivery', 'delivered'];
      var currentIdx = timelineStatuses.indexOf(data.order_status);
      var isCancelled = data.order_status === 'cancelled';
      var history = data.statusHistory || [];
      var statusLabels = { pending: 'Order Received', processing: 'Payment Confirmed', confirmed: 'Preparing Order', shipped: 'Shipped', out_for_delivery: 'Out for Delivery', delivered: 'Delivered', cancelled: 'Cancelled' };

      timelineContainer.innerHTML = '<div class="admin-timeline">' + timelineStatuses.map(function(s, idx) {
        var entry = history.find(function(h) { return h.status === s; });
        var cls = '';
        if (isCancelled) cls = idx === 0 ? 'completed' : '';
        else if (idx < currentIdx) cls = 'completed';
        else if (idx === currentIdx) cls = 'active';
        var date = entry ? new Date(entry.timestamp).toLocaleString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        return '<div class="admin-timeline-item ' + cls + '"><div class="admin-timeline-dot"></div><div class="admin-timeline-info"><span class="admin-timeline-label">' + (statusLabels[s] || s) + '</span>' + (date ? '<span class="admin-timeline-date">' + date + '</span>' : '') + '</div></div>';
      }).join('') + (isCancelled ? '<div class="admin-timeline-item cancelled"><div class="admin-timeline-dot"></div><div class="admin-timeline-info"><span class="admin-timeline-label" style="color:#c62828">Cancelled</span></div></div>' : '') + '</div>';
    }

    // Clear note input
    var noteInput = document.getElementById('orderStatusNote');
    if (noteInput) noteInput.value = '';

    var itemsBody = document.getElementById('orderItemsBody');
    if (itemsBody) {
      if (!data.items || data.items.length === 0) {
        itemsBody.innerHTML = '<tr><td colspan="4" class="no-data">No items</td></tr>';
      } else {
        itemsBody.innerHTML = data.items.map(function (item) {
          return '<tr>' +
            '<td>' + escapeHtml(item.name || '-') + '</td>' +
            '<td>' + item.quantity + '</td>' +
            '<td>' + formatPrice(item.price) + '</td>' +
            '<td>' + formatPrice(item.price * item.quantity) + '</td>' +
            '</tr>';
        }).join('');
      }
    }
  }).catch(function (err) { showToast(err.message, 'error'); });
}

function loadInventory() {
  showPageLoader('inventoryTableBody', 5);
  api('/api/admin/inventory').then(function (result) {
    var tbody = document.getElementById('inventoryTableBody');
    var data = result.products || result;
    if (!data || data.length === 0) {
      showEmpty('inventoryTableBody', 5, 'No inventory data');
      return;
    }
    tbody.innerHTML = data.map(function (p) {
      return '<tr>' +
        '<td>' + escapeHtml(p.name) + '</td>' +
        '<td>' + escapeHtml(p.category) + '</td>' +
        '<td style="' + stockColor(p.stock) + '">' + p.stock + '</td>' +
        '<td>' + stockStatusLabel(p.stock) + '</td>' +
        '<td><div style="display:flex;gap:6px;align-items:center">' +
        '<input type="number" min="0" value="' + p.stock + '" class="form-input stock-input" data-id="' + p._id + '" style="width:80px;padding:4px 8px;border:1px solid var(--border-color, #e2e8f0);border-radius:4px">' +
        '<button class="btn btn-sm btn-primary stock-save-btn" data-id="' + p._id + '">Save</button>' +
        '</div></td>' +
        '</tr>';
    }).join('');

    tbody.querySelectorAll('.stock-save-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = this.getAttribute('data-id');
        var input = tbody.querySelector('.stock-input[data-id="' + id + '"]');
        var newStock = parseInt(input.value);
        if (isNaN(newStock) || newStock < 0) { showToast('Invalid stock value', 'error'); return; }
        api('/api/admin/inventory/' + id + '/stock', {
          method: 'PATCH',
          body: JSON.stringify({ stock: newStock })
        }).then(function () {
          showToast('Stock updated successfully');
          loadInventory();
        }).catch(function (err) { showToast(err.message, 'error'); });
      });
    });
  }).catch(function (err) { showEmpty('inventoryTableBody', 5, 'Error loading inventory'); showToast(err.message, 'error'); });
}

function loadReports(period) {
  period = period || 'monthly';
  api('/api/admin/reports/sales?period=' + period).then(function (data) {
    var totalSales = 0;
    var totalOrdersCount = 0;
    var avgOrderValue = 0;
    if (data && data.length > 0) {
      totalSales = data.reduce(function (s, d) { return s + (d.revenue || 0); }, 0);
      totalOrdersCount = data.reduce(function (s, d) { return s + (d.orders || 0); }, 0);
      avgOrderValue = totalOrdersCount > 0 ? Math.round(totalSales / totalOrdersCount) : 0;
    }
    var setT = function (id, val) { var el = document.getElementById(id); if (el) el.textContent = val; };
    setT('reportTotalSales', formatPrice(totalSales));
    setT('reportTotalOrders', totalOrdersCount);
    setT('reportAvgOrderValue', formatPrice(avgOrderValue));

    renderSalesChart('reportSalesChart', data || [], 'reportSales');
  }).catch(function (err) { showToast(err.message, 'error'); });

  api('/api/admin/reports/top-products').then(function (data) {
    var tbody = document.getElementById('topProductsBody');
    if (!tbody) return;
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="no-data">No data available</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(function (p) {
      return '<tr>' +
        '<td>' + escapeHtml(p.name || '-') + '</td>' +
        '<td>' + (p.totalQuantity || 0) + '</td>' +
        '<td>' + formatPrice(p.totalRevenue) + '</td>' +
        '</tr>';
    }).join('');
  }).catch(function () {});

  api('/api/admin/reports/best-customers').then(function (data) {
    var tbody = document.getElementById('bestCustomersBody');
    if (!tbody) return;
    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="no-data">No data available</td></tr>';
      return;
    }
    tbody.innerHTML = data.map(function (c) {
      return '<tr>' +
        '<td>' + escapeHtml(c.name || c.email || '-') + '</td>' +
        '<td>' + (c.totalOrders || 0) + '</td>' +
        '<td>' + formatPrice(c.totalSpent) + '</td>' +
        '</tr>';
    }).join('');
  }).catch(function () {});
}

function loadSettings() {
  api('/api/admin/settings').then(function (data) {
    var val = function (id, v) { var el = document.getElementById(id); if (el) el.value = v || ''; };
    val('storeName', data.store_name);
    val('storePhone', data.phone);
    val('storeEmail', data.email);
    val('storeAddress', data.address);
    val('storeWhatsApp', data.whatsapp);
    if (data.social_media) {
      val('facebookUrl', data.social_media.facebook);
      val('instagramUrl', data.social_media.instagram);
      val('twitterUrl', data.social_media.twitter);
      val('tiktokUrl', data.social_media.tiktok);
    }
    val('deliveryFee', data.delivery_fee != null ? data.delivery_fee : '');
    val('freeDeliveryThreshold', data.free_delivery_threshold != null ? data.free_delivery_threshold : (data.free_threshold != null ? data.free_threshold : ''));
  }).catch(function (err) { showToast(err.message, 'error'); });
}

function saveSettings() {
  var getVal = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
  var payload = {
    store_name: getVal('storeName'),
    phone: getVal('storePhone'),
    email: getVal('storeEmail'),
    address: getVal('storeAddress'),
    whatsapp: getVal('storeWhatsApp'),
    social_media: {
      facebook: getVal('facebookUrl'),
      instagram: getVal('instagramUrl'),
      twitter: getVal('twitterUrl'),
      tiktok: getVal('tiktokUrl')
    }
  };
  var deliveryFee = getVal('deliveryFee');
  var freeThreshold = getVal('freeDeliveryThreshold');
  if (deliveryFee !== '') payload.delivery_fee = Number(deliveryFee);
  if (freeThreshold !== '') payload.free_delivery_threshold = Number(freeThreshold);

  var saveBtn = document.getElementById('saveSettingsBtn');
  showLoading(saveBtn, true);

  api('/api/admin/settings', {
    method: 'PUT',
    body: JSON.stringify(payload)
  }).then(function () {
    showToast('Settings saved successfully');
    showLoading(saveBtn, false);
  }).catch(function (err) {
    showToast(err.message, 'error');
    showLoading(saveBtn, false);
  });
}

document.addEventListener('DOMContentLoaded', function () {
  if (token) {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('adminLayout').style.display = 'flex';
    init();
  }

  var savedDark = localStorage.getItem('dark_mode');
  if (savedDark === 'true') {
    document.body.classList.add('dark-mode');
    var moonIcon = document.querySelector('.moon-icon');
    var sunIcon = document.querySelector('.sun-icon');
    if (moonIcon) moonIcon.style.display = '';
    if (sunIcon) sunIcon.style.display = 'none';
  }

  var loginForm = document.getElementById('loginForm');
  if (loginForm) loginForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = document.getElementById('loginEmail').value.trim();
    var password = document.getElementById('loginPassword').value;
    var errorEl = document.getElementById('loginError');
    var submitBtn = this.querySelector('button[type="submit"]');

    if (!email || !password) { if (errorEl) { errorEl.textContent = 'Please fill in all fields'; errorEl.style.display = 'block'; } return; }

    showLoading(submitBtn, true);
    if (errorEl) errorEl.style.display = 'none';

    fetch(API + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    }).then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (result) {
        showLoading(submitBtn, false);
        if (!result.ok) {
          if (errorEl) { errorEl.textContent = result.data.error || 'Invalid credentials'; errorEl.style.display = 'block'; }
          return;
        }
        if (result.data.user.role !== 'admin') {
          if (errorEl) { errorEl.textContent = 'Access denied. Admin account required.'; errorEl.style.display = 'block'; }
          return;
        }
        token = result.data.token;
        localStorage.setItem('dg_token', token);
        currentUser = result.data.user;
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('adminLayout').style.display = 'flex';
        init();
      }).catch(function (err) {
        showLoading(submitBtn, false);
        if (errorEl) { errorEl.textContent = 'Connection error. Please try again.'; errorEl.style.display = 'block'; }
      });
  });

  var logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', function () {
    logout();
  });

  document.querySelectorAll('.nav-link').forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      var page = this.getAttribute('data-page');
      if (page) navigateTo(page);
    });
  });

  var notificationBtn = document.getElementById('notificationBtn');
  if (notificationBtn) notificationBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    var dropdown = document.getElementById('notificationDropdown');
    if (!dropdown) return;
    var isOpen = dropdown.style.display !== 'none';
    dropdown.style.display = isOpen ? 'none' : '';
    if (!isOpen) loadNotifications();
  });

  // Close notification dropdown when clicking outside
  document.addEventListener('click', function (e) {
    var dropdown = document.getElementById('notificationDropdown');
    var btn = document.getElementById('notificationBtn');
    if (dropdown && !dropdown.contains(e.target) && btn && !btn.contains(e.target)) {
      dropdown.style.display = 'none';
    }
  });

  var sidebarToggle = document.getElementById('sidebarToggle');
  if (sidebarToggle) sidebarToggle.addEventListener('click', function () {
    var sidebar = document.getElementById('sidebar');
    var overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.toggle('open');
    if (overlay) overlay.classList.toggle('active');
  });

  var sidebarOverlay = document.getElementById('sidebarOverlay');
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', function () {
      var sidebar = document.getElementById('sidebar');
      if (sidebar) sidebar.classList.remove('open');
      this.classList.remove('active');
    });
  }

  var darkModeToggle = document.getElementById('darkModeToggle');
  if (darkModeToggle) darkModeToggle.addEventListener('click', function () {
    document.body.classList.toggle('dark-mode');
    var isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('dark_mode', isDark);
    var moonIcon = document.querySelector('.moon-icon');
    var sunIcon = document.querySelector('.sun-icon');
    if (moonIcon) moonIcon.style.display = isDark ? '' : 'none';
    if (sunIcon) sunIcon.style.display = isDark ? 'none' : '';
    if (currentPage === 'dashboard') loadDashboard();
    if (currentPage === 'reports') loadReports(document.getElementById('reportPeriod').value);
  });

  var productSearch = document.getElementById('productSearch');
  if (productSearch) productSearch.addEventListener('input', debounce(function () {
    currentProductSearch = this.value.trim();
    loadProducts(1, currentProductSearch);
  }, 300));

  var customerSearch = document.getElementById('customerSearch');
  if (customerSearch) customerSearch.addEventListener('input', debounce(function () {
    currentCustomerSearch = this.value.trim();
    loadCustomers(1, currentCustomerSearch);
  }, 300));

  var orderSearch = document.getElementById('orderSearch');
  if (orderSearch) orderSearch.addEventListener('input', debounce(function () {
    currentOrderSearch = this.value.trim();
    loadOrders(1, currentOrderSearch, currentOrderFilter);
  }, 300));

  document.querySelectorAll('.filter-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      document.querySelectorAll('.filter-tab').forEach(function (t) { t.classList.remove('active'); });
      this.classList.add('active');
      currentOrderFilter = this.getAttribute('data-status');
      if (currentOrderFilter === 'all') currentOrderFilter = '';
      loadOrders(1, currentOrderSearch, currentOrderFilter);
    });
  });

  var addProductBtn = document.getElementById('addProductBtn');
  if (addProductBtn) addProductBtn.addEventListener('click', function () {
    openProductModal(null);
  });

  var productModal = document.getElementById('productModal');
  if (productModal) {
    var pmClose = productModal.querySelector('.modal-close');
    if (pmClose) pmClose.addEventListener('click', function () {
      productModal.style.display = 'none';
    });
    var pmCancel = productModal.querySelector('.cancel-btn');
    if (pmCancel) pmCancel.addEventListener('click', function () {
      productModal.style.display = 'none';
    });
    var pmOverlay = productModal.querySelector('.modal-overlay');
    if (pmOverlay) pmOverlay.addEventListener('click', function () {
      productModal.style.display = 'none';
    });
  }

  var customerModal = document.getElementById('customerModal');
  if (customerModal) {
    var cmClose = customerModal.querySelector('.modal-close');
    if (cmClose) cmClose.addEventListener('click', function () {
      customerModal.style.display = 'none';
    });
    var cmCancel = customerModal.querySelector('.cancel-btn');
    if (cmCancel) cmCancel.addEventListener('click', function () {
      customerModal.style.display = 'none';
    });
    var cmOverlay = customerModal.querySelector('.modal-overlay');
    if (cmOverlay) cmOverlay.addEventListener('click', function () {
      customerModal.style.display = 'none';
    });
  }

  var orderModal = document.getElementById('orderModal');
  if (orderModal) {
    var omClose = orderModal.querySelector('.modal-close');
    if (omClose) omClose.addEventListener('click', function () {
      orderModal.style.display = 'none';
    });
    var omCancel = orderModal.querySelector('.cancel-btn');
    if (omCancel) omCancel.addEventListener('click', function () {
      orderModal.style.display = 'none';
    });
    var omOverlay = orderModal.querySelector('.modal-overlay');
    if (omOverlay) omOverlay.addEventListener('click', function () {
      orderModal.style.display = 'none';
    });
  }

  var updateOrderStatusBtn = document.getElementById('updateOrderStatusBtn');
  if (updateOrderStatusBtn) updateOrderStatusBtn.addEventListener('click', function () {
    if (!currentOrderData) return;
    var select = document.getElementById('orderStatusSelect');
    var noteInput = document.getElementById('orderStatusNote');
    var newStatus = select.value;
    var note = noteInput ? noteInput.value.trim() : '';
    api('/api/admin/orders/' + currentOrderData._id + '/status', {
      method: 'PATCH',
      body: JSON.stringify({ order_status: newStatus, note: note || undefined })
    }).then(function (result) {
      showToast('Order status updated');
      currentOrderData.order_status = newStatus;
      var statusEl = document.getElementById('orderDetailStatus');
      if (statusEl) statusEl.textContent = newStatus;
      if (noteInput) noteInput.value = '';
      loadOrders(1, currentOrderSearch, currentOrderFilter);
      openOrderModal(currentOrderData._id);
    }).catch(function (err) { showToast(err.message, 'error'); });
  });

  var updatePaymentStatusBtn = document.getElementById('updatePaymentStatusBtn');
  if (updatePaymentStatusBtn) updatePaymentStatusBtn.addEventListener('click', function () {
    if (!currentOrderData) return;
    var paySelect = document.getElementById('orderPaymentStatusSelect');
    var refInput = document.getElementById('paymentRefInput');
    var newPayStatus = paySelect.value;
    var payRef = refInput ? refInput.value.trim() : '';
    api('/api/admin/orders/' + currentOrderData._id + '/payment', {
      method: 'PATCH',
      body: JSON.stringify({ payment_status: newPayStatus, payment_ref: payRef || undefined })
    }).then(function (result) {
      showToast('Payment status updated');
      currentOrderData.payment_status = newPayStatus;
      var payEl = document.getElementById('orderDetailPaymentStatus');
      if (payEl) payEl.innerHTML = paymentBadge(newPayStatus);
      if (refInput) refInput.value = '';
      loadOrders(1, currentOrderSearch, currentOrderFilter);
    }).catch(function (err) { showToast(err.message, 'error'); });
  });

  var printInvoiceBtn = document.getElementById('printInvoiceBtn');
  if (printInvoiceBtn) printInvoiceBtn.addEventListener('click', function () {
    if (!currentOrderData) return;
    var o = currentOrderData;
    var itemsHtml = o.items.map(function (item) {
      return '<tr><td>' + escapeHtml(item.name) + '</td><td style="text-align:center">' + item.quantity + '</td><td style="text-align:right">' + formatPrice(item.price) + '</td><td style="text-align:right">' + formatPrice(item.price * item.quantity) + '</td></tr>';
    }).join('');

    var discount = o.discount || 0;
    var paymentMethod = o.payment_method ? o.payment_method.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }) : 'N/A';

    var printWindow = window.open('', '_blank');
    printWindow.document.write('<!DOCTYPE html><html><head><title>Invoice ' + escapeHtml(o.orderNumber) + '</title><style>');
    printWindow.document.write('body{font-family:Poppins,Arial,sans-serif;padding:40px;color:#333;margin:0}');
    printWindow.document.write('.invoice-container{max-width:800px;margin:0 auto}');
    printWindow.document.write('.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:30px;border-bottom:3px solid #0f2c56;padding-bottom:20px}');
    printWindow.document.write('.brand{display:flex;align-items:center;gap:12px}');
    printWindow.document.write('.brand-icon{width:48px;height:48px;background:linear-gradient(135deg,#0f2c56,#3da7ff);border-radius:12px;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:18px}');
    printWindow.document.write('.brand h1{color:#0f2c56;margin:0;font-size:22px}');
    printWindow.document.write('.brand p{color:#64748b;margin:2px 0 0;font-size:12px}');
    printWindow.document.write('.invoice-badge{background:#0f2c56;color:white;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em}');
    printWindow.document.write('.meta{text-align:right}');
    printWindow.document.write('.meta p{margin:4px 0;font-size:13px;color:#64748b}');
    printWindow.document.write('.meta strong{color:#333}');
    printWindow.document.write('.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:25px}');
    printWindow.document.write('.info-box{background:#f8fafc;padding:16px;border-radius:8px;border:1px solid #e2e8f0}');
    printWindow.document.write('.info-box h4{margin:0 0 8px;color:#0f2c56;font-size:13px;text-transform:uppercase;letter-spacing:0.05em}');
    printWindow.document.write('.info-box p{margin:3px 0;font-size:13px;color:#475569}');
    printWindow.document.write('table{width:100%;border-collapse:collapse;margin:20px 0}');
    printWindow.document.write('th,td{border:1px solid #e2e8f0;padding:10px 12px}');
    printWindow.document.write('th{background:#0f2c56;color:white;font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:0.05em}');
    printWindow.document.write('td{font-size:13px}');
    printWindow.document.write('tbody tr:nth-child(even){background:#f8fafc}');
    printWindow.document.write('.summary-section{display:flex;justify-content:flex-end;margin-top:20px}');
    printWindow.document.write('.summary-table{width:300px}');
    printWindow.document.write('.summary-table p{display:flex;justify-content:space-between;margin:6px 0;font-size:13px;color:#475569}');
    printWindow.document.write('.summary-table .total-row{border-top:2px solid #0f2c56;padding-top:8px;margin-top:8px}');
    printWindow.document.write('.summary-table .total-row p{font-size:16px;font-weight:700;color:#0f2c56}');
    printWindow.document.write('.footer{margin-top:40px;text-align:center;padding-top:20px;border-top:1px solid #e2e8f0}');
    printWindow.document.write('.footer p{margin:4px 0;color:#94a3b8;font-size:11px}');
    printWindow.document.write('.footer .tagline{color:#0f2c56;font-weight:600;font-size:13px}');
    printWindow.document.write('@media print{body{padding:20px}}');
    printWindow.document.write('</style></head><body>');
    printWindow.document.write('<div class="invoice-container">');
    printWindow.document.write('<div class="header"><div class="brand"><div class="brand-icon">DG</div><div><h1>DG Electronics</h1><p>Quality Electronics at Best Prices</p></div></div><div style="text-align:right"><div class="invoice-badge">Invoice</div><div class="meta" style="margin-top:10px"><p><strong>Order:</strong> ' + escapeHtml(o.orderNumber) + '</p><p><strong>Date:</strong> ' + formatDate(o.createdAt) + '</p>' + (o.trackingNumber ? '<p><strong>Tracking:</strong> ' + escapeHtml(o.trackingNumber) + '</p>' : '') + '</div></div></div>');
    printWindow.document.write('<div class="info-grid"><div class="info-box"><h4>Bill To</h4><p><strong>' + escapeHtml(o.customer_name) + '</strong></p><p>' + escapeHtml(o.customer_email) + '</p><p>' + escapeHtml(o.customer_phone) + '</p><p>' + escapeHtml(o.delivery_address) + '</p></div>');
    printWindow.document.write('<div class="info-box"><h4>Payment Details</h4><p><strong>Method:</strong> ' + paymentMethod + '</p><p><strong>Status:</strong> ' + (o.payment_status || 'Pending').toUpperCase() + '</p>' + (o.payment_ref ? '<p><strong>Ref:</strong> ' + escapeHtml(o.payment_ref) + '</p>' : '') + (o.paidAt ? '<p><strong>Paid:</strong> ' + formatDateTime(o.paidAt) + '</p>' : '') + (o.carrier ? '<p><strong>Carrier:</strong> ' + escapeHtml(o.carrier) + '</p>' : '') + '</div></div>');
    printWindow.document.write('<table><thead><tr><th>Product</th><th style="text-align:center">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Total</th></tr></thead><tbody>' + itemsHtml + '</tbody></table>');
    printWindow.document.write('<div class="summary-section"><div class="summary-table"><p><span>Subtotal:</span><span>' + formatPrice(o.subtotal) + '</span></p><p><span>Delivery:</span><span>' + formatPrice(o.delivery_fee) + '</span></p>');
    if (discount > 0) printWindow.document.write('<p><span>Discount:</span><span style="color:#10b981">-' + formatPrice(discount) + '</span></p>');
    printWindow.document.write('<div class="total-row"><p><span>Total:</span><span>' + formatPrice(o.total) + '</span></p></div></div></div>');
    printWindow.document.write('<div class="footer"><p class="tagline">Thank you for your purchase!</p><p>DG Electronics - Oyigbo, Rivers State, Nigeria</p><p>+234 (903) 135-5560 | danielokolie764@gmail.com</p><p>This is a computer-generated invoice.</p></div>');
    printWindow.document.write('</div></body></html>');
    printWindow.document.close();
    printWindow.print();
  });

  var productForm = document.getElementById('productForm');
  if (productForm) productForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var id = editingProductId;
    var name = document.getElementById('productName').value.trim();
    var slug = document.getElementById('productSlug').value.trim();
    var category = document.getElementById('productCategory').value;
    var brand = document.getElementById('productBrand').value.trim();
    var price = parseFloat(document.getElementById('productPrice').value);
    var oldPrice = parseFloat(document.getElementById('productOldPrice').value) || 0;
    var description = document.getElementById('productDescription').value.trim();
    var stock = parseInt(document.getElementById('productStock').value) || 0;
    var badge = document.getElementById('productBadge').value || null;
    var featured = document.getElementById('productFeatured').checked;
    var bestSeller = document.getElementById('productBestSeller').checked;
    var image = document.getElementById('productImage').value.trim();
    var warranty = document.getElementById('productWarranty').value.trim();
    var returnPolicy = document.getElementById('productReturnPolicy').value.trim();
    var estimatedDelivery = document.getElementById('productDelivery').value.trim();

    if (!name) { showToast('Product name is required', 'error'); return; }
    if (!category) { showToast('Category is required', 'error'); return; }
    if (!brand) { showToast('Brand is required', 'error'); return; }
    if (isNaN(price) || price <= 0) { showToast('Valid price is required', 'error'); return; }

    if (!slug) slug = generateSlug(name);

    var specifications = {};
    var specRows = document.getElementById('specificationsEditor').querySelectorAll('.editor-row');
    specRows.forEach(function (row) {
      var key = row.querySelector('.spec-key').value.trim();
      var val = row.querySelector('.spec-value').value.trim();
      if (key && val) specifications[key] = val;
    });

    var colors = [];
    var colorRows = document.getElementById('colorsEditor').querySelectorAll('.editor-row');
    colorRows.forEach(function (row) {
      var input = row.querySelector('.list-input');
      var v = input ? input.value.trim() : '';
      if (v) colors.push({ name: v, hex: '' });
    });

    var features = [];
    var featRows = document.getElementById('featuresEditor').querySelectorAll('.editor-row');
    featRows.forEach(function (row) {
      var input = row.querySelector('.list-input');
      var v = input ? input.value.trim() : '';
      if (v) features.push(v);
    });

    var storageOptions = [];
    var storRows = document.getElementById('storageEditor').querySelectorAll('.editor-row');
    storRows.forEach(function (row) {
      var input = row.querySelector('.list-input');
      var v = input ? input.value.trim() : '';
      if (v) storageOptions.push({ label: v, price: price });
    });

    var payload = {
      name: name, slug: slug, category: category, brand: brand,
      price: price, oldPrice: oldPrice, description: description,
      stock: stock, badge: badge, featured: featured, bestSeller: bestSeller,
      image: image, images: uploadedImages.map(function (img) { return img.url; }),
      warranty: warranty, returnPolicy: returnPolicy,
      estimatedDelivery: estimatedDelivery, specifications: specifications,
      colors: colors, features: features, storageOptions: storageOptions
    };

    var saveBtn = this.querySelector('button[type="submit"]');
    showLoading(saveBtn, true);

    var promise;
    if (id) {
      promise = api('/api/admin/products/' + id, { method: 'PUT', body: JSON.stringify(payload) });
    } else {
      promise = api('/api/admin/products', { method: 'POST', body: JSON.stringify(payload) });
    }

    promise.then(function () {
      showLoading(saveBtn, false);
      document.getElementById('productModal').style.display = 'none';
      uploadedImages = [];
      renderImageGallery();
      showToast(id ? 'Product updated successfully' : 'Product created successfully');
      loadProducts(1, currentProductSearch);
    }).catch(function (err) {
      showLoading(saveBtn, false);
      showToast(err.message, 'error');
    });
  });

  var productNameInput = document.getElementById('productName');
  if (productNameInput) productNameInput.addEventListener('input', function () {
    var slugField = document.getElementById('productSlug');
    if (slugField && !slugField.dataset.manual) {
      slugField.value = generateSlug(this.value);
    }
  });

  var productSlugInput = document.getElementById('productSlug');
  if (productSlugInput) productSlugInput.addEventListener('input', function () {
    this.dataset.manual = 'true';
  });

  document.querySelectorAll('.add-row-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = this.getAttribute('data-target');
      if (target === 'specificationsEditor') addEditorRow('specificationsEditor', 'key-value');
      else if (target === 'colorsEditor') addEditorRow('colorsEditor', 'list');
      else if (target === 'featuresEditor') addEditorRow('featuresEditor', 'list');
      else if (target === 'storageEditor') addEditorRow('storageEditor', 'list');
    });
  });

  var reportPeriod = document.getElementById('reportPeriod');
  if (reportPeriod) reportPeriod.addEventListener('change', function () {
    loadReports(this.value);
  });

  var dashboardChartPeriod = document.getElementById('dashboardChartPeriod');
  if (dashboardChartPeriod) dashboardChartPeriod.addEventListener('change', function () {
    var period = this.value;
    api('/api/admin/sales-chart?period=' + period).then(function (data) {
      renderSalesChart('salesChart', data || [], 'dashboardSales');
    }).catch(function () {});
  });

  var saveSettingsBtn = document.getElementById('saveSettingsBtn');
  if (saveSettingsBtn) saveSettingsBtn.addEventListener('click', function () {
    saveSettings();
  });

  var uploadImageBtn = document.getElementById('uploadImageBtn');
  if (uploadImageBtn) uploadImageBtn.addEventListener('click', function () {
    document.getElementById('imageFileInput').click();
  });

  var imageFileInput = document.getElementById('imageFileInput');
  if (imageFileInput) imageFileInput.addEventListener('change', function () {
    var files = this.files;
    if (!files || files.length === 0) return;
    var uploadBtn = document.getElementById('uploadImageBtn');
    var origText = uploadBtn.textContent;
    uploadBtn.textContent = 'Uploading...';
    uploadBtn.disabled = true;
    var formData = new FormData();
    for (var i = 0; i < files.length; i++) { formData.append('images', files[i]); }
    fetch(API + '/api/admin/products/upload', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token },
      body: formData
    }).then(function (res) { return res.json(); })
      .then(function (result) {
        uploadBtn.textContent = origText;
        uploadBtn.disabled = false;
        if (result.success && result.files && result.files.length > 0) {
          result.files.forEach(function (f) { uploadedImages.push(f); });
          renderImageGallery();
          document.getElementById('productImage').value = uploadedImages[0].url;
          showToast(result.files.length + ' image(s) uploaded');
        } else {
          showToast(result.error || 'Upload failed', 'error');
        }
      }).catch(function (err) {
        uploadBtn.textContent = origText;
        uploadBtn.disabled = false;
        showToast('Upload failed', 'error');
      });
    this.value = '';
  });

  var toastClose = document.querySelector('.toast-close');
  if (toastClose) {
    toastClose.addEventListener('click', function () {
      var toast = document.getElementById('toast');
      if (toast) { toast.className = 'toast'; toast.style.display = 'none'; }
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var modals = ['productModal', 'customerModal', 'orderModal', 'promotionModal', 'couponModal', 'campaignModal', 'ticketModal', 'returnModal'];
      modals.forEach(function (id) {
        var m = document.getElementById(id);
        if (m && m.style.display !== 'none') m.style.display = 'none';
      });
      var sidebar = document.getElementById('sidebar');
      var overlay = document.getElementById('sidebarOverlay');
      if (sidebar && sidebar.classList.contains('open')) {
        sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('active');
      }
    }
  });

  document.querySelectorAll('#storeSettingsForm, #socialMediaForm, #deliverySettingsForm').forEach(function (form) {
    form.addEventListener('submit', function (e) { e.preventDefault(); });
  });

  // ── CSP-Safe Event Delegation for admin.html ──
  document.body.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    switch (action) {
      case 'mark-all-notifications-read': e.preventDefault(); if (typeof markAllNotificationsRead === 'function') markAllNotificationsRead(); break;
      case 'show-add-category': e.preventDefault(); if (typeof showAddCategory === 'function') showAddCategory(); break;
      case 'export-orders-csv': e.preventDefault(); if (typeof exportOrdersCSV === 'function') exportOrdersCSV(); break;
      case 'show-create-promotion': e.preventDefault(); if (typeof showCreatePromotion === 'function') showCreatePromotion(); break;
      case 'close-promotion-modal': e.preventDefault(); if (typeof closePromotionModal === 'function') closePromotionModal(); break;
      case 'save-promotion': e.preventDefault(); if (typeof savePromotion === 'function') savePromotion(); break;
      case 'show-create-coupon': e.preventDefault(); if (typeof showCreateCoupon === 'function') showCreateCoupon(); break;
      case 'close-coupon-modal': e.preventDefault(); if (typeof closeCouponModal === 'function') closeCouponModal(); break;
      case 'save-coupon': e.preventDefault(); if (typeof saveCoupon === 'function') saveCoupon(); break;
      case 'show-send-campaign': e.preventDefault(); if (typeof showSendCampaign === 'function') showSendCampaign(); break;
      case 'close-campaign-modal': e.preventDefault(); if (typeof closeCampaignModal === 'function') closeCampaignModal(); break;
      case 'send-campaign': e.preventDefault(); if (typeof sendCampaign === 'function') sendCampaign(); break;
      case 'close-ticket-modal': e.preventDefault(); if (typeof closeTicketModal === 'function') closeTicketModal(); break;
      case 'update-ticket-status': e.preventDefault(); if (typeof updateTicketStatus === 'function') updateTicketStatus(); break;
      case 'reply-to-ticket': e.preventDefault(); if (typeof replyToTicket === 'function') replyToTicket(); break;
      case 'close-return-modal': e.preventDefault(); if (typeof closeReturnModal === 'function') closeReturnModal(); break;
      case 'update-return-status': e.preventDefault(); if (typeof updateReturnStatus === 'function') updateReturnStatus(btn.getAttribute('data-status')); break;
      case 'admin-cancel-refund': e.preventDefault(); if (typeof window.adminCancelRefund === 'function') window.adminCancelRefund(); break;
      case 'mark-notification-read': e.preventDefault(); if (typeof markNotificationRead === 'function') markNotificationRead(btn.getAttribute('data-notification-id')); break;
      case 'remove-image': e.preventDefault(); if (typeof removeImage === 'function') removeImage(parseInt(btn.getAttribute('data-index'))); break;
      case 'delete-category': e.preventDefault(); if (typeof deleteCategory === 'function') deleteCategory(btn.getAttribute('data-category-name')); break;
      case 'rename-brand': e.preventDefault(); if (typeof renameBrand === 'function') renameBrand(btn.getAttribute('data-brand-name')); break;
      case 'delete-brand': e.preventDefault(); if (typeof deleteBrand === 'function') deleteBrand(btn.getAttribute('data-brand-name')); break;
      case 'edit-promotion': e.preventDefault(); if (typeof editPromotion === 'function') editPromotion(btn.getAttribute('data-promotion-id')); break;
      case 'toggle-promotion': e.preventDefault(); if (typeof togglePromotion === 'function') togglePromotion(btn.getAttribute('data-promotion-id')); break;
      case 'delete-promotion': e.preventDefault(); if (typeof deletePromotion === 'function') deletePromotion(btn.getAttribute('data-promotion-id')); break;
      case 'edit-coupon': e.preventDefault(); if (typeof editCoupon === 'function') editCoupon(btn.getAttribute('data-coupon-id')); break;
      case 'toggle-coupon': e.preventDefault(); if (typeof toggleCoupon === 'function') toggleCoupon(btn.getAttribute('data-coupon-id')); break;
      case 'delete-coupon': e.preventDefault(); if (typeof deleteCoupon === 'function') deleteCoupon(btn.getAttribute('data-coupon-id')); break;
      case 'delete-subscriber': e.preventDefault(); if (typeof deleteSubscriber === 'function') deleteSubscriber(btn.getAttribute('data-subscriber-id')); break;
      case 'delete-admin-review': e.preventDefault(); if (typeof deleteAdminReview === 'function') deleteAdminReview(btn.getAttribute('data-review-id')); break;
      case 'load-admin-reviews': e.preventDefault(); if (typeof loadAdminReviews === 'function') loadAdminReviews(parseInt(btn.getAttribute('data-page'))); break;
      case 'open-ticket-detail': e.preventDefault(); if (typeof openTicketDetail === 'function') openTicketDetail(btn.getAttribute('data-ticket-number')); break;
      case 'load-admin-tickets': e.preventDefault(); if (typeof loadAdminTickets === 'function') loadAdminTickets(parseInt(btn.getAttribute('data-page'))); break;
      case 'open-return-detail': e.preventDefault(); if (typeof openReturnDetail === 'function') openReturnDetail(btn.getAttribute('data-return-id')); break;
      case 'load-admin-returns': e.preventDefault(); if (typeof loadAdminReturns === 'function') loadAdminReturns(parseInt(btn.getAttribute('data-page'))); break;
      case 'open-admin-chat': e.preventDefault(); if (typeof openAdminChat === 'function') openAdminChat(btn.getAttribute('data-session-id')); break;
      case 'close-admin-chat': e.preventDefault(); if (typeof closeAdminChatSession === 'function') closeAdminChatSession(btn.getAttribute('data-session-id')); break;
      case 'admin-chat-send': e.preventDefault(); if (typeof sendAdminChatReply === 'function') sendAdminChatReply(); break;
      default: break;
    }
  });

  document.body.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      var btn = e.target.closest('[data-action="admin-chat-send"]');
      if (btn) { e.preventDefault(); if (typeof sendAdminChatReply === 'function') sendAdminChatReply(); }
    }
  });
});

// ═══════════════════════════════════════════════
// PROMOTIONS MANAGEMENT
// ═══════════════════════════════════════════════

function loadPromotions(page) {
  page = page || 1;
  api('/api/admin/promotions?page=' + page + '&limit=20').then(function (data) {
    var tbody = document.getElementById('promotionsTableBody');
    if (!tbody) return;
    if (!data.promotions || data.promotions.length === 0) { tbody.innerHTML = '<tr><td colspan="7" class="no-data">No promotions found</td></tr>'; return; }
    var typeLabels = { flash_sale: 'Flash Sale', daily_deal: 'Daily Deal', weekly_deal: 'Weekly Deal', holiday: 'Holiday', clearance: 'Clearance', bundle: 'Bundle', custom: 'Custom' };
    tbody.innerHTML = data.promotions.map(function (p) {
      return '<tr>' +
        '<td><strong>' + escapeHtml(p.title) + '</strong>' + (p.featured ? ' <span class="badge badge-new">Featured</span>' : '') + '</td>' +
        '<td>' + (typeLabels[p.type] || p.type) + '</td>' +
        '<td>' + (p.discountType === 'percentage' ? p.discountValue + '%' : '₦' + (p.discountValue || 0).toLocaleString()) + '</td>' +
        '<td>' + formatDate(p.startDate) + '</td>' +
        '<td>' + formatDate(p.endDate) + '</td>' +
        '<td><span class="badge badge-' + (p.active ? 'delivered' : 'cancelled') + '">' + (p.active ? 'Active' : 'Inactive') + '</span></td>' +
        '<td><button class="btn btn-sm btn-secondary" data-action="edit-promotion" data-promotion-id="' + p._id + '">Edit</button> ' +
        '<button class="btn btn-sm btn-secondary" data-action="toggle-promotion" data-promotion-id="' + p._id + '">' + (p.active ? 'Deactivate' : 'Activate') + '</button> ' +
        '<button class="btn btn-sm btn-danger" data-action="delete-promotion" data-promotion-id="' + p._id + '">Delete</button></td></tr>';
    }).join('');
    renderPagination('promotionsPagination', data.pages, data.page, function (p) { loadPromotions(p); });
  });
}

function showCreatePromotion() {
  document.getElementById('promoModalTitle').textContent = 'New Promotion';
  document.getElementById('promoEditId').value = '';
  document.getElementById('promoTitle').value = '';
  document.getElementById('promoType').value = 'flash_sale';
  document.getElementById('promoDiscountType').value = 'percentage';
  document.getElementById('promoDiscountValue').value = '';
  document.getElementById('promoCouponCode').value = '';
  document.getElementById('promoDescription').value = '';
  document.getElementById('promoActive').checked = true;
  document.getElementById('promoFeatured').checked = false;
  document.getElementById('promoStartDate').value = new Date().toISOString().slice(0, 16);
  document.getElementById('promoEndDate').value = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 16);
  document.getElementById('promotionModal').style.display = 'flex';
}

function editPromotion(id) {
  api('/api/admin/promotions?page=1&limit=100').then(function (data) {
    var p = data.promotions.find(function (x) { return x._id === id; });
    if (!p) return;
    document.getElementById('promoModalTitle').textContent = 'Edit Promotion';
    document.getElementById('promoEditId').value = p._id;
    document.getElementById('promoTitle').value = p.title || '';
    document.getElementById('promoType').value = p.type || 'flash_sale';
    document.getElementById('promoDiscountType').value = p.discountType || 'percentage';
    document.getElementById('promoDiscountValue').value = p.discountValue || '';
    document.getElementById('promoCouponCode').value = p.couponCode || '';
    document.getElementById('promoDescription').value = p.description || '';
    document.getElementById('promoActive').checked = p.active !== false;
    document.getElementById('promoFeatured').checked = p.featured === true;
    document.getElementById('promoStartDate').value = p.startDate ? new Date(p.startDate).toISOString().slice(0, 16) : '';
    document.getElementById('promoEndDate').value = p.endDate ? new Date(p.endDate).toISOString().slice(0, 16) : '';
    document.getElementById('promotionModal').style.display = 'flex';
  });
}

function savePromotion() {
  var id = document.getElementById('promoEditId').value;
  var body = {
    title: document.getElementById('promoTitle').value,
    type: document.getElementById('promoType').value,
    discountType: document.getElementById('promoDiscountType').value,
    discountValue: parseFloat(document.getElementById('promoDiscountValue').value) || 0,
    couponCode: document.getElementById('promoCouponCode').value,
    description: document.getElementById('promoDescription').value,
    active: document.getElementById('promoActive').checked,
    featured: document.getElementById('promoFeatured').checked,
    startDate: document.getElementById('promoStartDate').value,
    endDate: document.getElementById('promoEndDate').value
  };
  if (!body.title) { showToast('Title is required', 'error'); return; }
  var promise = id ? api('/api/admin/promotions/' + id, { method: 'PUT', body: JSON.stringify(body) }) : api('/api/admin/promotions', { method: 'POST', body: JSON.stringify(body) });
  promise.then(function () { showToast('Promotion saved'); closePromotionModal(); loadPromotions(); }).catch(function (e) { showToast(e.message, 'error'); });
}

function togglePromotion(id) {
  api('/api/admin/promotions/' + id + '/toggle', { method: 'PATCH' }).then(function () { loadPromotions(); showToast('Promotion updated'); });
}

function deletePromotion(id) {
  if (!confirm('Delete this promotion?')) return;
  api('/api/admin/promotions/' + id, { method: 'DELETE' }).then(function () { loadPromotions(); showToast('Promotion deleted'); });
}

function closePromotionModal() { document.getElementById('promotionModal').style.display = 'none'; }

// ═══════════════════════════════════════════════
// COUPONS MANAGEMENT
// ═══════════════════════════════════════════════

function loadCoupons(page) {
  page = page || 1;
  api('/api/admin/coupons?page=' + page + '&limit=20').then(function (data) {
    var tbody = document.getElementById('couponsTableBody');
    if (!tbody) return;
    if (!data.coupons || data.coupons.length === 0) { tbody.innerHTML = '<tr><td colspan="8" class="no-data">No coupons found</td></tr>'; return; }
    var typeLabels = { percentage: 'Percentage', fixed: 'Fixed Amount', free_shipping: 'Free Shipping', bogo: 'BOGO' };
    var now = new Date();
    tbody.innerHTML = data.coupons.map(function (c) {
      var valueText = c.type === 'percentage' ? c.value + '%' : c.type === 'fixed' ? '₦' + (c.value || 0).toLocaleString() : c.type === 'free_shipping' ? 'Free Ship' : 'BOGO';
      var valid = (!c.startDate || new Date(c.startDate) <= now) && (!c.endDate || new Date(c.endDate) >= now);
      return '<tr>' +
        '<td><strong style="font-family:monospace">' + escapeHtml(c.code) + '</strong></td>' +
        '<td>' + (typeLabels[c.type] || c.type) + '</td>' +
        '<td>' + valueText + '</td>' +
        '<td>' + (c.minOrder ? '₦' + c.minOrder.toLocaleString() : '-') + '</td>' +
        '<td>' + c.usedCount + (c.usageLimit ? ' / ' + c.usageLimit : ' / ∞') + '</td>' +
        '<td>' + (valid ? '<span class="badge badge-delivered">Valid</span>' : '<span class="badge badge-cancelled">Expired</span>') + '</td>' +
        '<td><span class="badge badge-' + (c.active ? 'delivered' : 'cancelled') + '">' + (c.active ? 'Active' : 'Inactive') + '</span></td>' +
        '<td><button class="btn btn-sm btn-secondary" data-action="edit-coupon" data-coupon-id="' + c._id + '">Edit</button> ' +
        '<button class="btn btn-sm btn-secondary" data-action="toggle-coupon" data-coupon-id="' + c._id + '">' + (c.active ? 'Disable' : 'Enable') + '</button> ' +
        '<button class="btn btn-sm btn-danger" data-action="delete-coupon" data-coupon-id="' + c._id + '">Delete</button></td></tr>';
    }).join('');
    renderPagination('couponsPagination', data.pages, data.page, function (p) { loadCoupons(p); });
  });
}

function showCreateCoupon() {
  document.getElementById('couponModalTitle').textContent = 'New Coupon';
  document.getElementById('couponEditId').value = '';
  document.getElementById('couponCode').value = '';
  document.getElementById('couponType').value = 'percentage';
  document.getElementById('couponValue').value = '';
  document.getElementById('couponMinOrder').value = '';
  document.getElementById('couponMaxDiscount').value = '';
  document.getElementById('couponUsageLimit').value = '';
  document.getElementById('couponDescription').value = '';
  document.getElementById('couponStartDate').value = new Date().toISOString().slice(0, 16);
  document.getElementById('couponEndDate').value = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 16);
  document.getElementById('couponModal').style.display = 'flex';
}

function editCoupon(id) {
  api('/api/admin/coupons?page=1&limit=100').then(function (data) {
    var c = data.coupons.find(function (x) { return x._id === id; });
    if (!c) return;
    document.getElementById('couponModalTitle').textContent = 'Edit Coupon';
    document.getElementById('couponEditId').value = c._id;
    document.getElementById('couponCode').value = c.code || '';
    document.getElementById('couponType').value = c.type || 'percentage';
    document.getElementById('couponValue').value = c.value || '';
    document.getElementById('couponMinOrder').value = c.minOrder || '';
    document.getElementById('couponMaxDiscount').value = c.maxDiscount || '';
    document.getElementById('couponUsageLimit').value = c.usageLimit || '';
    document.getElementById('couponDescription').value = c.description || '';
    document.getElementById('couponStartDate').value = c.startDate ? new Date(c.startDate).toISOString().slice(0, 16) : '';
    document.getElementById('couponEndDate').value = c.endDate ? new Date(c.endDate).toISOString().slice(0, 16) : '';
    document.getElementById('couponModal').style.display = 'flex';
  });
}

function saveCoupon() {
  var id = document.getElementById('couponEditId').value;
  var body = {
    code: document.getElementById('couponCode').value.toUpperCase().trim(),
    type: document.getElementById('couponType').value,
    value: parseFloat(document.getElementById('couponValue').value) || 0,
    minOrder: parseFloat(document.getElementById('couponMinOrder').value) || 0,
    maxDiscount: parseFloat(document.getElementById('couponMaxDiscount').value) || 0,
    usageLimit: parseInt(document.getElementById('couponUsageLimit').value) || 0,
    description: document.getElementById('couponDescription').value,
    startDate: document.getElementById('couponStartDate').value,
    endDate: document.getElementById('couponEndDate').value,
    active: true
  };
  if (!body.code) { showToast('Coupon code is required', 'error'); return; }
  var promise = id ? api('/api/admin/coupons/' + id, { method: 'PUT', body: JSON.stringify(body) }) : api('/api/admin/coupons', { method: 'POST', body: JSON.stringify(body) });
  promise.then(function () { showToast('Coupon saved'); closeCouponModal(); loadCoupons(); }).catch(function (e) { showToast(e.message, 'error'); });
}

function toggleCoupon(id) {
  api('/api/admin/coupons/' + id + '/toggle', { method: 'PATCH' }).then(function () { loadCoupons(); showToast('Coupon updated'); });
}

function deleteCoupon(id) {
  if (!confirm('Delete this coupon?')) return;
  api('/api/admin/coupons/' + id, { method: 'DELETE' }).then(function () { loadCoupons(); showToast('Coupon deleted'); });
}

function closeCouponModal() { document.getElementById('couponModal').style.display = 'none'; }

// ═══════════════════════════════════════════════
// NEWSLETTER MANAGEMENT
// ═══════════════════════════════════════════════

function loadNewsletter(page) {
  page = page || 1;
  api('/api/admin/newsletter?page=' + page + '&limit=50').then(function (data) {
    var countEl = document.getElementById('newsletterCount');
    if (countEl) countEl.textContent = data.total || 0;
    var tbody = document.getElementById('newsletterTableBody');
    if (!tbody) return;
    if (!data.subscribers || data.subscribers.length === 0) { tbody.innerHTML = '<tr><td colspan="5" class="no-data">No subscribers yet</td></tr>'; return; }
    tbody.innerHTML = data.subscribers.map(function (s) {
      return '<tr>' +
        '<td>' + escapeHtml(s.email) + '</td>' +
        '<td>' + escapeHtml(s.name || '-') + '</td>' +
        '<td><span class="badge badge-' + (s.subscribed ? 'delivered' : 'cancelled') + '">' + (s.subscribed ? 'Yes' : 'No') + '</span></td>' +
        '<td>' + formatDate(s.createdAt) + '</td>' +
        '<td><button class="btn btn-sm btn-danger" data-action="delete-subscriber" data-subscriber-id="' + s._id + '">Remove</button></td></tr>';
    }).join('');
    renderPagination('newsletterPagination', data.pages, data.page, function (p) { loadNewsletter(p); });
  });
}

function deleteSubscriber(id) {
  if (!confirm('Remove this subscriber?')) return;
  api('/api/admin/newsletter/' + id, { method: 'DELETE' }).then(function () { loadNewsletter(); showToast('Subscriber removed'); });
}

function showSendCampaign() { document.getElementById('campaignModal').style.display = 'flex'; }
function closeCampaignModal() { document.getElementById('campaignModal').style.display = 'none'; }

function sendCampaign() {
  var subject = document.getElementById('campaignSubject').value;
  var content = document.getElementById('campaignContent').value;
  if (!subject || !content) { showToast('Subject and content are required', 'error'); return; }
  api('/api/admin/newsletter/send', { method: 'POST', body: JSON.stringify({ subject: subject, htmlContent: content }) })
    .then(function (r) { showToast('Campaign sent to ' + r.sent + ' subscribers'); closeCampaignModal(); })
    .catch(function (e) { showToast(e.message, 'error'); });
}

// ═══════════════════════════════════════════════
// ANALYTICS DASHBOARD
// ═══════════════════════════════════════════════

function loadAnalytics() {
  var period = document.getElementById('analyticsPeriod')?.value || 'daily';
  api('/api/admin/analytics?period=' + period).then(function (data) {
    var o = data.overview || {};
    setText('analyticsRevenue', '₦' + (o.totalRevenue || 0).toLocaleString());
    setText('analyticsOrders', (o.purchases || 0).toLocaleString());
    setText('analyticsAOV', '₦' + (o.avgOrderValue || 0).toLocaleString());
    setText('analyticsConversion', (o.conversionRate || 0) + '%');
    setText('analyticsViews', (o.productViews || 0).toLocaleString());
    setText('analyticsCoupons', (o.couponUses || 0).toLocaleString());
    setText('analyticsNewsletter', (o.newsletterSignups || 0).toLocaleString());
    setText('analyticsReviews', (o.reviewsCount || 0).toLocaleString());

    var revData = data.revenueByDay || [];
    var canvas = document.getElementById('revenueChart');
    if (canvas && revData.length > 0) {
      var ctx = canvas.getContext('2d');
      var w = canvas.width = canvas.parentElement.offsetWidth - 40;
      var h = canvas.height = 250;
      ctx.clearRect(0, 0, w, h);
      var maxRev = Math.max.apply(null, revData.map(function (d) { return d.revenue || 0; }));
      if (maxRev === 0) maxRev = 1;
      var barW = Math.max(8, (w - 60) / revData.length - 4);
      ctx.fillStyle = '#e0e6f0';
      ctx.fillRect(40, 0, w - 40, h - 30);
      revData.forEach(function (d, i) {
        var x = 50 + i * (barW + 4);
        var barH = ((d.revenue || 0) / maxRev) * (h - 50);
        var gradient = ctx.createLinearGradient(x, h - 30 - barH, x, h - 30);
        gradient.addColorStop(0, '#3da7ff');
        gradient.addColorStop(1, '#0f2c56');
        ctx.fillStyle = gradient;
        ctx.fillRect(x, h - 30 - barH, barW, barH);
        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        if (revData.length <= 15) ctx.fillText((d._id || '').slice(5), x + barW / 2, h - 15);
        ctx.fillStyle = '#0f2c56';
        ctx.fillText('₦' + ((d.revenue || 0) / 1000).toFixed(0) + 'k', x + barW / 2, h - 35 - barH);
      });
    }

    var topList = document.getElementById('topProductsList');
    if (topList && data.topProducts && data.topProducts.length > 0) {
      topList.innerHTML = data.topProducts.map(function (p, i) {
        var name = p.product ? p.product.name : 'Unknown';
        return '<div style="display:flex;justify-content:space-between;padding:10px;border-bottom:1px solid #f0f4f8">' +
          '<span>' + (i + 1) + '. ' + escapeHtml(name) + '</span>' +
          '<span style="color:#94a3b8">' + (p.purchases || 0) + ' sold | ' + (p.views || 0) + ' views</span></div>';
      }).join('');
    } else if (topList) {
      topList.innerHTML = '<p style="color:#94a3b8;padding:20px">No data yet. Analytics will appear as customers browse and purchase.</p>';
    }
  });
}

function setText(id, text) {
  var el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ═══════════════════════════════════════════════
// ADMIN REVIEW MANAGEMENT
// ═══════════════════════════════════════════════

var _adminReviewPage = 1;

function loadAdminReviews(page) {
  _adminReviewPage = page || 1;
  api('/api/admin/reviews?page=' + _adminReviewPage + '&limit=15').then(function(data) {
    var tbody = document.getElementById('reviewsTableBody');
    var pagination = document.getElementById('reviewsPagination');
    setText('reviewsTotal', data.stats ? data.stats.total : 0);
    setText('reviewsAvg', data.stats ? data.stats.avg.toFixed(1) : '0');

    if (!data.reviews || data.reviews.length === 0) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="no-data">No reviews found.</td></tr>';
      if (pagination) pagination.innerHTML = '';
      return;
    }

    if (tbody) {
      tbody.innerHTML = data.reviews.map(function(r) {
        var productName = r.product ? (r.product.name || 'Unknown') : 'Unknown';
        var userName = r.user ? (r.user.name || r.user.email || 'Unknown') : (r.name || 'Anonymous');
        var date = new Date(r.createdAt).toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' });
        var starsStr = '';
        for (var i = 0; i < 5; i++) starsStr += i < r.rating ? '★' : '☆';
        var comment = (r.comment || '').substring(0, 80) + ((r.comment || '').length > 80 ? '...' : '');
        return '<tr>' +
          '<td style="max-width:150px">' + escapeHtml(productName) + '</td>' +
          '<td>' + escapeHtml(userName) + '</td>' +
          '<td style="color:#ffb400">' + starsStr + '</td>' +
          '<td style="max-width:250px;font-size:0.85rem">' + escapeHtml(comment) + '</td>' +
          '<td style="white-space:nowrap">' + date + '</td>' +
          '<td><button class="btn btn-sm" style="background:#f44336;color:white;border:none;padding:4px 10px;border-radius:6px;cursor:pointer" data-action="delete-admin-review" data-review-id="' + r._id + '">Delete</button></td>' +
          '</tr>';
      }).join('');
    }

    if (pagination && data.pages > 1) {
      var html = '';
      for (var i = 1; i <= data.pages; i++) {
        html += '<button class="page-btn' + (i === data.page ? ' active' : '') + '" data-action="load-admin-reviews" data-page="' + i + '" style="padding:4px 10px;border:1px solid #e0e6ed;border-radius:6px;background:' + (i === data.page ? '#4361ee' : 'white') + ';color:' + (i === data.page ? 'white' : '#333') + ';cursor:pointer;margin:0 2px">' + i + '</button>';
      }
      pagination.innerHTML = html;
    }
  }).catch(function(err) {
    showToast('Failed to load reviews: ' + err.message);
  });
}

function deleteAdminReview(id) {
  if (!confirm('Are you sure you want to delete this review?')) return;
  api('/api/admin/reviews/' + id, { method: 'DELETE' }).then(function() {
    showToast('Review deleted');
    loadAdminReviews(_adminReviewPage);
  }).catch(function(err) {
    showToast('Failed to delete review: ' + err.message);
  });
}

// ═══════════════════════════════════════════════
// ADMIN SUPPORT TICKETS
// ═══════════════════════════════════════════════

var _adminTicketPage = 1;
var _currentTicketNumber = null;

function loadAdminTickets(page) {
  _adminTicketPage = page || 1;
  api('/api/admin/tickets?page=' + _adminTicketPage + '&limit=15').then(function(data) {
    var tbody = document.getElementById('ticketsTableBody');
    setText('ticketsTotal', data.stats ? data.stats.total : 0);
    setText('ticketsOpen', data.stats ? data.stats.open : 0);
    setText('ticketsProgress', data.stats ? data.stats.in_progress : 0);
    setText('ticketsResolved', data.stats ? data.stats.resolved : 0);

    if (!data.tickets || data.tickets.length === 0) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="no-data">No support tickets found.</td></tr>';
      return;
    }

    if (tbody) {
      tbody.innerHTML = data.tickets.map(function(t) {
        var date = new Date(t.createdAt).toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' });
        var statusClass = 'badge-' + t.status.replace('_', '-');
        var priorityColors = { low: '#4caf50', medium: '#ff9800', high: '#f44336', urgent: '#9c27b0' };
        var pColor = priorityColors[t.priority] || '#94a3b8';
        return '<tr>' +
          '<td style="font-weight:600;color:#4361ee">' + escapeHtml(t.ticketNumber) + '</td>' +
          '<td>' + escapeHtml(t.name || '') + '<br><small style="color:#94a3b8">' + escapeHtml(t.email || '') + '</small></td>' +
          '<td style="max-width:200px">' + escapeHtml(t.subject || '') + '</td>' +
          '<td><span class="badge badge-info">' + (t.category || 'other') + '</span></td>' +
          '<td><span style="color:' + pColor + ';font-weight:600;text-transform:capitalize">' + (t.priority || 'medium') + '</span></td>' +
          '<td><span class="badge ' + statusClass + '" style="text-transform:capitalize">' + (t.status || 'open').replace('_', ' ') + '</span></td>' +
          '<td style="white-space:nowrap">' + date + '</td>' +
          '<td><button class="btn btn-sm btn-primary" data-action="open-ticket-detail" data-ticket-number="' + t.ticketNumber + '" style="margin-right:4px">View</button></td>' +
          '</tr>';
      }).join('');
    }

    var pagination = document.getElementById('ticketsPagination');
    if (pagination && data.pages > 1) {
      var html = '';
      for (var i = 1; i <= data.pages; i++) {
        html += '<button class="page-btn' + (i === data.page ? ' active' : '') + '" data-action="load-admin-tickets" data-page="' + i + '" style="padding:4px 10px;border:1px solid #e0e6ed;border-radius:6px;background:' + (i === data.page ? '#4361ee' : 'white') + ';color:' + (i === data.page ? 'white' : '#333') + ';cursor:pointer;margin:0 2px">' + i + '</button>';
      }
      pagination.innerHTML = html;
    }
  }).catch(function(err) { showToast('Failed to load tickets: ' + err.message); });
}

window.openTicketDetail = function(ticketNumber) {
  _currentTicketNumber = ticketNumber;
  api('/api/admin/tickets/' + ticketNumber).then(function(ticket) {
    var modal = document.getElementById('ticketModal');
    var body = document.getElementById('ticketModalBody');
    setText('ticketModalTitle', 'Ticket ' + ticket.ticketNumber);
    document.getElementById('ticketStatusSelect').value = ticket.status;
    var html = '<div style="margin-bottom:15px">';
    html += '<p><strong>Customer:</strong> ' + escapeHtml(ticket.name || '') + ' (' + escapeHtml(ticket.email || '') + ')</p>';
    html += '<p><strong>Subject:</strong> ' + escapeHtml(ticket.subject || '') + '</p>';
    html += '<p><strong>Category:</strong> ' + (ticket.category || 'other') + ' | <strong>Priority:</strong> ' + (ticket.priority || 'medium') + '</p>';
    if (ticket.orderRef) html += '<p><strong>Order:</strong> ' + escapeHtml(ticket.orderRef.orderNumber || ticket.orderRef._id || '') + '</p>';
    html += '</div>';
    html += '<div style="border-top:1px solid #f0f4f8;padding-top:15px">';
    html += '<h4 style="margin-bottom:10px">Conversation</h4>';
    if (ticket.messages && ticket.messages.length > 0) {
      ticket.messages.forEach(function(m) {
        var isCustomer = m.sender === 'customer';
        var bg = isCustomer ? '#f0f4f8' : '#e8f5e9';
        var align = isCustomer ? 'left' : 'right';
        html += '<div style="margin-bottom:10px;text-align:' + align + '">';
        html += '<div style="display:inline-block;background:' + bg + ';padding:10px 14px;border-radius:12px;max-width:80%;text-align:left">';
        html += '<p style="font-weight:600;font-size:0.8rem;color:#666;margin:0 0 4px">' + (isCustomer ? escapeHtml(ticket.name || 'Customer') : 'Admin') + '</p>';
        html += '<p style="margin:0">' + escapeHtml(m.text || '') + '</p>';
        html += '<p style="font-size:0.75rem;color:#999;margin:4px 0 0">' + new Date(m.createdAt).toLocaleString('en-NG') + '</p>';
        html += '</div></div>';
      });
    } else {
      html += '<p style="color:#94a3b8">No messages yet.</p>';
    }
    html += '</div>';
    body.innerHTML = html;
    modal.style.display = 'flex';
  }).catch(function(err) { showToast('Failed to load ticket: ' + err.message); });
};

window.closeTicketModal = function() {
  document.getElementById('ticketModal').style.display = 'none';
  _currentTicketNumber = null;
};

window.updateTicketStatus = function() {
  if (!_currentTicketNumber) return;
  var status = document.getElementById('ticketStatusSelect').value;
  api('/api/admin/tickets/' + _currentTicketNumber + '/status', { method: 'PATCH', body: JSON.stringify({ status: status }) }).then(function() {
    showToast('Status updated');
    loadAdminTickets(_adminTicketPage);
  }).catch(function(err) { showToast('Failed to update status: ' + err.message); });
};

window.replyToTicket = function() {
  if (!_currentTicketNumber) return;
  var input = document.getElementById('ticketReplyInput');
  var text = input.value.trim();
  if (!text) return;
  api('/api/admin/tickets/' + _currentTicketNumber + '/reply', { method: 'POST', body: JSON.stringify({ text: text }) }).then(function() {
    input.value = '';
    showToast('Reply sent');
    openTicketDetail(_currentTicketNumber);
  }).catch(function(err) { showToast('Failed to send reply: ' + err.message); });
};

// ═══════════════════════════════════════════════
// ADMIN RETURNS
// ═══════════════════════════════════════════════

var _adminReturnPage = 1;
var _currentReturnId = null;

function loadAdminReturns(page) {
  _adminReturnPage = page || 1;
  api('/api/admin/returns?page=' + _adminReturnPage + '&limit=15').then(function(data) {
    var tbody = document.getElementById('returnsTableBody');
    setText('returnsTotal', data.stats ? data.stats.total : 0);
    setText('returnsPending', data.stats ? data.stats.pending : 0);
    setText('returnsApproved', data.stats ? data.stats.approved : 0);
    setText('returnsRejected', data.stats ? data.stats.rejected : 0);

    if (!data.returns || data.returns.length === 0) {
      if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="no-data">No return requests found.</td></tr>';
      return;
    }

    if (tbody) {
      tbody.innerHTML = data.returns.map(function(r) {
        var date = new Date(r.createdAt).toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' });
        var statusClass = 'badge-' + r.status;
        return '<tr>' +
          '<td style="font-weight:600;color:#4361ee">' + escapeHtml(r.requestNumber) + '</td>' +
          '<td>' + escapeHtml(r.orderNumber || '') + '</td>' +
          '<td>' + escapeHtml(r.user?.name || r.user?.email || 'N/A') + '</td>' +
          '<td><span class="badge badge-info" style="text-transform:capitalize">' + (r.type || 'return') + '</span></td>' +
          '<td style="max-width:200px;font-size:0.85rem">' + escapeHtml((r.reason || '').substring(0, 60)) + '</td>' +
          '<td><span class="badge ' + statusClass + '" style="text-transform:capitalize">' + r.status + '</span></td>' +
          '<td style="white-space:nowrap">' + date + '</td>' +
          '<td><button class="btn btn-sm btn-primary" data-action="open-return-detail" data-return-id="' + r._id + '" style="margin-right:4px">View</button></td>' +
          '</tr>';
      }).join('');
    }

    var pagination = document.getElementById('returnsPagination');
    if (pagination && data.pages > 1) {
      var html = '';
      for (var i = 1; i <= data.pages; i++) {
        html += '<button class="page-btn' + (i === data.page ? ' active' : '') + '" data-action="load-admin-returns" data-page="' + i + '" style="padding:4px 10px;border:1px solid #e0e6ed;border-radius:6px;background:' + (i === data.page ? '#4361ee' : 'white') + ';color:' + (i === data.page ? 'white' : '#333') + ';cursor:pointer;margin:0 2px">' + i + '</button>';
      }
      pagination.innerHTML = html;
    }
  }).catch(function(err) { showToast('Failed to load returns: ' + err.message); });
}

window.openReturnDetail = function(id) {
  _currentReturnId = id;
  api('/api/admin/returns/' + id).then(function(ret) {
    var modal = document.getElementById('returnModal');
    var body = document.getElementById('returnModalBody');
    setText('returnModalTitle', 'Return ' + ret.requestNumber);
    var html = '<div style="margin-bottom:15px">';
    html += '<p><strong>Order:</strong> ' + escapeHtml(ret.orderNumber || '') + '</p>';
    html += '<p><strong>Type:</strong> ' + (ret.type || 'return') + '</p>';
    html += '<p><strong>Reason:</strong> ' + escapeHtml(ret.reason || '') + '</p>';
    if (ret.description) html += '<p><strong>Description:</strong> ' + escapeHtml(ret.description) + '</p>';
    if (ret.refundAmount) html += '<p><strong>Refund Amount:</strong> ₦' + (ret.refundAmount || 0).toLocaleString() + '</p>';
    html += '<h4 style="margin-top:15px">Items</h4>';
    if (ret.items && ret.items.length > 0) {
      ret.items.forEach(function(item) {
        html += '<div style="background:#f8f9fa;padding:10px;border-radius:8px;margin-bottom:8px">';
        html += '<p style="margin:0"><strong>' + escapeHtml(item.name || '') + '</strong> x' + (item.quantity || 1) + ' - ₦' + ((item.price || 0) * (item.quantity || 1)).toLocaleString() + '</p>';
        if (item.reason) html += '<p style="margin:4px 0 0;font-size:0.85rem;color:#666">Reason: ' + escapeHtml(item.reason) + '</p>';
        html += '</div>';
      });
    }
    if (ret.adminResponse) html += '<p style="margin-top:10px"><strong>Admin Response:</strong> ' + escapeHtml(ret.adminResponse) + '</p>';
    html += '</div>';
    html += '<div style="border-top:1px solid #f0f4f8;padding-top:10px"><h4>Status History</h4>';
    if (ret.statusHistory && ret.statusHistory.length > 0) {
      ret.statusHistory.forEach(function(s) {
        html += '<p style="margin:4px 0;font-size:0.85rem"><strong>' + s.status + '</strong> - ' + escapeHtml(s.note || '') + ' <span style="color:#94a3b8">(' + new Date(s.date).toLocaleString('en-NG') + ')</span></p>';
      });
    }
    html += '</div>';
    body.innerHTML = html;
    document.getElementById('returnAdminResponse').value = ret.adminResponse || '';
    modal.style.display = 'flex';
  }).catch(function(err) { showToast('Failed to load return: ' + err.message); });
};

window.closeReturnModal = function() {
  document.getElementById('returnModal').style.display = 'none';
  _currentReturnId = null;
};

window.updateReturnStatus = function(status) {
  if (!_currentReturnId) return;
  var response = document.getElementById('returnAdminResponse').value.trim();
  api('/api/admin/returns/' + _currentReturnId + '/status', { method: 'PATCH', body: JSON.stringify({ status: status, adminResponse: response }) }).then(function() {
    showToast('Return request ' + status);
    closeReturnModal();
    loadAdminReturns(_adminReturnPage);
  }).catch(function(err) { showToast('Failed to update: ' + err.message); });
};

// ═══════════════════════════════════════════════
// ADMIN LIVE CHAT
// ═══════════════════════════════════════════════

var _currentChatSession = null;

function loadAdminChats() {
  api('/api/admin/chats').then(function(data) {
    var list = document.getElementById('chatAdminList');
    setText('chatsOpen', data.open || 0);
    setText('chatsClosed', data.closed || 0);

    if (!data.chats || data.chats.length === 0) {
      if (list) list.innerHTML = '<p style="color:var(--muted);padding:20px">No chat sessions found.</p>';
      return;
    }

    if (list) {
      list.innerHTML = data.chats.map(function(c) {
        var lastMsg = c.messages && c.messages.length > 0 ? c.messages[c.messages.length - 1] : null;
        var preview = lastMsg ? lastMsg.text.substring(0, 50) : 'No messages';
        var time = lastMsg ? new Date(lastMsg.createdAt).toLocaleString('en-NG', { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' }) : '';
        var unread = 0;
        if (c.messages) c.messages.forEach(function(m) { if (m.sender === 'user' && !m.read) unread++; });
        return '<div class="chat-admin-item' + (_currentChatSession === c.sessionId ? ' active' : '') + '" data-action="open-admin-chat" data-session-id="' + c.sessionId + '" style="padding:12px 16px;border-bottom:1px solid #f0f4f8;cursor:pointer;display:flex;justify-content:space-between;align-items:center">' +
          '<div><p style="font-weight:600;margin:0">' + escapeHtml(c.name || 'Guest') + (unread > 0 ? ' <span style="background:#f44336;color:white;border-radius:50%;padding:2px 7px;font-size:0.75rem">' + unread + '</span>' : '') + '</p>' +
          '<p style="color:#94a3b8;font-size:0.8rem;margin:2px 0 0;white-space:nowrap;overflow:hidden;max-width:200px">' + escapeHtml(preview) + '</p></div>' +
          '<span style="font-size:0.75rem;color:#94a3b8;white-space:nowrap">' + time + '</span></div>';
      }).join('');
    }
  }).catch(function(err) { showToast('Failed to load chats: ' + err.message); });
}

window.openAdminChat = function(sessionId) {
  _currentChatSession = sessionId;
  api('/api/admin/chats/' + sessionId).then(function(chat) {
    loadAdminChats();
    var view = document.getElementById('chatAdminView');
    var html = '<div style="padding:15px;border-bottom:1px solid #f0f4f8;display:flex;justify-content:space-between;align-items:center">';
    html += '<div><h3 style="margin:0">' + escapeHtml(chat.name || 'Guest') + '</h3><p style="color:#94a3b8;font-size:0.8rem;margin:2px 0 0">' + escapeHtml(chat.email || chat.sessionId) + '</p></div>';
    html += '<button class="btn btn-sm btn-secondary" data-action="close-admin-chat" data-session-id="' + chat.sessionId + '">Close Chat</button></div>';
    html += '<div class="chat-admin-messages" id="chatAdminMessages" style="flex:1;overflow-y:auto;padding:15px;max-height:400px">';
    if (chat.messages && chat.messages.length > 0) {
      chat.messages.forEach(function(m) {
        var isCustomer = m.sender === 'user';
        var bg = isCustomer ? '#f0f4f8' : '#e8f5e9';
        var align = isCustomer ? 'left' : 'right';
        html += '<div style="margin-bottom:10px;text-align:' + align + '">';
        html += '<div style="display:inline-block;background:' + bg + ';padding:10px 14px;border-radius:12px;max-width:75%;text-align:left">';
        html += '<p style="margin:0">' + escapeHtml(m.text || '') + '</p>';
        html += '<p style="font-size:0.7rem;color:#999;margin:4px 0 0">' + new Date(m.createdAt).toLocaleString('en-NG') + '</p>';
        html += '</div></div>';
      });
    }
    html += '</div>';
    html += '<div style="padding:12px 15px;border-top:1px solid #f0f4f8;display:flex;gap:8px"><input type="text" id="adminChatInput" placeholder="Type a reply..." data-action="admin-chat-send" style="flex:1;padding:8px 12px;border:1px solid #e0e6ed;border-radius:8px" /><button class="btn btn-primary btn-sm" data-action="admin-chat-send">Send</button></div>';
    view.innerHTML = html;
    var msgContainer = document.getElementById('chatAdminMessages');
    if (msgContainer) msgContainer.scrollTop = msgContainer.scrollHeight;
  }).catch(function(err) { showToast('Failed to load chat: ' + err.message); });
};

window.sendAdminChatReply = function() {
  if (!_currentChatSession) return;
  var input = document.getElementById('adminChatInput');
  var text = input.value.trim();
  if (!text) return;
  api('/api/admin/chats/' + _currentChatSession + '/reply', { method: 'POST', body: JSON.stringify({ text: text }) }).then(function() {
    input.value = '';
    openAdminChat(_currentChatSession);
  }).catch(function(err) { showToast('Failed to send reply: ' + err.message); });
};

window.closeAdminChatSession = function(sessionId) {
  api('/api/admin/chats/' + sessionId + '/close', { method: 'POST' }).then(function() {
    showToast('Chat closed');
    _currentChatSession = null;
    document.getElementById('chatAdminView').innerHTML = '<p style="color:var(--muted);padding:40px;text-align:center">Select a chat to view messages</p>';
    loadAdminChats();
  }).catch(function(err) { showToast('Failed to close chat: ' + err.message); });
};

window.exportOrdersCSV = function() {
  api('/api/admin/orders?limit=5000').then(function(data) {
    var orders = data.data || data.orders || data;
    if (!Array.isArray(orders) || !orders.length) return showToast('No orders to export');
    var headers = ['Order #','Customer','Email','Phone','Items','Subtotal','Delivery','Discount','Total','Payment Method','Payment Status','Order Status','Date'];
    var rows = orders.map(function(o) {
      var itemNames = (o.items || []).map(function(i) { return (i.name || '') + ' x' + (i.quantity || 1); }).join('; ');
      var date = o.createdAt ? new Date(o.createdAt).toLocaleDateString('en-NG') : '';
      return [
        o.orderNumber || o._id,
        (o.customer_name || o.shipping?.name || ''),
        (o.customer_email || o.shipping?.email || ''),
        (o.customer_phone || o.shipping?.phone || ''),
        itemNames,
        (o.subtotal || 0),
        (o.delivery_fee || 0),
        (o.discount || 0),
        (o.total || 0),
        (o.payment_method || 'paystack'),
        (o.payment_status || 'pending'),
        (o.order_status || o.status || 'pending'),
        date
      ].map(function(v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(',');
    });
    var csv = headers.join(',') + '\n' + rows.join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'DG-Electronics-Orders-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Orders exported to CSV');
  }).catch(function(err) { showToast('Export failed: ' + err.message); });
};

window.adminCancelRefund = function() {
  if (!currentOrderData) return;
  if (!confirm('Are you sure you want to cancel and refund order #' + currentOrderData.orderNumber + '? This will restore stock and mark the payment as refunded.')) return;
  var noteInput = document.getElementById('orderStatusNote');
  var note = noteInput ? noteInput.value.trim() : 'Cancelled by admin';
  api('/api/admin/orders/' + currentOrderData._id + '/status', {
    method: 'PATCH',
    body: JSON.stringify({ order_status: 'cancelled', note: note || 'Cancelled by admin', cancelReason: 'Admin cancel & refund' })
  }).then(function () {
    showToast('Order cancelled and stock restored');
    currentOrderData.order_status = 'cancelled';
    var statusEl = document.getElementById('orderDetailStatus');
    if (statusEl) statusEl.textContent = 'cancelled';
    var cancelSection = document.getElementById('cancelRefundSection');
    if (cancelSection) cancelSection.style.display = 'none';
    loadOrders(1, currentOrderSearch, currentOrderFilter);
    openOrderModal(currentOrderData._id);
  }).catch(function (err) { showToast(err.message, 'error'); });
};
