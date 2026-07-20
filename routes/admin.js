const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set in admin routes.');
  process.exit(1);
}

const User = mongoose.model('User');
const Product = mongoose.model('Product');
const Order = mongoose.model('Order');
const Review = mongoose.model('Review');
const Settings = mongoose.model('Settings');
const SupportTicket = mongoose.model('SupportTicket');
const ReturnRequest = mongoose.model('ReturnRequest');
const ChatMessage = mongoose.model('ChatMessage');
const Notification = mongoose.model('Notification');

const uploadsDir = path.join(__dirname, '..', 'public', 'uploads', 'products');
fs.mkdirSync(uploadsDir, { recursive: true });

const uploadsStaticDir = path.join(__dirname, '..', 'public', 'uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, Date.now() + '-' + safeName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedMimes = /jpeg|jpg|png|gif|webp|svg\+xml/;
    const allowedExts = /\.(jpg|jpeg|png|gif|webp|svg)$/;
    const extname = allowedExts.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedMimes.test(file.mimetype);
    if (extname && mimetype) return cb(null, true);
    cb(new Error('Only image files (jpg, png, gif, webp, svg) are allowed'));
  }
});

function auth(req, res, next) {
  const token = req.header('Authorization')?.replace('Bearer ', '') || req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'Access denied' });
  try {
    req.user = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    next();
  } catch { res.status(401).json({ error: 'Invalid or expired token' }); }
}

function adminAuth(req, res, next) {
  auth(req, res, () => {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    next();
  });
}

function validateInput(data) {
  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'string') {
      sanitized[key] = value.trim().replace(/[<>]/g, '');
    } else if (typeof value === 'number') {
      sanitized[key] = value > 0 ? value : 0;
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function validateEmail(email) {
  if (!email) return false;
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return re.test(email);
}

function validatePhone(phone) {
  if (!phone) return true;
  const cleaned = phone.replace(/[\s\-()+\s]/g, '');
  return /^\d{7,15}$/.test(cleaned);
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const DEFAULT_CATEGORIES = ['phones', 'laptops', 'tablets', 'smartwatches', 'headphones', 'speakers', 'gaming', 'tvs', 'accessories', 'networking', 'computer_components'];

async function getValidCategories() {
  const doc = await Settings.findOne({ key: 'categories' });
  return doc && Array.isArray(doc.value) ? doc.value : DEFAULT_CATEGORIES;
}

async function saveValidCategories(cats) {
  await Settings.findOneAndUpdate({ key: 'categories' }, { key: 'categories', value: cats }, { upsert: true });
}

router.use('/uploads', express.static(uploadsStaticDir));

router.use('/admin', adminAuth);

router.get('/admin/stats', async (req, res) => {
  try {
    const totalProducts = await Product.countDocuments();
    const totalCustomers = await User.countDocuments({ role: 'customer' });
    const totalOrders = await Order.countDocuments();
    const pendingOrders = await Order.countDocuments({ payment_status: 'pending' });
    const completedOrders = await Order.countDocuments({ order_status: 'delivered' });
    const outOfStockProducts = await Product.countDocuments({ stock: { $lte: 0 } });

    const revenueResult = await Order.aggregate([
      { $match: { payment_status: 'paid' } },
      { $group: { _id: null, totalRevenue: { $sum: '$total' } } }
    ]);
    const totalRevenue = revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;

    const recentOrders = await Order.find().sort({ createdAt: -1 }).limit(10);
    const lowStockProducts = await Product.find({ stock: { $gt: 0, $lt: 5 } }).select('name stock price');

    // Create low stock notifications for products with stock < 3 (only once per product)
    if (lowStockProducts.length > 0) {
      for (const p of lowStockProducts) {
        if (p.stock < 3) {
          const existing = await Notification.findOne({ type: 'low_stock', message: new RegExp(escapeRegex(p.name)) });
          if (!existing) {
            await Notification.create({
              type: 'low_stock',
              title: 'Low Stock Alert',
              message: `${p.name} has only ${p.stock} unit(s) remaining`,
              productId: p._id
            });
          }
        }
      }
    }

    res.json({
      totalProducts, totalCustomers, totalOrders, pendingOrders,
      completedOrders, outOfStockProducts, totalRevenue,
      recentOrders, lowStockProducts,
      orderStatusBreakdown: await Order.aggregate([
        { $group: { _id: '$order_status', count: { $sum: 1 } } }
      ])
    });
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.get('/admin/sales-chart', async (req, res) => {
  try {
    const { period } = req.query;
    let groupId;
    if (period === 'weekly') {
      groupId = {
        year: { $year: '$createdAt' },
        week: { $isoWeek: '$createdAt' }
      };
    } else if (period === 'monthly') {
      groupId = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' }
      };
    } else {
      groupId = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
        day: { $dayOfMonth: '$createdAt' }
      };
    }

    const results = await Order.aggregate([
      { $match: { payment_status: 'paid' } },
      { $group: { _id: groupId, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1 } }
    ]);

    const chart = results.map(r => ({
      date: r._id.day
        ? `${r._id.year}-${String(r._id.month).padStart(2, '0')}-${String(r._id.day).padStart(2, '0')}`
        : r._id.week
          ? `${r._id.year}-W${String(r._id.week).padStart(2, '0')}`
          : `${r._id.year}-${String(r._id.month).padStart(2, '0')}`,
      revenue: r.revenue,
      orders: r.orders
    }));

    res.json(chart);
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.get('/admin/products', async (req, res) => {
  try {
    const { search, sort } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    let filter = {};
    if (search) {
      const safe = escapeRegex(search);
      filter.$or = [
        { name: { $regex: safe, $options: 'i' } },
        { brand: { $regex: safe, $options: 'i' } },
        { category: { $regex: safe, $options: 'i' } }
      ];
    }

    let sortObj = {};
    if (sort === 'price-low') sortObj.price = 1;
    else if (sort === 'price-high') sortObj.price = -1;
    else if (sort === 'name') sortObj.name = 1;
    else if (sort === 'stock') sortObj.stock = 1;
    else sortObj.createdAt = -1;

    const skip = (Number(page) - 1) * Number(limit);
    const total = await Product.countDocuments(filter);
    const products = await Product.find(filter).sort(sortObj).skip(skip).limit(Number(limit));

    res.json({ products, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.get('/admin/products/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.post('/admin/products', async (req, res) => {
  try {
    const data = validateInput(req.body);
    if (!data.name) return res.status(400).json({ error: 'Name is required' });
    if (!data.price || data.price <= 0) return res.status(400).json({ error: 'Valid price is required' });
    if (!data.category) return res.status(400).json({ error: 'Category is required' });

    const VALID_CATEGORIES = await getValidCategories();
    if (!VALID_CATEGORIES.includes(data.category)) {
      return res.status(400).json({ error: 'Invalid category' });
    }

    if (!data.slug) {
      data.slug = data.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }

    const product = await Product.create(data);
    res.json(product);
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.put('/admin/products/:id', async (req, res) => {
  try {
    const data = validateInput(req.body);
    if (data.category) {
      const VALID_CATEGORIES = await getValidCategories();
      if (!VALID_CATEGORIES.includes(data.category)) {
        return res.status(400).json({ error: 'Invalid category' });
      }
    }
    if (data.price !== undefined && data.price <= 0) {
      return res.status(400).json({ error: 'Price must be positive' });
    }
    const product = await Product.findByIdAndUpdate(req.params.id, data, { new: true });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.delete('/admin/products/images', async (req, res) => {
  try {
    const { filename, productId } = req.body;
    if (!filename) return res.status(400).json({ error: 'Filename is required' });
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    const filePath = path.join(uploadsDir, filename);
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(uploadsDir))) {
      return res.status(400).json({ error: 'Invalid filename' });
    }
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    if (productId) {
      const safeFilename = filename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      await Product.findByIdAndUpdate(productId, { $pull: { images: { $regex: safeFilename } } });
    }
    res.json({ success: true });
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.delete('/admin/products/:id', async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true });
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.post('/admin/products/upload', upload.array('images', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'No files uploaded' });
    const urls = req.files.map(f => ({ url: `/uploads/products/${f.filename}`, filename: f.filename }));
    res.json({ success: true, files: urls });
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.get('/admin/customers', async (req, res) => {
  try {
    const { search } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    let filter = { role: 'customer' };
    if (search) {
      const safe = escapeRegex(search);
      filter.$or = [
        { name: { $regex: safe, $options: 'i' } },
        { email: { $regex: safe, $options: 'i' } },
        { phone: { $regex: safe, $options: 'i' } }
      ];
    }
    const skip = (Number(page) - 1) * Number(limit);
    const total = await User.countDocuments(filter);
    const customers = await User.find(filter).select('-password').sort({ createdAt: -1 }).skip(skip).limit(Number(limit));

    const settings = await Settings.findOne({ key: 'blocked_users' });
    const blockedIds = settings ? settings.value : [];
    const customersWithStatus = customers.map(c => ({
      ...c.toObject(),
      blocked: blockedIds.includes(c._id.toString())
    }));

    res.json({ customers: customersWithStatus, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.get('/admin/customers/:id', async (req, res) => {
  try {
    const customer = await User.findById(req.params.id).select('-password');
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    const orders = await Order.find({ user: req.params.id }).sort({ createdAt: -1 });
    const settings = await Settings.findOne({ key: 'blocked_users' });
    const blockedIds = settings ? settings.value : [];
    res.json({
      ...customer.toObject(),
      blocked: blockedIds.includes(customer._id.toString()),
      orders
    });
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.patch('/admin/customers/:id/block', async (req, res) => {
  try {
    let settings = await Settings.findOne({ key: 'blocked_users' });
    if (!settings) {
      settings = await Settings.create({ key: 'blocked_users', value: [] });
    }
    const userId = req.params.id;
    const idx = settings.value.indexOf(userId);
    let blocked;
    if (idx > -1) {
      settings.value.splice(idx, 1);
      blocked = false;
    } else {
      settings.value.push(userId);
      blocked = true;
    }
    await Settings.findOneAndUpdate({ key: 'blocked_users' }, { value: settings.value });
    res.json({ success: true, blocked });
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.get('/admin/orders', async (req, res) => {
  try {
    const { search, status, payment_status } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    let filter = {};
    if (search) {
      const safe = escapeRegex(search);
      filter.$or = [
        { orderNumber: { $regex: safe, $options: 'i' } },
        { customer_name: { $regex: safe, $options: 'i' } },
        { customer_email: { $regex: safe, $options: 'i' } },
        { customer_phone: { $regex: safe, $options: 'i' } }
      ];
    }
    if (status) filter.order_status = status;
    if (payment_status) filter.payment_status = payment_status;

    const skip = (Number(page) - 1) * Number(limit);
    const total = await Order.countDocuments(filter);
    const orders = await Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit));

    res.json({ orders, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.get('/admin/orders/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json(order);
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.patch('/admin/orders/:id/status', async (req, res) => {
  try {
    const { order_status, tracking_number, shipping_notes, carrier, note, cancelReason } = req.body;
    const validStatuses = ['pending', 'processing', 'confirmed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];
    if (!validStatuses.includes(order_status)) {
      return res.status(400).json({ error: 'Invalid order status' });
    }
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const oldStatus = order.order_status;
    order.order_status = order_status;

    // Add status history entry
    if (!order.statusHistory) order.statusHistory = [];
    order.statusHistory.push({
      status: order_status,
      timestamp: new Date(),
      note: note || `Status updated to ${order_status}`,
      updatedBy: 'admin'
    });

    // Track timestamps
    if (order_status === 'shipped') order.shippedAt = new Date();
    if (order_status === 'delivered') order.deliveredAt = new Date();

    // Handle cancellation - restore stock and set refund status
    if (order_status === 'cancelled' && oldStatus !== 'cancelled') {
      for (const item of order.items) {
        try {
          await Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } });
        } catch (e) { /* product may not exist */ }
      }
      if (order.payment_status === 'paid') order.payment_status = 'refunded';
      if (cancelReason) order.cancelReason = cancelReason;
    }

    // Update tracking info if provided
    if (tracking_number) order.trackingNumber = tracking_number;
    if (shipping_notes) order.shipping_notes = shipping_notes;
    if (carrier) order.carrier = carrier;

    // Generate tracking number for shipped orders if missing
    if (order_status === 'shipped' && !order.trackingNumber) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      let result = 'DG-TRK-';
      for (let i = 0; i < 10; i++) result += chars.charAt(Math.floor(Math.random() * chars.length));
      order.trackingNumber = result;
    }

    await order.save();

    // Create in-app notification for customer
    const statusMessages = {
      'processing': 'Your order is now being prepared.',
      'confirmed': 'Your order has been confirmed and will be shipped soon.',
      'shipped': 'Great news! Your order has been shipped and is on its way.',
      'out_for_delivery': 'Your order is out for delivery and will arrive soon!',
      'delivered': 'Your order has been delivered. We hope you enjoy your purchase!',
      'cancelled': 'Your order has been cancelled.'
    };
    await Notification.create({
      type: 'order_status',
      title: `Order ${order_status.charAt(0).toUpperCase() + order_status.slice(1).replace('_', ' ')}`,
      message: `Order #${order.orderNumber}: ${statusMessages[order_status] || 'Status updated.'}`,
      orderId: order._id,
      userId: order.user || undefined,
      read: false
    });

    // Send status update email via server's built-in function
    try {
      const nodemailer = require('nodemailer');
      if (process.env.SMTP_USER) {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: false,
          auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
        });
        await transporter.sendMail({
          from: `"DG Electronics" <${process.env.SMTP_USER}>`,
          to: order.customer_email,
          subject: `Order #${order.orderNumber} Status: ${order_status.toUpperCase()} - DG Electronics`,
          html: `<div style="font-family:Poppins,Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f5f8ff">
            <div style="background:linear-gradient(135deg,#0f2c56,#3da7ff);padding:30px;border-radius:12px 12px 0 0;text-align:center">
              <h1 style="color:white;margin:0;font-size:24px">DG Electronics</h1>
              <p style="color:rgba(255,255,255,0.8);margin:5px 0 0">Order Status Update</p>
            </div>
            <div style="background:white;padding:30px;border-radius:0 0 12px 12px;box-shadow:0 4px 20px rgba(0,0,0,0.1)">
              <h2 style="color:#0f2c56;margin-top:0">Order #${order.orderNumber}</h2>
              <p style="color:#5f6f8a">Hello <strong>${order.customer_name}</strong>,</p>
              <p style="color:#5f6f8a;font-size:16px">${statusMessages[order_status] || 'Your order status has been updated.'}</p>
              <div style="background:#f8faff;padding:15px;border-radius:8px;margin:20px 0;text-align:center">
                <p style="margin:0;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:0.1em">Current Status</p>
                <p style="margin:5px 0;font-size:20px;font-weight:700;color:#0f2c56;text-transform:uppercase">${order_status}</p>
              </div>
              ${order.trackingNumber ? '<div style="background:#e3f2fd;padding:12px;border-radius:8px;margin:15px 0;text-align:center"><p style="margin:0;color:#1565c0;font-weight:600">Tracking Number: ' + order.trackingNumber + '</p></div>' : ''}
              <p style="color:#5f6f8a;font-size:14px">Track your order at: <a href="${process.env.BASE_URL || 'http://localhost:3000'}/track" style="color:#0f2c56;font-weight:600">Track Order</a></p>
            </div>
            <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:20px">© ${new Date().getFullYear()} DG Electronics. All rights reserved.</p>
          </div>`
        });
        console.log(`[EMAIL] Status update sent to ${order.customer_email}: ${oldStatus} → ${order_status}`);
      }
    } catch (e) { console.log(`[EMAIL ERROR] ${e.message}`); }

    res.json({ success: true, order });
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.patch('/admin/orders/:id/payment', async (req, res) => {
  try {
    const { payment_status, payment_ref } = req.body;
    const validStatuses = ['pending', 'paid', 'failed', 'refunded'];
    if (!validStatuses.includes(payment_status)) {
      return res.status(400).json({ error: 'Invalid payment status' });
    }
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const oldStatus = order.payment_status;
    order.payment_status = payment_status;
    if (payment_ref) order.payment_ref = payment_ref;
    if (payment_status === 'paid') order.paidAt = new Date();

    if (!order.statusHistory) order.statusHistory = [];
    order.statusHistory.push({
      status: 'payment_' + payment_status,
      timestamp: new Date(),
      note: `Payment status updated from ${oldStatus} to ${payment_status}` + (payment_ref ? ` (Ref: ${payment_ref})` : ''),
      updatedBy: 'admin'
    });

    await order.save();

    await Notification.create({
      type: 'order_status',
      title: `Payment ${payment_status.charAt(0).toUpperCase() + payment_status.slice(1)}`,
      message: `Order #${order.orderNumber}: Payment status changed to ${payment_status}.`,
      orderId: order._id,
      userId: order.user || undefined,
      read: false
    });

    res.json({ success: true, order });
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.get('/admin/reports/sales', async (req, res) => {
  try {
    const { period } = req.query;
    let groupId;
    if (period === 'weekly') {
      groupId = {
        year: { $year: '$createdAt' },
        week: { $isoWeek: '$createdAt' }
      };
    } else if (period === 'monthly') {
      groupId = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' }
      };
    } else {
      groupId = {
        year: { $year: '$createdAt' },
        month: { $month: '$createdAt' },
        day: { $dayOfMonth: '$createdAt' }
      };
    }

    const results = await Order.aggregate([
      { $match: { payment_status: 'paid' } },
      { $group: { _id: groupId, revenue: { $sum: '$total' }, orders: { $sum: 1 }, avgOrder: { $avg: '$total' } } },
      { $sort: { '_id.year': 1, '_id.month': 1, '_id.day': 1, '_id.week': 1 } }
    ]);

    const report = results.map(r => ({
      date: r._id.day
        ? `${r._id.year}-${String(r._id.month).padStart(2, '0')}-${String(r._id.day).padStart(2, '0')}`
        : r._id.week
          ? `${r._id.year}-W${String(r._id.week).padStart(2, '0')}`
          : `${r._id.year}-${String(r._id.month).padStart(2, '0')}`,
      revenue: r.revenue,
      orders: r.orders,
      avgOrder: Math.round(r.avgOrder)
    }));

    res.json(report);
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.get('/admin/reports/top-products', async (req, res) => {
  try {
    const results = await Order.aggregate([
      { $unwind: '$items' },
      { $group: {
        _id: '$items.product',
        name: { $first: '$items.name' },
        totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        totalQuantity: { $sum: '$items.quantity' }
      }},
      { $sort: { totalRevenue: -1 } },
      { $limit: 10 }
    ]);
    res.json(results);
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.get('/admin/reports/best-customers', async (req, res) => {
  try {
    const results = await Order.aggregate([
      { $group: {
        _id: '$user',
        name: { $first: '$customer_name' },
        email: { $first: '$customer_email' },
        totalOrders: { $sum: 1 },
        totalSpent: { $sum: '$total' }
      }},
      { $sort: { totalSpent: -1 } },
      { $limit: 10 }
    ]);
    res.json(results);
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.get('/admin/settings', async (req, res) => {
  try {
    const settings = await Settings.find();
    const obj = {};
    settings.forEach(s => { obj[s.key] = s.value; });
    res.json(obj);
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.put('/admin/settings', async (req, res) => {
  try {
    const allowedKeys = ['store_name', 'phone', 'email', 'address', 'whatsapp', 'social_media', 'delivery_fee', 'free_threshold', 'free_delivery_threshold', 'cash_on_delivery'];
    for (const [key, value] of Object.entries(req.body)) {
      if (!allowedKeys.includes(key)) continue;

      const normalizedKey = (key === 'free_threshold') ? 'free_delivery_threshold' : key;

      if (normalizedKey === 'social_media') {
        const social = validateInput(value);
        if (social.facebook && !validateEmail(social.facebook)) {
          return res.status(400).json({ error: 'Invalid facebook URL' });
        }
        await Settings.findOneAndUpdate({ key: normalizedKey }, { key: normalizedKey, value: social }, { upsert: true });
      } else if (normalizedKey === 'email') {
        if (!validateEmail(value)) {
          return res.status(400).json({ error: 'Invalid email address' });
        }
        await Settings.findOneAndUpdate({ key: normalizedKey }, { key: normalizedKey, value: validateInput({ v: value }).v }, { upsert: true });
      } else if (normalizedKey === 'phone' || normalizedKey === 'whatsapp') {
        if (!validatePhone(value)) {
          return res.status(400).json({ error: 'Invalid phone number' });
        }
        await Settings.findOneAndUpdate({ key: normalizedKey }, { key: normalizedKey, value: validateInput({ v: value }).v }, { upsert: true });
      } else if (normalizedKey === 'delivery_fee' || normalizedKey === 'free_delivery_threshold') {
        const num = Number(value);
        if (isNaN(num) || num < 0) {
          return res.status(400).json({ error: 'Invalid number value' });
        }
        await Settings.findOneAndUpdate({ key: normalizedKey }, { key: normalizedKey, value: num }, { upsert: true });
      } else if (typeof value === 'string') {
        await Settings.findOneAndUpdate({ key: normalizedKey }, { key: normalizedKey, value: validateInput({ v: value }).v }, { upsert: true });
      } else {
        await Settings.findOneAndUpdate({ key: normalizedKey }, { key: normalizedKey, value }, { upsert: true });
      }
    }
    res.json({ success: true });
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.get('/admin/inventory', async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const total = await Product.countDocuments();
    const products = await Product.find().select('name stock price category brand image').sort({ stock: 1 }).skip(skip).limit(Number(limit));
    res.json({ products, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.patch('/admin/inventory/:id/stock', async (req, res) => {
  try {
    const { stock } = req.body;
    if (stock === undefined || stock < 0) {
      return res.status(400).json({ error: 'Valid stock quantity required' });
    }
    const product = await Product.findByIdAndUpdate(req.params.id, { stock }, { new: true });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true, product });
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// ═══════════════════════════════════════════════
// ADMIN REVIEW MANAGEMENT
// ═══════════════════════════════════════════════

// List all reviews with pagination
router.get('/admin/reviews', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const sort = req.query.sort === 'oldest' ? { createdAt: 1 } : req.query.sort === 'rating_high' ? { rating: -1 } : req.query.sort === 'rating_low' ? { rating: 1 } : { createdAt: -1 };
    const filter = {};
    if (req.query.product) filter.product = req.query.product;
    if (req.query.rating) filter.rating = parseInt(req.query.rating);
    const [reviews, total] = await Promise.all([
      Review.find(filter).sort(sort).skip(skip).limit(limit).populate('user', 'name email').populate('product', 'name image slug'),
      Review.countDocuments(filter)
    ]);
    const stats = await Review.aggregate([
      { $group: { _id: null, total: { $sum: 1 }, avg: { $avg: '$rating' } } }
    ]);
    res.json({ reviews, total, page, pages: Math.ceil(total / limit), stats: stats[0] || { total: 0, avg: 0 } });
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// Delete any review (admin)
router.delete('/admin/reviews/:id', async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    const productId = review.product;
    await Review.findByIdAndDelete(req.params.id);
    // Recalculate product average
    const allReviews = await Review.find({ product: productId });
    const avgRating = allReviews.length > 0 ? allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length : 0;
    await Product.findByIdAndUpdate(productId, { rating: Math.round(avgRating * 10) / 10, reviews: allReviews.length });
    res.json({ success: true });
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// ═══════════════════════════════════════════════
// ADMIN SUPPORT TICKETS
// ═══════════════════════════════════════════════

router.get('/admin/tickets', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const skip = (page - 1) * limit;
    const [tickets, total, stats] = await Promise.all([
      SupportTicket.find().sort({ createdAt: -1 }).skip(skip).limit(limit).populate('user', 'name email').populate('orderRef', 'orderNumber'),
      SupportTicket.countDocuments(),
      SupportTicket.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
      ])
    ]);
    const statObj = { total, open: 0, in_progress: 0, resolved: 0, closed: 0, waiting_customer: 0 };
    stats.forEach(s => { if (statObj[s._id] !== undefined) statObj[s._id] = s.count; });
    res.json({ tickets, total, page, pages: Math.ceil(total / limit), stats: statObj });
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.get('/admin/tickets/:ticketNumber', async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({ ticketNumber: req.params.ticketNumber }).populate('user', 'name email').populate('orderRef', 'orderNumber');
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    res.json(ticket);
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.post('/admin/tickets/:ticketNumber/reply', async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({ ticketNumber: req.params.ticketNumber });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    ticket.messages.push({ sender: 'admin', senderName: 'Admin', text: req.body.text });
    ticket.updatedAt = new Date();
    await ticket.save();
    res.json(ticket);
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.patch('/admin/tickets/:ticketNumber/status', async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({ ticketNumber: req.params.ticketNumber });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    ticket.status = req.body.status;
    ticket.updatedAt = new Date();
    await ticket.save();
    if (ticket.user) {
      const notif = new Notification({ type: 'info', title: 'Ticket Updated', message: 'Your ticket ' + ticket.ticketNumber + ' status: ' + ticket.status, userId: ticket.user });
      await notif.save();
    }
    res.json(ticket);
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// ═══════════════════════════════════════════════
// ADMIN RETURNS
// ═══════════════════════════════════════════════

router.get('/admin/returns', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 15;
    const skip = (page - 1) * limit;
    const [returns, total, stats] = await Promise.all([
      ReturnRequest.find().sort({ createdAt: -1 }).skip(skip).limit(limit).populate('user', 'name email'),
      ReturnRequest.countDocuments(),
      ReturnRequest.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
    ]);
    const statObj = { total, pending: 0, approved: 0, rejected: 0, completed: 0, cancelled: 0 };
    stats.forEach(s => { if (statObj[s._id] !== undefined) statObj[s._id] = s.count; });
    res.json({ returns, total, page, pages: Math.ceil(total / limit), stats: statObj });
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.get('/admin/returns/:id', async (req, res) => {
  try {
    const ret = await ReturnRequest.findById(req.params.id).populate('user', 'name email');
    if (!ret) return res.status(404).json({ error: 'Return not found' });
    res.json(ret);
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.patch('/admin/returns/:id/status', async (req, res) => {
  try {
    const ret = await ReturnRequest.findById(req.params.id);
    if (!ret) return res.status(404).json({ error: 'Return not found' });
    ret.status = req.body.status;
    if (req.body.adminResponse) ret.adminResponse = req.body.adminResponse;
    ret.statusHistory.push({ status: req.body.status, note: req.body.adminResponse || 'Status updated by admin' });
    ret.updatedAt = new Date();
    await ret.save();
    if (ret.user) {
      const notif = new Notification({ type: 'info', title: 'Return Request Updated', message: 'Your return request ' + ret.requestNumber + ' has been ' + ret.status, userId: ret.user });
      await notif.save();
    }
    res.json(ret);
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// ═══════════════════════════════════════════════
// ADMIN LIVE CHAT
// ═══════════════════════════════════════════════

router.get('/admin/chats', async (req, res) => {
  try {
    const chats = await ChatMessage.find().sort({ updatedAt: -1 }).limit(50);
    const open = chats.filter(c => c.status === 'open').length;
    const closed = chats.filter(c => c.status === 'closed').length;
    res.json({ chats, open, closed });
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.get('/admin/chats/:sessionId', async (req, res) => {
  try {
    const chat = await ChatMessage.findOne({ sessionId: req.params.sessionId });
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    res.json(chat);
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.post('/admin/chats/:sessionId/reply', async (req, res) => {
  try {
    const chat = await ChatMessage.findOne({ sessionId: req.params.sessionId });
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    chat.messages.push({ sender: 'admin', text: req.body.text });
    chat.updatedAt = new Date();
    await chat.save();
    res.json(chat);
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.post('/admin/chats/:sessionId/close', async (req, res) => {
  try {
    const chat = await ChatMessage.findOne({ sessionId: req.params.sessionId });
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    chat.status = 'closed';
    chat.updatedAt = new Date();
    await chat.save();
    res.json({ success: true });
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// ═══════════════════════════════════════════════
// CATEGORY MANAGEMENT
// ═══════════════════════════════════════════════

router.get('/admin/categories', async (req, res) => {
  try {
    const VALID_CATEGORIES = await getValidCategories();
    const categories = await Product.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 }, brands: { $addToSet: '$brand' } } },
      { $sort: { _id: 1 } }
    ]);
    const all = VALID_CATEGORIES.map(c => {
      const found = categories.find(x => x._id === c);
      return { name: c, count: found ? found.count : 0, brands: found ? found.brands.filter(Boolean) : [] };
    });
    res.json({ categories: all, validCategories: VALID_CATEGORIES });
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.post('/admin/categories', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'Category name is required' });
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/(^_|_$)/g, '');
    const VALID_CATEGORIES = await getValidCategories();
    if (VALID_CATEGORIES.includes(slug)) {
      return res.status(400).json({ error: 'Category already exists' });
    }
    VALID_CATEGORIES.push(slug);
    await saveValidCategories(VALID_CATEGORIES);
    res.json({ success: true, categories: VALID_CATEGORIES });
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.delete('/admin/categories/:name', async (req, res) => {
  try {
    const name = req.params.name;
    const count = await Product.countDocuments({ category: name });
    if (count > 0) {
      return res.status(400).json({ error: `Cannot delete: ${count} products still use this category` });
    }
    const VALID_CATEGORIES = await getValidCategories();
    const idx = VALID_CATEGORIES.indexOf(name);
    if (idx > -1) VALID_CATEGORIES.splice(idx, 1);
    await saveValidCategories(VALID_CATEGORIES);
    res.json({ success: true, categories: VALID_CATEGORIES });
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// ═══════════════════════════════════════════════
// BRAND MANAGEMENT
// ═══════════════════════════════════════════════

router.get('/admin/brands', async (req, res) => {
  try {
    const brands = await Product.aggregate([
      { $match: { brand: { $ne: '' } } },
      { $group: { _id: '$brand', count: { $sum: 1 }, categories: { $addToSet: '$category' } } },
      { $sort: { count: -1 } }
    ]);
    res.json({ brands: brands.map(b => ({ name: b._id, count: b.count, categories: b.categories })) });
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.put('/admin/brands/:oldName', async (req, res) => {
  try {
    const { name: newName } = req.body;
    if (!newName) return res.status(400).json({ error: 'New brand name is required' });
    const result = await Product.updateMany({ brand: req.params.oldName }, { brand: newName });
    res.json({ success: true, updated: result.modifiedCount });
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.delete('/admin/brands/:name', async (req, res) => {
  try {
    const result = await Product.updateMany({ brand: req.params.name }, { brand: '' });
    res.json({ success: true, updated: result.modifiedCount });
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// ═══════════════════════════════════════════════
// DASHBOARD BEST-SELLERS & LOW STOCK
// ═══════════════════════════════════════════════

router.get('/admin/bestsellers', async (req, res) => {
  try {
    const results = await Order.aggregate([
      { $unwind: '$items' },
      { $group: {
        _id: '$items.product',
        name: { $first: '$items.name' },
        image: { $first: '$items.image' },
        totalQuantity: { $sum: '$items.quantity' },
        totalRevenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } }
      }},
      { $sort: { totalQuantity: -1 } },
      { $limit: 5 }
    ]);
    res.json(results);
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

router.get('/admin/low-stock', async (req, res) => {
  try {
    const products = await Product.find({ stock: { $gte: 0, $lt: 10 } })
      .select('name stock price category brand image')
      .sort({ stock: 1 })
      .limit(20);
    res.json(products);
  } catch (err) { console.error('[ADMIN ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

module.exports = router;
