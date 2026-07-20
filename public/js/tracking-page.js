    if (document.getElementById('year')) document.getElementById('year').textContent = new Date().getFullYear();

    const STATUS_LABELS = {
      pending: 'Order Received', processing: 'Payment Confirmed', confirmed: 'Preparing Order',
      shipped: 'Shipped', out_for_delivery: 'Out for Delivery', delivered: 'Delivered', cancelled: 'Cancelled'
    };
    const STATUS_ORDER = ['pending', 'processing', 'confirmed', 'shipped', 'out_for_delivery', 'delivered'];

    const trackingInput = document.getElementById('trackingInput');
    const orderNumberInput = document.getElementById('orderNumberInput');
    const orderEmailInput = document.getElementById('orderEmailInput');

    function switchTrackingTab(tab) {
      document.querySelectorAll('.tracking-tab').forEach(t => t.classList.remove('active'));
      document.querySelector('.tracking-tab[data-tab="' + tab + '"]').classList.add('active');
      document.getElementById('tabTracking').style.display = tab === 'tracking' ? '' : 'none';
      document.getElementById('tabTracking').classList.toggle('active', tab === 'tracking');
      document.getElementById('tabOrder').style.display = tab === 'order' ? '' : 'none';
      document.getElementById('tabOrder').classList.toggle('active', tab === 'order');
    }

    function showLoading(show) {
      document.getElementById('trackingLoading').style.display = show ? 'flex' : 'none';
      document.getElementById('trackingResult').classList.remove('active');
      document.getElementById('trackingError').classList.remove('active');
    }

    function setBtnLoading(btn, loading) {
      const text = btn.querySelector('.btn-text');
      const spinner = btn.querySelector('.btn-spinner');
      btn.disabled = loading;
      if (text) text.style.display = loading ? 'none' : '';
      if (spinner) spinner.style.display = loading ? 'inline-block' : 'none';
    }

    const urlParams = new URLSearchParams(window.location.search);
    const tn = urlParams.get('tn');
    const on = urlParams.get('order');
    const email = urlParams.get('email');
    if (tn) { trackingInput.value = tn; trackOrder(); }
    else if (on) { switchTrackingTab('order'); orderNumberInput.value = on; if (email) orderEmailInput.value = email; lookupOrder(); }

    trackingInput.addEventListener('keypress', e => { if (e.key === 'Enter') trackOrder(); });
    orderNumberInput.addEventListener('keypress', e => { if (e.key === 'Enter') lookupOrder(); });
    orderEmailInput.addEventListener('keypress', e => { if (e.key === 'Enter') lookupOrder(); });

    async function trackOrder() {
      const trackingNumber = trackingInput.value.trim();
      if (!trackingNumber) return;
      const btn = document.getElementById('trackBtn');
      setBtnLoading(btn, true);
      showLoading(true);
      try {
        const res = await fetch('/api/orders/track/' + encodeURIComponent(trackingNumber));
        const data = await res.json();
        if (!res.ok) {
          showLoading(false);
          document.getElementById('errorTitle').textContent = 'Order Not Found';
          document.getElementById('errorMessage').textContent = data.error || 'We couldn\'t find an order with that tracking number.';
          document.getElementById('trackingError').classList.add('active');
          return;
        }
        showLoading(false);
        renderTrackingResult(data);
      } catch (err) {
        showLoading(false);
        document.getElementById('errorTitle').textContent = 'Connection Error';
        document.getElementById('errorMessage').textContent = 'Unable to connect. Please try again.';
        document.getElementById('trackingError').classList.add('active');
      } finally { setBtnLoading(btn, false); }
    }

    async function lookupOrder() {
      const orderNumber = orderNumberInput.value.trim();
      const emailVal = orderEmailInput.value.trim();
      if (!orderNumber || !emailVal) return;
      const btn = document.getElementById('lookupBtn');
      setBtnLoading(btn, true);
      showLoading(true);
      try {
        const res = await fetch('/api/orders/lookup/' + encodeURIComponent(orderNumber) + '?email=' + encodeURIComponent(emailVal));
        const data = await res.json();
        if (!res.ok) {
          showLoading(false);
          document.getElementById('errorTitle').textContent = 'Order Not Found';
          document.getElementById('errorMessage').textContent = data.error || 'Please check your order number and email address.';
          document.getElementById('trackingError').classList.add('active');
          return;
        }
        showLoading(false);
        renderTrackingResult(data);
      } catch (err) {
        showLoading(false);
        document.getElementById('errorTitle').textContent = 'Connection Error';
        document.getElementById('errorMessage').textContent = 'Unable to connect. Please try again.';
        document.getElementById('trackingError').classList.add('active');
      } finally { setBtnLoading(btn, false); }
    }

    function renderTrackingResult(data) {
      document.getElementById('resultOrderNumber').textContent = 'Order #' + data.orderNumber;
      document.getElementById('resultOrderDate').textContent = 'Placed on ' + new Date(data.createdAt).toLocaleDateString('en-NG', { year: 'numeric', month: 'long', day: 'numeric' });
      const badge = document.getElementById('resultStatusBadge');
      badge.textContent = STATUS_LABELS[data.order_status] || data.order_status;
      badge.className = 'tracking-badge ' + data.order_status;
      document.getElementById('resultTrackingNumber').innerHTML = '<strong>Tracking Number:</strong> ' + (data.trackingNumber || 'Pending');

      const estDiv = document.getElementById('resultEstDelivery');
      if (data.estimatedDeliveryDate && data.order_status !== 'delivered' && data.order_status !== 'cancelled') {
        document.getElementById('estDeliveryDate').textContent = new Date(data.estimatedDeliveryDate).toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        estDiv.style.display = 'flex';
      } else { estDiv.style.display = 'none'; }

      const container = document.getElementById('timelineContainer');
      container.innerHTML = '';
      const history = data.statusHistory || [];
      const currentIdx = STATUS_ORDER.indexOf(data.order_status);
      STATUS_ORDER.forEach((status, idx) => {
        const entry = history.find(h => h.status === status);
        const item = document.createElement('div');
        item.className = 'timeline-item';
        let dotClass = 'timeline-dot';
        if (entry) dotClass += idx < currentIdx || data.order_status === 'delivered' ? ' completed' : ' active';
        const date = entry ? new Date(entry.timestamp).toLocaleString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        const note = entry ? entry.note || '' : '';
        item.innerHTML = '<div class="' + dotClass + '"></div><div class="timeline-label">' + STATUS_LABELS[status] + '</div>' + (date ? '<div class="timeline-date">' + date + '</div>' : '') + (note ? '<div class="timeline-note">' + escapeHtml(note) + '</div>' : '');
        container.appendChild(item);
      });
      if (data.order_status === 'cancelled') {
        const cancelItem = document.createElement('div');
        cancelItem.className = 'timeline-item';
        const cancelEntry = history.find(h => h.status === 'cancelled');
        const cancelDate = cancelEntry ? new Date(cancelEntry.timestamp).toLocaleString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
        cancelItem.innerHTML = '<div class="timeline-dot" style="border-color:#c62828;background:#c62828"><span style="color:white;font-size:12px">&#10005;</span></div><div class="timeline-label" style="color:#c62828">Cancelled</div>' + (cancelDate ? '<div class="timeline-date">' + cancelDate + '</div>' : '') + (cancelEntry && cancelEntry.note ? '<div class="timeline-note">' + escapeHtml(cancelEntry.note) + '</div>' : '');
        container.appendChild(cancelItem);
      }

      const itemsContainer = document.getElementById('trackingItems');
      itemsContainer.innerHTML = '';
      data.items.forEach(item => {
        const div = document.createElement('div');
        div.className = 'tracking-item';
        div.innerHTML = '<img src="' + (item.product ? item.product.image : '/images/placeholder.svg') + '" alt="' + escapeHtml(item.name) + '" /><div class="tracking-item-info"><div class="tracking-item-name">' + escapeHtml(item.name) + '</div><div class="tracking-item-qty">Qty: ' + item.quantity + '</div></div><div class="tracking-item-price">&#8358;' + (item.price * item.quantity).toLocaleString() + '</div>';
        itemsContainer.appendChild(div);
      });

      document.getElementById('trackingSummary').innerHTML = '<div class="tracking-summary-row"><span>Subtotal</span><span>&#8358;' + (data.subtotal || 0).toLocaleString() + '</span></div><div class="tracking-summary-row"><span>Delivery</span><span>' + (data.delivery_fee === 0 ? 'FREE' : '&#8358;' + (data.delivery_fee || 0).toLocaleString()) + '</span></div><div class="tracking-summary-row total"><span>Total</span><span>&#8358;' + (data.total || 0).toLocaleString() + '</span></div>';

      let addrHtml = '';
      if (data.delivery_address) {
        addrHtml = '<h4>Delivery Address</h4><p>' + escapeHtml(data.delivery_address) + (data.delivery_address_city ? ', ' + escapeHtml(data.delivery_address_city) : '') + (data.delivery_address_state ? ', ' + escapeHtml(data.delivery_address_state) : '') + '</p>';
      }
      if (data.carrier) addrHtml += '<h4 style="margin-top:12px">Carrier</h4><p>' + escapeHtml(data.carrier) + '</p>';
      if (data.shipping_notes) addrHtml += '<h4 style="margin-top:12px">Shipping Notes</h4><p>' + escapeHtml(data.shipping_notes) + '</p>';
      document.getElementById('trackingAddress').innerHTML = addrHtml;

      document.getElementById('trackingResult').classList.add('active');
    }

    function escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    setTimeout(function() { var l = document.getElementById('loader'); if (l) l.classList.add('hidden'); }, 600);
