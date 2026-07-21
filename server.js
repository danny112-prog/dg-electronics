require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const nodemailer = require('nodemailer');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3000;
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Exiting.');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;
const mongoUri = process.env.MONGODB_URI;

mongoose.connect(mongoUri)
  .then(() => console.log("MongoDB connected"))
  .catch((err) => {
    console.error("MongoDB connection error:", err.message);
    process.exit(1);  
   });
// ── Paystack Config ──
const PAYSTACK_PUBLIC_KEY = process.env.PAYSTACK_PUBLIC_KEY || '';
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_WEBHOOK_SECRET = process.env.PAYSTACK_WEBHOOK_SECRET || '';
const FLUTTERWAVE_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY || '';
if (!PAYSTACK_PUBLIC_KEY || PAYSTACK_PUBLIC_KEY.startsWith('pk_test_xxx')) {
  console.log('WARNING: PAYSTACK_PUBLIC_KEY is not set or is a placeholder. Set it in your .env file!');
}
if (!PAYSTACK_SECRET_KEY || PAYSTACK_SECRET_KEY.startsWith('sk_test_xxx')) {
  console.log('WARNING: PAYSTACK_SECRET_KEY is not set or is a placeholder. Set it in your .env file!');
}

// ── Middleware ──
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://js.paystack.co", "https://checkout.flutterwave.com"],
      scriptSrcAttr: ["'none'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.paystack.co", "https://api.flutterwave.com"],
      frameSrc: ["'self'", "https://js.paystack.co", "https://checkout.flutterwave.com"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  next();
});
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'],
  credentials: true
}));
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// ── Input Sanitization Helper ──
function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[<>]/g, '').trim();
}
function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function pick(obj, keys) {
  const result = {};
  for (const key of keys) {
    if (obj[key] !== undefined) result[key] = obj[key];
  }
  return result;
}
function isValidPassword(pw) {
  return typeof pw === 'string' && pw.length >= 8 && /[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw);
}
function generateCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

const ONE_HOUR = 3600;
const ONE_DAY = 86400;
const ONE_WEEK = 604800;

// ── Set CSRF token cookie on every request (before static) ──
app.use((req, res, next) => {
  if (!req.cookies?.csrf_token) {
    const token = generateCsrfToken();
    res.cookie('csrf_token', token, { httpOnly: false, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 3600000 });
  }
  next();
});

// ── CSRF Protection (Double-Submit Cookie Pattern) ──
const CSRF_EXEMPT_PATHS = ['/api/auth/login', '/api/auth/signup', '/api/auth/forgot-password', '/api/webhooks/'];
function csrfProtection(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  if (CSRF_EXEMPT_PATHS.some(p => req.path.startsWith(p))) return next();
  const token = req.cookies?.csrf_token || '';
  const header = req.headers['x-csrf-token'] || '';
  if (!token || !header || token !== header) {
    return res.status(403).json({ error: 'Invalid or missing CSRF token' });
  }
  next();
}
app.use(csrfProtection);

// Block direct access to admin.html — must go through /admin route with auth
app.get('/admin.html', (req, res) => res.status(403).sendFile(path.join(__dirname, 'public', '404.html')));

app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: ONE_WEEK,
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    } else if (filePath.match(/\.(jpg|jpeg|png|webp|gif|svg|ico)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=' + ONE_WEEK + ', immutable');
    } else if (filePath.match(/\.(css|js)$/)) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    } else if (filePath.match(/\.(woff|woff2|ttf|eot)$/)) {
      res.setHeader('Cache-Control', 'public, max-age=' + ONE_WEEK + ', immutable');
    }
  }
}));

app.use('/uploads', express.static(path.join(__dirname, 'public/uploads'), {
  maxAge: ONE_WEEK,
  immutable: true
}));

const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 200 });
app.use('/api/', limiter);

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { error: 'Too many login attempts. Please try again after 15 minutes.' } });
const signupLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 3, message: { error: 'Too many signup attempts. Please try again later.' } });
const forgotPasswordLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 3, message: { error: 'Too many password reset attempts. Please try again later.' } });
const homepageLimiter = rateLimit({ windowMs: 60 * 1000, max: 30 });
const contactLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, message: { error: 'Too many requests. Please try again later.' } });
const newsletterLimiter = rateLimit({ windowMs: 60 * 1000, max: 5, message: { error: 'Too many requests. Please try again later.' } });
const orderLookupLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many lookup attempts. Please try again later.' } });
const chatLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: 'Too many requests.' } });



// ═══════════════════════════════════════════════
// MONGOOSE SCHEMAS
// ═══════════════════════════════════════════════

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  phone: { type: String, trim: true },
  password: { type: String, required: true, minlength: 6 },
  role: { type: String, enum: ['customer', 'admin'], default: 'customer' },
  addresses: [{
    label: String,
    street: String,
    city: String,
    state: String,
    isDefault: { type: Boolean, default: false }
  }],
  wishlist: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  createdAt: { type: Date, default: Date.now }
});

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, unique: true, lowercase: true },
  category: { type: String, required: true, enum: ['phones', 'laptops', 'tablets', 'smartwatches', 'headphones', 'speakers', 'gaming', 'tvs', 'accessories', 'networking', 'computer_components'] },
  brand: { type: String, default: '' },
  price: { type: Number, required: true },
  oldPrice: { type: Number, default: 0 },
  description: { type: String, default: '' },
  specifications: { type: Map, of: String, default: {} },
  image: { type: String, default: '' },
  images: [String],
  badge: { type: String, enum: ['new', 'sale', 'hot', 'bestseller', null], default: null },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  reviews: { type: Number, default: 0 },
  stock: { type: Number, default: 0 },
  featured: { type: Boolean, default: false },
  bestSeller: { type: Boolean, default: false },
  colors: [{ name: String, hex: String }],
  features: [String],
  storageOptions: [{ label: String, price: Number }],
  returnPolicy: { type: String, default: '30-day hassle-free returns' },
  warranty: { type: String, default: '2-year manufacturer warranty' },
  estimatedDelivery: { type: String, default: '2-5 business days' },
  createdAt: { type: Date, default: Date.now }
});
productSchema.index({ category: 1 });
productSchema.index({ brand: 1 });
productSchema.index({ featured: 1 });
productSchema.index({ bestSeller: 1 });
productSchema.index({ stock: 1 });
productSchema.index({ price: 1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ rating: -1, reviews: -1 });
productSchema.index({ name: 'text', description: 'text', brand: 'text', category: 'text' }, { weights: { name: 10, brand: 5, category: 3, description: 1 } });

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, unique: true },
  trackingNumber: { type: String, unique: true, sparse: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  customer_name: { type: String, required: true },
  customer_email: { type: String, required: true },
  customer_phone: { type: String, required: true },
  delivery_address: { type: String, required: true },
  delivery_state: { type: String, default: '' },
  delivery_city: { type: String, default: '' },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    price: Number,
    quantity: Number,
    image: String
  }],
  subtotal: { type: Number, required: true },
  delivery_fee: { type: Number, default: 2000 },
  total: { type: Number, required: true },
  payment_method: { type: String, default: 'paystack_card', enum: ['paystack_card', 'paystack_bank', 'paystack_ussd', 'flutterwave_card', 'flutterwave_bank', 'flutterwave_ussd', 'apple_pay', 'google_pay', 'bank_transfer', 'cod'] },
  payment_status: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
  order_status: { type: String, enum: ['pending', 'processing', 'confirmed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'], default: 'pending' },
  statusHistory: [{
    status: String,
    timestamp: { type: Date, default: Date.now },
    note: String,
    updatedBy: String
  }],
  payment_ref: { type: String },
  paidAt: { type: Date },
  shippedAt: { type: Date },
  deliveredAt: { type: Date },
  shipping_notes: { type: String, default: '' },
  carrier: { type: String, default: '' },
  coupon_code: { type: String, default: '' },
  discount: { type: Number, default: 0 },
  notes: { type: String, default: '' },
  estimatedDelivery: { type: String, default: '' },
  estimatedDeliveryDate: { type: Date },
  cancelReason: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now }
});
orderSchema.index({ user: 1 });
orderSchema.index({ order_status: 1 });
orderSchema.index({ payment_status: 1 });
orderSchema.index({ createdAt: -1 });
orderSchema.index({ orderNumber: 1 });

const notificationSchema = new mongoose.Schema({
  type: { type: String, enum: ['new_order', 'low_stock', 'new_customer', 'order_status', 'payment', 'info'], required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
notificationSchema.index({ read: 1, createdAt: -1 });

const cartSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true },
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    price: Number,
    image: String,
    quantity: { type: Number, default: 1 }
  }],
  updatedAt: { type: Date, default: Date.now }
});

const settingsSchema = new mongoose.Schema({
  key: { type: String, unique: true },
  value: mongoose.Schema.Types.Mixed
});

const reviewSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: String,
  rating: { type: Number, required: true, min: 1, max: 5 },
  title: { type: String, default: '' },
  comment: String,
  photos: [{ type: String }],
  helpful: { type: Number, default: 0 },
  helpfulBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  verified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});
reviewSchema.index({ product: 1, createdAt: -1 });
reviewSchema.index({ helpful: -1 });

// ── Coupon Schema ──
const couponSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  description: { type: String, default: '' },
  type: { type: String, enum: ['percentage', 'fixed', 'free_shipping', 'bogo'], required: true },
  value: { type: Number, default: 0 },
  minOrder: { type: Number, default: 0 },
  maxDiscount: { type: Number, default: 0 },
  usageLimit: { type: Number, default: 0 },
  usedCount: { type: Number, default: 0 },
  perUserLimit: { type: Number, default: 1 },
  applicableProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  applicableCategories: [{ type: String }],
  excludeProducts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  startDate: { type: Date, default: Date.now },
  endDate: { type: Date },
  active: { type: Boolean, default: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});
couponSchema.index({ active: 1, startDate: 1, endDate: 1 });

// ── Promotion Schema ──
const promotionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  slug: { type: String, unique: true, lowercase: true },
  description: { type: String, default: '' },
  type: { type: String, enum: ['flash_sale', 'daily_deal', 'weekly_deal', 'holiday', 'clearance', 'bundle', 'custom'], required: true },
  discountType: { type: String, enum: ['percentage', 'fixed'], default: 'percentage' },
  discountValue: { type: Number, required: true },
  products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  categories: [{ type: String }],
  couponCode: { type: String, default: '' },
  bannerImage: { type: String, default: '' },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  active: { type: Boolean, default: true },
  featured: { type: Boolean, default: false },
  priority: { type: Number, default: 0 },
  maxUses: { type: Number, default: 0 },
  currentUses: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});
promotionSchema.index({ active: 1, startDate: 1, endDate: 1 });
promotionSchema.index({ type: 1 });

// ── Newsletter Subscriber Schema ──
const newsletterSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  name: { type: String, default: '' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  subscribed: { type: Boolean, default: true },
  tags: [{ type: String }],
  lastEmailSent: { type: Date },
  createdAt: { type: Date, default: Date.now }
});
newsletterSchema.index({ subscribed: 1 });

// ── Analytics Event Schema ──
const analyticsSchema = new mongoose.Schema({
  eventType: { type: String, enum: ['page_view', 'product_view', 'add_to_cart', 'purchase', 'coupon_use', 'search', 'newsletter_signup', 'review', 'wishlist_add'], required: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sessionId: { type: String, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  amount: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});
analyticsSchema.index({ eventType: 1, createdAt: -1 });
analyticsSchema.index({ productId: 1 });
analyticsSchema.index({ createdAt: -1 });

const User = mongoose.model('User', userSchema);
const Product = mongoose.model('Product', productSchema);
const Order = mongoose.model('Order', orderSchema);
const Review = mongoose.model('Review', reviewSchema);
const Settings = mongoose.model('Settings', settingsSchema);
const Cart = mongoose.model('Cart', cartSchema);
const Notification = mongoose.model('Notification', notificationSchema);
const Coupon = mongoose.model('Coupon', couponSchema);
const Promotion = mongoose.model('Promotion', promotionSchema);
const Newsletter = mongoose.model('Newsletter', newsletterSchema);
const Analytics = mongoose.model('Analytics', analyticsSchema);

// ── Support Schemas ──
const chatMessageSchema = new mongoose.Schema({
  sessionId: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, default: 'Guest' },
  email: String,
  messages: [{
    sender: { type: String, enum: ['user', 'admin'], required: true },
    text: { type: String, required: true },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
  }],
  status: { type: String, enum: ['open', 'closed'], default: 'open' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
chatMessageSchema.index({ sessionId: 1 });
chatMessageSchema.index({ status: 1, createdAt: -1 });

const supportTicketSchema = new mongoose.Schema({
  ticketNumber: { type: String, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: String,
  subject: { type: String, required: true },
  category: { type: String, enum: ['orders', 'payments', 'shipping', 'returns', 'warranty', 'account', 'technical', 'other'], default: 'other' },
  priority: { type: String, enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' },
  status: { type: String, enum: ['open', 'in_progress', 'waiting_customer', 'resolved', 'closed'], default: 'open' },
  orderRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  messages: [{
    sender: { type: String, enum: ['customer', 'admin'], required: true },
    senderName: String,
    text: { type: String, required: true },
    attachments: [String],
    createdAt: { type: Date, default: Date.now }
  }],
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
supportTicketSchema.index({ user: 1, createdAt: -1 });
supportTicketSchema.index({ status: 1, priority: -1 });

const returnRequestSchema = new mongoose.Schema({
  requestNumber: { type: String, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
  orderNumber: String,
  items: [{
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
    name: String,
    quantity: Number,
    price: Number,
    reason: String
  }],
  type: { type: String, enum: ['return', 'refund', 'exchange'], default: 'return' },
  reason: { type: String, required: true },
  description: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'completed', 'cancelled'], default: 'pending' },
  adminResponse: String,
  refundAmount: Number,
  refundMethod: String,
  trackingNumber: String,
  statusHistory: [{
    status: String,
    note: String,
    date: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
returnRequestSchema.index({ user: 1, createdAt: -1 });
returnRequestSchema.index({ status: 1 });

const faqSchema = new mongoose.Schema({
  question: { type: String, required: true },
  answer: { type: String, required: true },
  category: { type: String, enum: ['orders', 'payments', 'shipping', 'returns', 'warranty', 'account'], required: true },
  order: { type: Number, default: 0 },
  helpful: { type: Number, default: 0 },
  active: { type: Boolean, default: true }
});
faqSchema.index({ category: 1, order: 1 });

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);
const SupportTicket = mongoose.model('SupportTicket', supportTicketSchema);
const ReturnRequest = mongoose.model('ReturnRequest', returnRequestSchema);
const FAQ = mongoose.model('FAQ', faqSchema);

const adminRoutes = require('./routes/admin');

// ── Auth Middleware ──
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

function optionalAuth(req, res, next) {
  const token = req.header('Authorization')?.replace('Bearer ', '') || req.cookies?.token;
  if (!token) return next();
  try { req.user = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }); } catch {}
  next();
}

// ── Generate Order Number ──
async function generateOrderNumber() {
  const date = new Date();
  const prefix = 'DG';
  const timestamp = date.getFullYear().toString().slice(-2) + String(date.getMonth() + 1).padStart(2, '0') + String(date.getDate()).padStart(2, '0');
  for (let attempt = 0; attempt < 5; attempt++) {
    const random = crypto.randomBytes(3).toString('hex').toUpperCase();
    const candidate = `${prefix}-${timestamp}-${random}`;
    const exists = await Order.findOne({ orderNumber: candidate });
    if (!exists) return candidate;
  }
  const fallback = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}-${timestamp}-${fallback}`;
}

// ── Generate Tracking Number ──
function generateTrackingNumber() {
  return 'DG-TRK-' + crypto.randomBytes(5).toString('hex').toUpperCase();
}

// ── Create Notification ──
async function createNotification(type, title, message, extra = {}) {
  try {
    await Notification.create({ type, title, message, ...extra });
  } catch (err) { console.log('[NOTIFICATION ERROR]', err.message); }
}

function formatPrice(n) { return '₦' + Number(n).toLocaleString('en-NG'); }

// ── Status Labels ──
const STATUS_LABELS = {
  pending: 'Order Received',
  processing: 'Payment Confirmed',
  confirmed: 'Preparing Order',
  shipped: 'Shipped',
  out_for_delivery: 'Out for Delivery',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
};

// ═══════════════════════════════════════════════
// AUTH ROUTES
// ═══════════════════════════════════════════════

app.post('/api/auth/signup', signupLimiter, async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password required' });
    if (typeof email !== 'string' || !isValidEmail(email)) return res.status(400).json({ error: 'Invalid email format' });
    if (!isValidPassword(password)) return res.status(400).json({ error: 'Password must be at least 8 characters with uppercase, lowercase, and a number' });
    if (typeof name !== 'string' || name.trim().length < 2) return res.status(400).json({ error: 'Valid name required' });

    const exists = await User.findOne({ email: email.toLowerCase().trim() });
    if (exists) return res.status(400).json({ error: 'Email already registered' });

    const hash = await bcrypt.hash(password, 12);
    const user = await User.create({ name: sanitizeString(name), email: email.toLowerCase().trim(), phone: typeof phone === 'string' ? phone : '', password: hash });

    const isProduction = process.env.NODE_ENV === 'production';
    const token = jwt.sign({ id: user._id, role: user.role, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '1h', algorithm: 'HS256' });
    res.cookie('token', token, { httpOnly: true, secure: isProduction, sameSite: 'strict', maxAge: 60 * 60 * 1000 });
    res.json({ success: true, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error('[AUTH] Signup error:', err.message);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

app.post('/api/auth/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (typeof email !== 'string' || typeof password !== 'string') return res.status(400).json({ error: 'Invalid input' });
    if (!isValidEmail(email)) return res.status(400).json({ error: 'Invalid email format' });
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign({ id: user._id, role: user.role, name: user.name, email: user.email }, JWT_SECRET, { expiresIn: '1h', algorithm: 'HS256' });
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('token', token, { httpOnly: true, secure: isProduction, sameSite: 'strict', maxAge: 60 * 60 * 1000 });
    res.json({ success: true, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (err) {
    console.error('[AUTH] Login error:', err.message);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

app.post('/api/auth/forgot-password', forgotPasswordLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    const safeEmail = typeof email === 'string' ? email.toLowerCase().trim() : '';
    const user = isValidEmail(safeEmail) ? await User.findOne({ email: safeEmail }) : null;
    if (user) {
      // In production, send reset email here
    }
    // Always return same message to prevent user enumeration
    res.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
  } catch (err) {
    console.error('[AUTH] Forgot password error:', err.message);
    res.json({ success: true, message: 'If an account exists, a reset link has been sent.' });
  }
});

app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.post('/api/auth/logout', (req, res) => {
  const isProduction = process.env.NODE_ENV === 'production';
  res.clearCookie('token', { httpOnly: true, secure: isProduction, sameSite: 'strict' });
  res.json({ success: true });
});

// ═══════════════════════════════════════════════
// USER ROUTES
// ═══════════════════════════════════════════════

app.put('/api/users/profile', auth, async (req, res) => {
  try {
    const { name, phone } = req.body;
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return res.status(400).json({ error: 'Valid name required' });
    }
    if (phone && typeof phone !== 'string') {
      return res.status(400).json({ error: 'Invalid phone number' });
    }
    const user = await User.findByIdAndUpdate(req.user.id, { name: sanitizeString(name), phone: sanitizeString(phone || '') }, { new: true }).select('-password');
    res.json(user);
  } catch (err) {
    console.error('[USER] Profile update error:', err.message);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

app.post('/api/users/addresses', auth, async (req, res) => {
  try {
    const { label, street, city, state, isDefault } = req.body;
    if (!street || typeof street !== 'string' || !city || typeof city !== 'string') {
      return res.status(400).json({ error: 'Street and city are required' });
    }
    const user = await User.findById(req.user.id);
    user.addresses.push({
      label: sanitizeString(label || ''),
      street: sanitizeString(street),
      city: sanitizeString(city),
      state: sanitizeString(state || ''),
      isDefault: !!isDefault
    });
    await user.save();
    res.json(user.addresses);
  } catch (err) {
    console.error('[USER] Address add error:', err.message);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

app.delete('/api/users/addresses/:addrId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    user.addresses = user.addresses.filter(a => a._id.toString() !== req.params.addrId);
    await user.save();
    res.json(user.addresses);
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.get('/api/users/wishlist', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).populate('wishlist');
    res.json(user.wishlist);
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.post('/api/users/wishlist/:productId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const idx = user.wishlist.indexOf(req.params.productId);
    if (idx > -1) { user.wishlist.splice(idx, 1); } else { user.wishlist.push(req.params.productId); }
    await user.save();
    res.json({ success: true, wishlist: user.wishlist });
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// ═══════════════════════════════════════════════
// PRODUCT ROUTES
// ═══════════════════════════════════════════════

app.get('/api/products', async (req, res) => {
  try {
    const { category, brand, search, sort, minPrice, maxPrice, maxRating, featured, bestSeller, newest, inStock, onSale, page = 1, limit = 12 } = req.query;
    let filter = {};
    if (category && category !== 'all') filter.category = category;
    if (brand) {
      const brands = brand.split(',').map(b => b.trim());
      filter.brand = { $in: brands.map(b => new RegExp('^' + b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$', 'i')) };
    }
    if (search) {
      const safeSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const terms = search.trim().split(/\s+/).filter(Boolean);
      if (terms.length === 1) {
        filter.$or = [
          { name: { $regex: safeSearch, $options: 'i' } },
          { description: { $regex: safeSearch, $options: 'i' } },
          { brand: { $regex: safeSearch, $options: 'i' } },
          { category: { $regex: safeSearch, $options: 'i' } }
        ];
      } else {
        const safeTerms = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        filter.$and = safeTerms.map(term => ({
          $or: [
            { name: { $regex: term, $options: 'i' } },
            { description: { $regex: term, $options: 'i' } },
            { brand: { $regex: term, $options: 'i' } },
            { category: { $regex: term, $options: 'i' } }
          ]
        }));
      }
    }
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) filter.price.$gte = Number(minPrice);
      if (maxPrice) filter.price.$lte = Number(maxPrice);
    }
    if (maxRating) filter.rating = { $lte: Number(maxRating) };
    if (featured === 'true') filter.featured = true;
    if (bestSeller === 'true') filter.bestSeller = true;
    if (inStock === 'true') filter.stock = { $gt: 0 };
    if (onSale === 'true') filter.oldPrice = { $gt: 0 };

    let sortObj = {};
    switch (sort) {
      case 'price-low': sortObj.price = 1; break;
      case 'price-high': sortObj.price = -1; break;
      case 'newest': sortObj.createdAt = -1; break;
      case 'popularity': sortObj.reviews = -1; break;
      case 'rating': sortObj.rating = -1; break;
      case 'best-selling': sortObj.bestSeller = -1; sortObj.reviews = -1; break;
      case 'featured': sortObj.featured = -1; sortObj.rating = -1; break;
      case 'name-az': sortObj.name = 1; break;
      case 'name-za': sortObj.name = -1; break;
      default: sortObj.createdAt = -1;
    }

    const pageNum = Math.max(1, parseInt(page));
    const pageSize = Math.min(50, Math.max(1, parseInt(limit)));
    const skip = (pageNum - 1) * pageSize;

    const selectFields = 'name slug category brand price oldPrice image rating reviews stock featured bestSeller badge colors storageOptions createdAt';
    const [products, total] = await Promise.all([
      Product.find(filter).select(selectFields).sort(sortObj).skip(skip).limit(pageSize).lean(),
      Product.countDocuments(filter)
    ]);

    res.json({
      products,
      pagination: {
        page: pageNum,
        limit: pageSize,
        total,
        pages: Math.ceil(total / pageSize),
        hasMore: pageNum * pageSize < total
      }
    });
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.get('/api/products/suggest', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 2) return res.json([]);
    const terms = q.trim().split(/\s+/);
    const regexes = terms.map(t => new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    const conditions = regexes.map(r => ({
      $or: [
        { name: r },
        { brand: r },
        { category: r }
      ]
    }));
    const suggestions = await Product.find({ $and: conditions })
      .select('name slug brand category price image rating oldPrice')
      .limit(8)
      .sort({ rating: -1, reviews: -1 })
      .lean();
    res.json(suggestions);
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.get('/api/products/brands', async (req, res) => {
  try {
    const { category } = req.query;
    let filter = {};
    if (category && category !== 'all') filter.category = category;
    const brands = await Product.distinct('brand', filter);
    res.json(brands.filter(Boolean).sort());
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    let product = null;
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      product = await Product.findById(req.params.id).lean();
    }
    if (!product) product = await Product.findOne({ slug: req.params.id }).lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });
    trackEvent('product_view', { productId: product._id, sessionId: req.headers['x-session-id'] || '' });
    const [reviews, related] = await Promise.all([
      Review.find({ product: product._id }).select('name rating title comment helpful createdAt user photos verified').sort({ createdAt: -1 }).limit(10).populate('user', 'name').lean(),
      Product.find({ category: product.category, _id: { $ne: product._id } }).select('name slug category brand price oldPrice image rating reviews stock featured bestSeller badge').limit(4).lean()
    ]);
    res.json({ ...product, reviews, related });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// ═══════════════════════════════════════════════
// ORDER ROUTES
// ═══════════════════════════════════════════════

// ── Email Configuration ──
// Configure your SMTP settings in environment variables or replace defaults
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

async function sendOrderConfirmationEmail(order) {
  try {
    const paymentLabels = {
      'paystack_card': 'Card (Paystack)', 'flutterwave_card': 'Card (Flutterwave)',
      'paystack_bank': 'Bank Transfer (Paystack)', 'paystack_ussd': 'USSD',
      'flutterwave_bank': 'Bank Transfer (Flutterwave)', 'bank_transfer': 'Manual Bank Transfer', 'cod': 'Cash on Delivery'
    };
    const itemsList = order.items.map(i =>
      `<tr><td style="padding:8px;border-bottom:1px solid #eee">${i.name}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:center">${i.quantity}</td><td style="padding:8px;border-bottom:1px solid #eee;text-align:right">₦${(i.price * i.quantity).toLocaleString()}</td></tr>`
    ).join('');

    const html = `
    <div style="font-family:Poppins,Arial,sans-serif;max-width:600px;margin:0 auto;background:#f5f8ff;padding:20px">
      <div style="background:linear-gradient(135deg,#0f2c56,#3da7ff);padding:30px;border-radius:12px 12px 0 0;text-align:center">
        <h1 style="color:white;margin:0;font-size:24px">DG Electronics</h1>
        <p style="color:rgba(255,255,255,0.8);margin:5px 0 0">Order Confirmation</p>
      </div>
      <div style="background:white;padding:30px;border-radius:0 0 12px 12px;box-shadow:0 4px 20px rgba(0,0,0,0.1)">
        <h2 style="color:#0f2c56;margin-top:0">Order #${order.orderNumber}</h2>
        <p style="color:#5f6f8a">Thank you for your order, <strong>${order.customer_name}</strong>! We've received your order and will begin processing it right away.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0">
          <thead><tr style="background:#f8faff"><th style="padding:8px;text-align:left;border-bottom:2px solid #e0e6f0">Item</th><th style="padding:8px;text-align:center;border-bottom:2px solid #e0e6f0">Qty</th><th style="padding:8px;text-align:right;border-bottom:2px solid #e0e6f0">Price</th></tr></thead>
          <tbody>${itemsList}</tbody>
        </table>
        <div style="background:#f8faff;padding:15px;border-radius:8px;margin:20px 0">
          <p style="margin:5px 0"><strong>Subtotal:</strong> ₦${(order.subtotal || 0).toLocaleString()}</p>
          <p style="margin:5px 0"><strong>Delivery:</strong> ${order.delivery_fee === 0 ? 'FREE' : '₦' + (order.delivery_fee || 0).toLocaleString()}</p>
          <p style="margin:5px 0;font-size:18px;color:#0f2c56"><strong>Total: ₦${(order.total || 0).toLocaleString()}</strong></p>
        </div>
        <div style="margin:20px 0">
          <p style="margin:5px 0"><strong>Payment Method:</strong> ${paymentLabels[order.payment_method] || order.payment_method}</p>
          <p style="margin:5px 0"><strong>Payment Status:</strong> ${(order.payment_status || 'pending').toUpperCase()}</p>
          <p style="margin:5px 0"><strong>Tracking Number:</strong> ${order.trackingNumber || 'Pending'}</p>
          <p style="margin:5px 0"><strong>Delivery Address:</strong> ${[order.delivery_address, order.delivery_city, order.delivery_state].filter(Boolean).join(', ')}</p>
        </div>
        <div style="background:#e8f5e9;padding:12px;border-radius:8px;margin:15px 0;text-align:center">
          <p style="margin:0;color:#2e7d32;font-weight:600">Track your order at: <a href="${process.env.BASE_URL || 'http://localhost:3000'}/track" style="color:#0f2c56">Track Order</a></p>
        </div>
        <p style="color:#5f6f8a;font-size:14px">You can track your order status from your account dashboard or contact us on WhatsApp at +234 (903) 135-5560.</p>
      </div>
      <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:20px">© ${new Date().getFullYear()} DG Electronics. All rights reserved.</p>
    </div>`;

    if (process.env.SMTP_USER) {
      await emailTransporter.sendMail({
        from: `"DG Electronics" <${process.env.SMTP_USER}>`,
        to: order.customer_email,
        subject: `Order Confirmation #${order.orderNumber} - DG Electronics`,
        html,
      });
      console.log(`[EMAIL] Order confirmation sent to ${order.customer_email}`);
    } else {
      console.log(`[EMAIL DEMO] Order confirmation for ${order.customer_email} - Order #${order.orderNumber} (Configure SMTP_USER to send real emails)`);
    }
    return true;
  } catch (err) {
    console.log(`[EMAIL ERROR] Failed to send confirmation: ${err.message}`);
    return false;
  }
}

async function sendOrderStatusUpdateEmail(order, oldStatus) {
  try {
    const statusMessages = {
      'processing': 'Your order is now being prepared.',
      'confirmed': 'Your order has been confirmed and will be shipped soon.',
      'shipped': 'Great news! Your order has been shipped and is on its way.',
      'out_for_delivery': 'Your order is out for delivery and will arrive soon!',
      'delivered': 'Your order has been delivered. We hope you enjoy your purchase!',
      'cancelled': 'Your order has been cancelled.'
    };

    const html = `
    <div style="font-family:Poppins,Arial,sans-serif;max-width:600px;margin:0 auto;background:#f5f8ff;padding:20px">
      <div style="background:linear-gradient(135deg,#0f2c56,#3da7ff);padding:30px;border-radius:12px 12px 0 0;text-align:center">
        <h1 style="color:white;margin:0;font-size:24px">DG Electronics</h1>
        <p style="color:rgba(255,255,255,0.8);margin:5px 0 0">Order Status Update</p>
      </div>
      <div style="background:white;padding:30px;border-radius:0 0 12px 12px;box-shadow:0 4px 20px rgba(0,0,0,0.1)">
        <h2 style="color:#0f2c56;margin-top:0">Order #${order.orderNumber}</h2>
        <p style="color:#5f6f8a">Hello <strong>${order.customer_name}</strong>,</p>
        <p style="color:#5f6f8a;font-size:16px">${statusMessages[order.order_status] || 'Your order status has been updated.'}</p>
        <div style="background:#f8faff;padding:15px;border-radius:8px;margin:20px 0;text-align:center">
          <p style="margin:0;color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:0.1em">Current Status</p>
          <p style="margin:5px 0;font-size:20px;font-weight:700;color:#0f2c56;text-transform:uppercase">${STATUS_LABELS[order.order_status] || order.order_status}</p>
        </div>
        ${order.trackingNumber ? `<div style="background:#e3f2fd;padding:12px;border-radius:8px;margin:15px 0;text-align:center"><p style="margin:0;color:#1565c0;font-weight:600">Tracking Number: ${order.trackingNumber}</p></div>` : ''}
        <p style="color:#5f6f8a;font-size:14px">Track your order at: <a href="${process.env.BASE_URL || 'http://localhost:3000'}/track" style="color:#0f2c56;font-weight:600">Track Order</a></p>
      </div>
      <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:20px">© ${new Date().getFullYear()} DG Electronics. All rights reserved.</p>
    </div>`;

    if (process.env.SMTP_USER) {
      await emailTransporter.sendMail({
        from: `"DG Electronics" <${process.env.SMTP_USER}>`,
        to: order.customer_email,
        subject: `Order #${order.orderNumber} Status: ${order.order_status.toUpperCase()} - DG Electronics`,
        html,
      });
      console.log(`[EMAIL] Status update sent to ${order.customer_email}: ${oldStatus} → ${order.order_status}`);
    } else {
      console.log(`[EMAIL DEMO] Status update for ${order.customer_email}: ${oldStatus} → ${order.order_status} (Configure SMTP_USER to send real emails)`);
    }
    return true;
  } catch (err) {
    console.log(`[EMAIL ERROR] Failed to send status update: ${err.message}`);
    return false;
  }
}

app.post('/api/orders', optionalAuth, async (req, res) => {
  try {
    const { customer_name, customer_email, customer_phone, delivery_address, delivery_state, delivery_city, items, payment_method, notes, coupon_code, discount } = req.body;
    if (!items || items.length === 0) return res.status(400).json({ error: 'No items in order' });
    if (!customer_name || !customer_email || !customer_phone || !delivery_address) {
      return res.status(400).json({ error: 'All customer fields are required' });
    }

    let subtotal = 0;
    const orderItems = [];
    for (const item of items) {
      const product = await Product.findById(item.product_id);
      if (!product) continue;
      if (product.stock < item.quantity) {
        return res.status(400).json({ error: product.name + ' has insufficient stock (' + product.stock + ' available)' });
      }
      const itemTotal = product.price * item.quantity;
      subtotal += itemTotal;
      orderItems.push({ product: product._id, name: product.name, price: product.price, quantity: item.quantity, image: product.image });
    }

    if (orderItems.length === 0) return res.status(400).json({ error: 'No valid items in order' });

    const deliveryFeeDoc = await Settings.findOne({ key: 'delivery_fee' });
    const freeThresholdDoc = await Settings.findOne({ key: 'free_delivery_threshold' });
    const deliveryFee = deliveryFeeDoc && typeof deliveryFeeDoc.value === 'number' ? deliveryFeeDoc.value : 2000;
    const freeThreshold = freeThresholdDoc && typeof freeThresholdDoc.value === 'number' ? freeThresholdDoc.value : 500000;
    const delivery_fee = subtotal >= freeThreshold ? 0 : deliveryFee;
    let discountAmount = Math.max(0, parseInt(discount, 10) || 0);
    if (coupon_code) {
      const coupon = await Coupon.findOne({ code: coupon_code.toUpperCase().trim(), active: true });
      if (coupon) {
        if (coupon.type === 'percentage') discountAmount = Math.min(subtotal * (coupon.value / 100), coupon.maxDiscount || Infinity);
        else if (coupon.type === 'fixed') discountAmount = Math.min(coupon.value, subtotal);
        else if (coupon.type === 'free_shipping') discountAmount = delivery_fee;
        coupon.usedCount = (coupon.usedCount || 0) + 1;
        await coupon.save();
        trackEvent('coupon_use', { metadata: { code: coupon.code, discount: discountAmount }, amount: discountAmount, userId: req.user?.id });
      }
    }
    const total = Math.max(0, subtotal - discountAmount + delivery_fee);
    const orderNumber = await generateOrderNumber();
    const trackingNumber = generateTrackingNumber();

    // Calculate estimated delivery date (3-7 business days from now)
    const estDays = subtotal >= 500000 ? 3 : 5;
    const estDate = new Date();
    let added = 0;
    while (added < estDays) {
      estDate.setDate(estDate.getDate() + 1);
      if (estDate.getDay() !== 0 && estDate.getDay() !== 6) added++;
    }
    const estimatedDelivery = `${estDays}-${estDays + 2} business days`;

    const order = await Order.create({
      orderNumber, trackingNumber, customer_name, customer_email, customer_phone,
      delivery_address, delivery_state, delivery_city,
      items: orderItems, subtotal, delivery_fee, total,
      coupon_code: coupon_code || '', discount: discountAmount,
      payment_method: payment_method || 'paystack_card',
      payment_status: 'pending',
      notes: notes || '',
      user: req.user?.id,
      estimatedDelivery,
      estimatedDeliveryDate: estDate,
      statusHistory: [{ status: 'pending', timestamp: new Date(), note: 'Order placed', updatedBy: 'system' }]
    });

    // Track purchase analytics
    trackEvent('purchase', { orderId: order._id, userId: req.user?.id, amount: total, metadata: { items: orderItems.length, coupon: coupon_code || '' } });
    for (const item of orderItems) {
      trackEvent('purchase', { productId: item.product, userId: req.user?.id, amount: item.price * item.quantity });
    }

    // Create notification for new order
    createNotification('new_order', 'New Order Received', `Order #${orderNumber} from ${customer_name} - ${formatPrice(total)}`, { orderId: order._id });

    // Send confirmation email
    sendOrderConfirmationEmail(order).catch(() => {});

    res.json({
      success: true,
      order_id: order._id,
      orderNumber,
      trackingNumber,
      subtotal,
      delivery_fee,
      total,
      payment_method: order.payment_method,
      payment_status: order.payment_status,
      order_status: order.order_status,
      items: orderItems,
      customer_name,
      customer_email,
      customer_phone,
      delivery_address,
      delivery_state,
      delivery_city,
      estimatedDelivery,
      estimatedDeliveryDate: estDate,
      createdAt: order.createdAt
    });
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.get('/api/orders/:id', async (req, res) => {
  try {
    let order = null;
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      order = await Order.findById(req.params.id).populate('items.product', 'name image slug');
    }
    if (!order) order = await Order.findOne({ orderNumber: req.params.id }).populate('items.product', 'name image slug');
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const token = req.header('Authorization')?.replace('Bearer ', '') || req.cookies?.token;
    let isAuth = false;
    if (token) { try { jwt.verify(token, JWT_SECRET); isAuth = true; } catch {} }
    if (!isAuth) {
      const { email } = req.query;
      if (!email || order.customer_email.toLowerCase() !== email.toLowerCase().trim()) {
        return res.status(403).json({ error: 'Access denied. Provide a valid email to view this order.' });
      }
    }
    res.json(order);
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// ═══════════════════════════════════════════════
// PAYSTACK CONFIG ENDPOINT
// ═══════════════════════════════════════════════

// Serve Paystack public key to frontend (public key is safe to expose)
app.get('/api/config/paystack', (req, res) => {
  res.json({ publicKey: PAYSTACK_PUBLIC_KEY });
});

// ═══════════════════════════════════════════════
// SERVER-SIDE PAYSTACK PAYMENT VERIFICATION
// ═══════════════════════════════════════════════

// Verify payment server-side by calling Paystack API
app.post('/api/paystack/verify', optionalAuth, async (req, res) => {
  try {
    const { reference, orderNumber } = req.body;
    if (!reference || !orderNumber) {
      return res.status(400).json({ success: false, message: 'Reference and order number are required' });
    }

    // Find the order
    const order = await Order.findOne({ orderNumber });
    if (!order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }

    // Idempotent: if already paid, return success
    if (order.payment_status === 'paid') {
      return res.json({ success: true, message: 'Payment already confirmed', order });
    }

    // Call Paystack API to verify the transaction
    const verifyResponse = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` }
    });
    const verifyData = await verifyResponse.json();

    if (!verifyData.status) {
      // Paystack verification failed
      order.payment_status = 'failed';
      order.payment_ref = `paystack:${reference}:failed`;
      order.statusHistory.push({ status: 'payment_failed', note: `Paystack verification failed: ${verifyData.message}`, timestamp: new Date() });
      await order.save();
      return res.json({ success: false, message: verifyData.message || 'Payment verification failed' });
    }

    const transaction = verifyData.data;

    // Verify amount matches (Paystack sends amount in kobo)
    const expectedAmount = order.total * 100;
    if (transaction.amount !== expectedAmount) {
      order.payment_status = 'failed';
      order.payment_ref = `paystack:${reference}:amount_mismatch`;
      order.statusHistory.push({ status: 'payment_failed', note: `Amount mismatch: expected ${expectedAmount}, got ${transaction.amount}`, timestamp: new Date() });
      await order.save();
      return res.json({ success: false, message: 'Payment amount does not match order total' });
    }

    // Verify currency
    if (transaction.currency !== 'NGN') {
      order.payment_status = 'failed';
      order.payment_ref = `paystack:${reference}:currency_mismatch`;
      await order.save();
      return res.json({ success: false, message: 'Invalid payment currency' });
    }

    // Verify transaction was successful
    if (transaction.status !== 'success') {
      order.payment_status = 'failed';
      order.payment_ref = `paystack:${reference}:${transaction.status}`;
      order.statusHistory.push({ status: 'payment_failed', note: `Transaction status: ${transaction.status}`, timestamp: new Date() });
      await order.save();
      return res.json({ success: false, message: `Payment was not successful (status: ${transaction.status})` });
    }

    // Payment verified successfully
    order.payment_status = 'paid';
    order.paidAt = new Date();
    order.payment_ref = `paystack:${transaction.id}`;
    if (!order.order_status || order.order_status === 'pending') {
      order.order_status = 'confirmed';
      order.statusHistory.push({ status: 'confirmed', note: 'Payment confirmed', timestamp: new Date() });
    }
    await order.save();

    // Reduce stock
    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.product, { $inc: { stock: -item.quantity } });
    }
    console.log(`[PAYMENT] Paystack payment verified for order ${orderNumber}, ref: ${reference}`);

    // Send confirmation email
    sendOrderConfirmationEmail(order).catch(() => {});

    res.json({ success: true, message: 'Payment confirmed', order });
  } catch (err) {
    console.error(`[PAYMENT ERROR] Paystack verify: ${err.message}`);
    res.status(500).json({ success: false, message: 'Payment verification failed due to server error' });
  }
});

// Payment verification endpoint (called by frontend after payment callback)
app.get('/api/orders/verify/:orderNumber', auth, async (req, res) => {
  try {
    const order = await Order.findOne({ orderNumber: req.params.orderNumber });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.user?.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    res.json({
      orderNumber: order.orderNumber,
      payment_status: order.payment_status,
      order_status: order.order_status,
      total: order.total,
      paidAt: order.paidAt
    });
  } catch (err) {
    console.error('[ORDER] Verify error:', err.message);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

app.patch('/api/orders/:id/payment', adminAuth, async (req, res) => {
  try {
    const { payment_status, payment_ref } = req.body;
    if (!['pending', 'paid', 'failed', 'refunded'].includes(payment_status)) {
      return res.status(400).json({ error: 'Invalid payment status' });
    }
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const wasAlreadyPaid = order.payment_status === 'paid';
    order.payment_status = payment_status;
    if (payment_ref) order.payment_ref = sanitizeString(payment_ref);
    if (payment_status === 'paid' && !wasAlreadyPaid) {
      order.paidAt = new Date();
      for (const item of order.items) {
        await Product.findOneAndUpdate(
          { _id: item.product, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } }
        );
      }
    }
    await order.save();
    res.json({ success: true, order });
  } catch (err) {
    console.error('[ORDER] Payment update error:', err.message);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

// Customer order history (authenticated or by email)
app.get('/api/users/orders', auth, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// Customer order lookup by order number + email (rate limited)
app.get('/api/orders/lookup/:orderNumber', orderLookupLimiter, async (req, res) => {
  try {
    const { email } = req.query;
    if (!email || !isValidEmail(email)) return res.status(400).json({ error: 'Valid email is required for order lookup' });
    const order = await Order.findOne({ orderNumber: req.params.orderNumber, customer_email: email.toLowerCase().trim() }).populate('items.product', 'name image slug');
    if (!order) return res.status(404).json({ error: 'Order not found. Please check your order number and email.' });
    res.json(order);
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// Customer cancel order (only pending/processing orders)
app.patch('/api/orders/:id/cancel', auth, async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.user?.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (!['pending', 'processing'].includes(order.order_status)) {
      return res.status(400).json({ error: 'Order cannot be cancelled at this stage' });
    }
    for (const item of order.items) {
      await Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } });
    }
    const oldStatus = order.order_status;
    order.order_status = 'cancelled';
    order.payment_status = order.payment_status === 'paid' ? 'refunded' : order.payment_status;
    order.statusHistory.push({ status: 'cancelled', timestamp: new Date(), note: 'Cancelled by customer', updatedBy: order.customer_email });
    await order.save();
    createNotification('order_status', 'Order Cancelled', `Order #${order.orderNumber} has been cancelled by customer`, { orderId: order._id });
    sendOrderStatusUpdateEmail(order, oldStatus).catch(() => {});
    res.json({ success: true, order });
  } catch (err) {
    console.error('[ORDER] Cancel error:', err.message);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

// ── Tracking Lookup (public - limited data) ──
app.get('/api/orders/track/:trackingNumber', async (req, res) => {
  try {
    const order = await Order.findOne({ trackingNumber: req.params.trackingNumber })
      .select('orderNumber trackingNumber order_status payment_status statusHistory carrier shipping_notes estimatedDelivery estimatedDeliveryDate createdAt shippedAt deliveredAt items.product items.name items.quantity items.price')
      .populate('items.product', 'name image slug');
    if (!order) return res.status(404).json({ error: 'Order not found with this tracking number' });
    res.json({
      orderNumber: order.orderNumber,
      trackingNumber: order.trackingNumber,
      order_status: order.order_status,
      statusHistory: order.statusHistory || [],
      items: order.items,
      carrier: order.carrier,
      shipping_notes: order.shipping_notes,
      estimatedDelivery: order.estimatedDelivery,
      estimatedDeliveryDate: order.estimatedDeliveryDate,
      createdAt: order.createdAt,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt
    });
  } catch (err) {
    console.error('[TRACKING] Error:', err.message);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

// ── Notification Routes ──
app.get('/api/notifications', adminAuth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const [notifications, total, unread] = await Promise.all([
      Notification.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      Notification.countDocuments(),
      Notification.countDocuments({ read: false })
    ]);
    res.json({ notifications, total, unread, page, pages: Math.ceil(total / limit) });
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.get('/api/notifications/unread-count', adminAuth, async (req, res) => {
  try {
    const count = await Notification.countDocuments({ read: false });
    res.json({ count });
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.patch('/api/notifications/:id/read', adminAuth, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { read: true });
    res.json({ success: true });
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.patch('/api/notifications/read-all', adminAuth, async (req, res) => {
  try {
    await Notification.updateMany({ read: false }, { read: true });
    res.json({ success: true });
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// ── Customer Notification Routes ──
app.get('/api/user/notifications', auth, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;
    const filter = { $or: [{ userId: req.user.id }, { type: 'order_status' }] };
    const [notifications, total, unread] = await Promise.all([
      Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Notification.countDocuments(filter),
      Notification.countDocuments({ ...filter, read: false })
    ]);
    res.json({ notifications, total, unread, page, pages: Math.ceil(total / limit) });
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.get('/api/user/notifications/unread-count', auth, async (req, res) => {
  try {
    const filter = { $or: [{ userId: req.user.id }, { type: 'order_status' }], read: false };
    const count = await Notification.countDocuments(filter);
    res.json({ count });
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.patch('/api/user/notifications/:id/read', auth, async (req, res) => {
  try {
    const notification = await Notification.findById(req.params.id);
    if (!notification) return res.status(404).json({ error: 'Notification not found' });
    if (notification.userId && notification.userId.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    notification.read = true;
    await notification.save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.patch('/api/user/notifications/read-all', auth, async (req, res) => {
  try {
    const filter = { $or: [{ userId: req.user.id }, { type: 'order_status' }], read: false };
    await Notification.updateMany(filter, { read: true });
    res.json({ success: true });
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// ═══════════════════════════════════════════════
// COUPON ROUTES
// ═══════════════════════════════════════════════

app.post('/api/coupons/validate', auth, async (req, res) => {
  try {
    const { code, subtotal } = req.body;
    if (!code) return res.status(400).json({ error: 'Coupon code is required' });
    const coupon = await Coupon.findOne({ code: code.toUpperCase().trim(), active: true });
    if (!coupon) return res.status(404).json({ error: 'Invalid coupon code' });
    if (coupon.startDate && new Date() < coupon.startDate) return res.status(400).json({ error: 'This coupon is not active yet' });
    if (coupon.endDate && new Date() > coupon.endDate) return res.status(400).json({ error: 'This coupon has expired' });
    if (coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) return res.status(400).json({ error: 'This coupon has reached its usage limit' });
    if (coupon.minOrder > 0 && (subtotal || 0) < coupon.minOrder) return res.status(400).json({ error: 'Minimum order amount not met' });
    let discount = 0;
    if (coupon.type === 'percentage') {
      discount = Math.min((subtotal || 0) * (coupon.value / 100), coupon.maxDiscount || Infinity);
    } else if (coupon.type === 'fixed') {
      discount = Math.min(coupon.value, subtotal || 0);
    } else if (coupon.type === 'free_shipping') {
      discount = 2000;
    }
    res.json({ success: true, coupon: { code: coupon.code, type: coupon.type, value: coupon.value, description: coupon.description }, discount: Math.round(discount) });
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.get('/api/promotions/active', async (req, res) => {
  try {
    const now = new Date();
    const promotions = await Promotion.find({ active: true, startDate: { $lte: now }, endDate: { $gte: now } }).sort({ priority: -1, createdAt: -1 }).populate('products', 'name price oldPrice image slug rating badge');
    res.json(promotions);
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.get('/api/promotions/flash-sale', async (req, res) => {
  try {
    const now = new Date();
    const flash = await Promotion.findOne({ type: 'flash_sale', active: true, startDate: { $lte: now }, endDate: { $gte: now } }).populate('products', 'name price oldPrice image slug rating stock badge');
    res.json(flash || null);
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.get('/api/homepage', homepageLimiter, async (req, res) => {
  try {
    const now = new Date();
    const selectFields = 'name slug category brand price oldPrice image rating reviews stock featured bestSeller badge storageOptions';
    const [featured, trending, newArrivals, bestSellers, recommended, flashSale, activePromos] = await Promise.all([
      Product.find({ featured: true }).select(selectFields).limit(8).lean(),
      Product.find({ stock: { $gt: 0 } }).select(selectFields).sort({ reviews: -1, rating: -1 }).limit(8).lean(),
      Product.find({}).select(selectFields).sort({ createdAt: -1 }).limit(8).lean(),
      Product.find({ bestSeller: true }).select(selectFields).limit(8).lean(),
      Product.find({ rating: { $gte: 4 } }).select(selectFields).sort({ rating: -1 }).limit(8).lean(),
      Promotion.findOne({ type: 'flash_sale', active: true, startDate: { $lte: now }, endDate: { $gte: now } }).populate('products', 'name price oldPrice image slug rating stock badge').lean(),
      Promotion.find({ active: true, startDate: { $lte: now }, endDate: { $gte: now } }).sort({ priority: -1 }).limit(5).lean()
    ]);
    res.json({ featured, trending, newArrivals, bestSellers, recommended, flashSale, activePromos });
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// ═══════════════════════════════════════════════
// ENHANCED REVIEW ROUTES
// ═══════════════════════════════════════════════

app.post('/api/reviews', auth, async (req, res) => {
  try {
    const { product_id, rating, title, comment, photos } = req.body;
    if (!product_id || !rating) return res.status(400).json({ error: 'Product and rating required' });
    const existing = await Review.findOne({ product: product_id, user: req.user.id });
    if (existing) return res.status(400).json({ error: 'You already reviewed this product' });
    const hasOrder = await Order.findOne({ user: req.user.id, 'items.product': product_id, order_status: 'delivered' });
    const review = new Review({
      product: product_id, user: req.user.id, name: req.user.name,
      rating: parseInt(rating), title: title || '', comment: comment || '',
      photos: photos || [], verified: !!hasOrder
    });
    await review.save();
    const allReviews = await Review.find({ product: product_id });
    const avgRating = allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length;
    await Product.findByIdAndUpdate(product_id, { rating: Math.round(avgRating * 10) / 10, reviews: allReviews.length });
    trackEvent('review', { productId: product_id, userId: req.user.id });
    res.status(201).json(review);
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.get('/api/reviews/product/:productId', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;
    const sort = req.query.sort === 'helpful' ? { helpful: -1 } : req.query.sort === 'rating_high' ? { rating: -1 } : req.query.sort === 'rating_low' ? { rating: 1 } : { createdAt: -1 };
    const [reviews, total, stats, avgResult] = await Promise.all([
      Review.find({ product: req.params.productId }).sort(sort).skip(skip).limit(limit).populate('user', 'name').lean(),
      Review.countDocuments({ product: req.params.productId }),
      Review.aggregate([
        { $match: { product: new mongoose.Types.ObjectId(req.params.productId) } },
        { $group: { _id: '$rating', count: { $sum: 1 } } }
      ]),
      Review.aggregate([
        { $match: { product: new mongoose.Types.ObjectId(req.params.productId) } },
        { $group: { _id: null, avg: { $avg: '$rating' } } }
      ])
    ]);
    const avg = avgResult[0]?.avg || 0;
    const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    stats.forEach(s => { if (distribution[s._id] !== undefined) distribution[s._id] = s.count; });
    res.json({ reviews, total, page, pages: Math.ceil(total / limit), avgRating: Math.round(avg * 10) / 10, distribution });
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.post('/api/reviews/:id/helpful', auth, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    const already = review.helpfulBy.includes(req.user.id);
    if (already) {
      review.helpfulBy.pull(req.user.id);
      review.helpful = Math.max(0, review.helpful - 1);
    } else {
      review.helpfulBy.push(req.user.id);
      review.helpful += 1;
    }
    await review.save();
    res.json({ helpful: review.helpful, marked: !already });
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// Edit own review
app.patch('/api/reviews/:id', auth, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    if (review.user.toString() !== req.user.id) return res.status(403).json({ error: 'You can only edit your own reviews' });
    const { rating, title, comment } = req.body;
    if (rating) review.rating = parseInt(rating);
    if (title !== undefined) review.title = title;
    if (comment !== undefined) review.comment = comment;
    await review.save();
    // Recalculate product average
    const allReviews = await Review.find({ product: review.product });
    const avgRating = allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length;
    await Product.findByIdAndUpdate(review.product, { rating: Math.round(avgRating * 10) / 10, reviews: allReviews.length });
    res.json(review);
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// Delete review (own review or admin)
app.delete('/api/reviews/:id', auth, async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) return res.status(404).json({ error: 'Review not found' });
    const isAdmin = req.user.role === 'admin';
    const isOwner = review.user.toString() === req.user.id;
    if (!isAdmin && !isOwner) return res.status(403).json({ error: 'Not authorized' });
    const productId = review.product;
    await Review.findByIdAndDelete(req.params.id);
    // Recalculate product average
    const allReviews = await Review.find({ product: productId });
    const avgRating = allReviews.length > 0 ? allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length : 0;
    await Product.findByIdAndUpdate(productId, { rating: Math.round(avgRating * 10) / 10, reviews: allReviews.length });
    res.json({ success: true });
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// ═══════════════════════════════════════════════
// NEWSLETTER ROUTES
// ═══════════════════════════════════════════════

app.post('/api/newsletter/subscribe', newsletterLimiter, async (req, res) => {
  try {
    const { email, name } = req.body;
    if (!email || typeof email !== 'string' || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    const safeEmail = email.toLowerCase().trim();
    let sub = await Newsletter.findOne({ email: safeEmail });
    if (sub) {
      if (!sub.subscribed) { sub.subscribed = true; await sub.save(); }
      return res.json({ success: true, message: 'Already subscribed' });
    }
    sub = new Newsletter({ email: safeEmail, name: sanitizeString(name || ''), user: req.user?.id || null });
    await sub.save();
    trackEvent('newsletter_signup', { metadata: { email: safeEmail } });
    res.status(201).json({ success: true, message: 'Subscribed successfully' });
  } catch (err) {
    console.error('[NEWSLETTER] Subscribe error:', err.message);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

app.post('/api/newsletter/unsubscribe', async (req, res) => {
  try {
    const { email } = req.body;
    if (typeof email !== 'string' || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    await Newsletter.findOneAndUpdate({ email: email.toLowerCase().trim() }, { subscribed: false });
    res.json({ success: true });
  } catch (err) {
    console.error('[NEWSLETTER] Unsubscribe error:', err.message);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

// ═══════════════════════════════════════════════
// ANALYTICS TRACKING
// ═══════════════════════════════════════════════

function trackEvent(eventType, metadata = {}) {
  try {
    const ev = new Analytics({ eventType, ...metadata });
    ev.save().catch(() => {});
  } catch {}
}

app.post('/api/analytics/track', async (req, res) => {
  try {
    const { eventType, productId, sessionId, metadata, amount } = req.body;
    if (!eventType) return res.status(400).json({ error: 'Event type required' });
    await trackEvent(eventType, { productId, userId: req.user?.id, sessionId, metadata, amount });
    res.json({ success: true });
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// ═══════════════════════════════════════════════
// COUPON MANAGEMENT (ADMIN)
// ═══════════════════════════════════════════════

app.get('/api/admin/coupons', adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const [coupons, total] = await Promise.all([
      Coupon.find().sort({ createdAt: -1 }).skip(skip).limit(limit),
      Coupon.countDocuments()
    ]);
    res.json({ coupons, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.post('/api/admin/coupons', adminAuth, async (req, res) => {
  try {
    const allowed = pick(req.body, ['code', 'description', 'type', 'value', 'minOrder', 'maxDiscount', 'usageLimit', 'startDate', 'endDate', 'active']);
    const coupon = new Coupon({ ...allowed, createdBy: req.user.id });
    await coupon.save();
    res.status(201).json(coupon);
  } catch (err) {
    console.error('[COUPON] Create error:', err.message);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

app.put('/api/admin/coupons/:id', adminAuth, async (req, res) => {
  try {
    const allowed = pick(req.body, ['code', 'description', 'type', 'value', 'minOrder', 'maxDiscount', 'usageLimit', 'startDate', 'endDate', 'active']);
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, allowed, { new: true });
    if (!coupon) return res.status(404).json({ error: 'Coupon not found' });
    res.json(coupon);
  } catch (err) {
    console.error('[COUPON] Update error:', err.message);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

app.delete('/api/admin/coupons/:id', adminAuth, async (req, res) => {
  try {
    await Coupon.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.patch('/api/admin/coupons/:id/toggle', adminAuth, async (req, res) => {
  try {
    const coupon = await Coupon.findById(req.params.id);
    if (!coupon) return res.status(404).json({ error: 'Coupon not found' });
    coupon.active = !coupon.active;
    await coupon.save();
    res.json(coupon);
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// ═══════════════════════════════════════════════
// PROMOTION MANAGEMENT (ADMIN)
// ═══════════════════════════════════════════════

app.get('/api/admin/promotions', adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;
    const [promotions, total] = await Promise.all([
      Promotion.find().sort({ createdAt: -1 }).skip(skip).limit(limit).populate('products', 'name price image'),
      Promotion.countDocuments()
    ]);
    res.json({ promotions, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.post('/api/admin/promotions', adminAuth, async (req, res) => {
  try {
    const allowed = pick(req.body, ['title', 'description', 'type', 'discountType', 'discountValue', 'products', 'categories', 'couponCode', 'startDate', 'endDate', 'active', 'featured', 'priority']);
    const slug = (typeof allowed.title === 'string' ? allowed.title : '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'promo-' + Date.now();
    const promotion = new Promotion({ ...allowed, slug, createdBy: req.user.id });
    await promotion.save();
    if (promotion.couponCode && typeof promotion.couponCode === 'string') {
      await Coupon.findOneAndUpdate(
        { code: promotion.couponCode.toUpperCase() },
        { $setOnInsert: { code: promotion.couponCode.toUpperCase(), type: 'percentage', value: promotion.discountValue, startDate: promotion.startDate, endDate: promotion.endDate, active: true, description: promotion.title } },
        { upsert: true, new: true }
      );
    }
    res.status(201).json(promotion);
  } catch (err) {
    console.error('[PROMO] Create error:', err.message);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

app.put('/api/admin/promotions/:id', adminAuth, async (req, res) => {
  try {
    const allowed = pick(req.body, ['title', 'description', 'type', 'discountType', 'discountValue', 'products', 'categories', 'couponCode', 'startDate', 'endDate', 'active', 'featured', 'priority']);
    const promotion = await Promotion.findByIdAndUpdate(req.params.id, allowed, { new: true });
    if (!promotion) return res.status(404).json({ error: 'Promotion not found' });
    res.json(promotion);
  } catch (err) {
    console.error('[PROMO] Update error:', err.message);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

app.delete('/api/admin/promotions/:id', adminAuth, async (req, res) => {
  try {
    await Promotion.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.patch('/api/admin/promotions/:id/toggle', adminAuth, async (req, res) => {
  try {
    const promo = await Promotion.findById(req.params.id);
    if (!promo) return res.status(404).json({ error: 'Promotion not found' });
    promo.active = !promo.active;
    await promo.save();
    res.json(promo);
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// ═══════════════════════════════════════════════
// NEWSLETTER MANAGEMENT (ADMIN)
// ═══════════════════════════════════════════════

app.get('/api/admin/newsletter', adminAuth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;
    const [subscribers, total] = await Promise.all([
      Newsletter.find({ subscribed: true }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Newsletter.countDocuments({ subscribed: true })
    ]);
    res.json({ subscribers, total, page, pages: Math.ceil(total / limit) });
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.post('/api/admin/newsletter/send', adminAuth, async (req, res) => {
  try {
    const { subject, htmlContent, tag } = req.body;
    if (!subject || !htmlContent) return res.status(400).json({ error: 'Subject and content required' });
    const query = { subscribed: true };
    if (tag) query.tags = tag;
    const subs = await Newsletter.find(query).select('email name');
    let sent = 0;
    if (process.env.SMTP_USER) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com', port: parseInt(process.env.SMTP_PORT || '587'), secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });
      for (const sub of subs) {
        try {
          await transporter.sendMail({ from: `"DG Electronics" <${process.env.SMTP_USER}>`, to: sub.email, subject, html: htmlContent });
          sent++;
        } catch {}
      }
    }
    await Newsletter.updateMany(query, { lastEmailSent: new Date() });
    res.json({ success: true, total: subs.length, sent });
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.delete('/api/admin/newsletter/:id', adminAuth, async (req, res) => {
  try {
    await Newsletter.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// ═══════════════════════════════════════════════
// ANALYTICS DASHBOARD (ADMIN)
// ═══════════════════════════════════════════════

app.get('/api/admin/analytics', adminAuth, async (req, res) => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekAgo = new Date(today - 7 * 86400000);
    const monthAgo = new Date(today - 30 * 86400000);

    const [totalEvents, productViews, purchases, couponUses, newsletterSignups, reviewsCount, topProducts, revenueByDay, conversionData, avgOrderValue] = await Promise.all([
      Analytics.countDocuments(),
      Analytics.countDocuments({ eventType: 'product_view' }),
      Analytics.countDocuments({ eventType: 'purchase' }),
      Analytics.countDocuments({ eventType: 'coupon_use' }),
      Analytics.countDocuments({ eventType: 'newsletter_signup' }),
      Review.countDocuments(),
      Analytics.aggregate([
        { $match: { eventType: { $in: ['product_view', 'purchase'] }, createdAt: { $gte: monthAgo } } },
        { $group: { _id: { product: '$productId', event: '$eventType' }, count: { $sum: 1 } } },
        { $group: { _id: '$_id.product', views: { $sum: { $cond: [{ $eq: ['$_id.event', 'product_view'] }, '$count', 0] } }, purchases: { $sum: { $cond: [{ $eq: ['$_id.event', 'purchase'] }, '$count', 0] } } } },
        { $lookup: { from: 'products', localField: '_id', foreignField: '_id', as: 'product' } },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        { $sort: { purchases: -1 } },
        { $limit: 10 }
      ]),
      Analytics.aggregate([
        { $match: { eventType: 'purchase', createdAt: { $gte: monthAgo } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$amount' }, orders: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Analytics.aggregate([
        { $match: { createdAt: { $gte: monthAgo } } },
        { $group: { _id: '$eventType', count: { $sum: 1 } } }
      ]),
      Analytics.aggregate([
        { $match: { eventType: 'purchase', createdAt: { $gte: monthAgo } } },
        { $group: { _id: null, avg: { $avg: '$amount' }, total: { $sum: '$amount' }, count: { $sum: 1 } } }
      ])
    ]);

    const aov = avgOrderValue[0] || { avg: 0, total: 0, count: 0 };
    const conversionRate = productViews > 0 ? ((purchases / productViews) * 100).toFixed(2) : 0;

    res.json({
      overview: { totalEvents, productViews, purchases, couponUses, newsletterSignups, reviewsCount, conversionRate: parseFloat(conversionRate), avgOrderValue: Math.round(aov.avg || 0), totalRevenue: Math.round(aov.total || 0) },
      topProducts, revenueByDay, conversionData
    });
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.get('/api/admin/analytics/revenue', adminAuth, async (req, res) => {
  try {
    const { period } = req.query;
    const now = new Date();
    let startDate;
    if (period === 'weekly') startDate = new Date(now - 7 * 86400000);
    else if (period === 'yearly') startDate = new Date(now - 365 * 86400000);
    else startDate = new Date(now - 30 * 86400000);
    const data = await Analytics.aggregate([
      { $match: { eventType: 'purchase', createdAt: { $gte: startDate } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, revenue: { $sum: '$amount' }, orders: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    res.json(data);
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// ═══════════════════════════════════════════════
// FEATURED PRODUCTS (ADMIN)
// ═══════════════════════════════════════════════

app.patch('/api/admin/products/:id/featured', adminAuth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    product.featured = !product.featured;
    await product.save();
    res.json(product);
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.patch('/api/admin/products/:id/bestseller', adminAuth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    product.bestSeller = !product.bestSeller;
    await product.save();
    res.json(product);
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// ═══════════════════════════════════════════════
// PAYMENT WEBHOOK VERIFICATION
// ═══════════════════════════════════════════════

// Paystack webhook (with HMAC signature verification)
app.post('/api/webhooks/paystack', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const rawBody = req.body.toString();
    const signature = req.headers['x-paystack-signature'];

    if (!PAYSTACK_WEBHOOK_SECRET || PAYSTACK_WEBHOOK_SECRET.startsWith('whsec_xxx')) {
      console.error('[WEBHOOK] PAYSTACK_WEBHOOK_SECRET not configured. Rejecting webhook.');
      return res.status(500).json({ error: 'Webhook not configured' });
    }
    const hash = crypto.createHmac('sha512', PAYSTACK_WEBHOOK_SECRET).update(rawBody).digest('hex');
    if (hash !== signature) {
      console.log('[WEBHOOK] Paystack signature verification failed');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(rawBody);
    if (event.event === 'charge.success') {
      const ref = event.data?.reference;
      if (ref) {
        const order = await Order.findOne({ orderNumber: ref });
        if (order && order.payment_status !== 'paid') {
          order.payment_status = 'paid';
          order.paidAt = new Date();
          order.payment_ref = 'paystack:' + event.data.id;
          if (!order.order_status || order.order_status === 'pending') {
            order.order_status = 'confirmed';
            order.statusHistory.push({ status: 'confirmed', note: 'Payment confirmed via webhook', timestamp: new Date() });
          }
          await order.save();
          for (const item of order.items) {
            await Product.findOneAndUpdate(
              { _id: item.product, stock: { $gte: item.quantity } },
              { $inc: { stock: -item.quantity } }
            );
          }
          sendOrderConfirmationEmail(order).catch(() => {});
          console.log(`[WEBHOOK] Paystack payment confirmed for order ${ref}`);
        }
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error(`[WEBHOOK ERROR] Paystack: ${err.message}`);
    res.json({ received: true });
  }
});

// Flutterwave webhook (with HMAC signature verification)
app.post('/api/webhooks/flutterwave', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const rawBody = req.body.toString();
    const flwSignature = req.headers['flutterwave-signature'];

    if (!FLUTTERWAVE_SECRET_KEY) {
      console.error('[WEBHOOK] FLUTTERWAVE_SECRET_KEY not configured. Rejecting webhook.');
      return res.status(500).json({ error: 'Webhook not configured' });
    }
    const hash = crypto.createHmac('sha256', FLUTTERWAVE_SECRET_KEY).update(rawBody).digest('hex');
    if (hash !== flwSignature) {
      console.log('[WEBHOOK] Flutterwave signature verification failed');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = JSON.parse(rawBody);
    if (event.event === 'charge.completed' && event.data?.status === 'successful') {
      const ref = event.data?.tx_ref;
      if (ref) {
        const order = await Order.findOne({ orderNumber: ref });
        if (order && order.payment_status !== 'paid') {
          order.payment_status = 'paid';
          order.paidAt = new Date();
          order.payment_ref = 'flutterwave:' + event.data.id;
          await order.save();
          for (const item of order.items) {
            await Product.findOneAndUpdate(
              { _id: item.product, stock: { $gte: item.quantity } },
              { $inc: { stock: -item.quantity } }
            );
          }
          sendOrderStatusUpdateEmail(order, 'pending').catch(() => {});
          console.log(`[WEBHOOK] Flutterwave payment confirmed for order ${ref}`);
        }
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error(`[WEBHOOK ERROR] Flutterwave: ${err.message}`);
    res.json({ received: true });
  }
});

// ═══════════════════════════════════════════════
// SETTINGS ROUTES
// ═══════════════════════════════════════════════

app.get('/api/settings', async (req, res) => {
  try {
    const settings = await Settings.find();
    const obj = {};
    settings.forEach(s => { obj[s.key] = s.value; });
    res.json(obj);
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// ═══════════════════════════════════════════════
// CART ROUTES (Persistent cart for logged-in users)
// ═══════════════════════════════════════════════

app.get('/api/cart', auth, async (req, res) => {
  try {
    let cart = await Cart.findOne({ user: req.user.id });
    if (!cart) cart = { items: [] };
    res.json(cart.items);
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.put('/api/cart', auth, async (req, res) => {
  try {
    const { items } = req.body;
    await Cart.findOneAndUpdate(
      { user: req.user.id },
      { user: req.user.id, items: items || [], updatedAt: new Date() },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.post('/api/cart/sync', auth, async (req, res) => {
  try {
    const { items } = req.body;
    let cart = await Cart.findOne({ user: req.user.id });
    if (!cart) {
      cart = await Cart.create({ user: req.user.id, items: items || [] });
    } else {
      cart.items = items || [];
      cart.updatedAt = new Date();
      await cart.save();
    }
    res.json(cart.items);
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// ═══════════════════════════════════════════════
// RECENTLY VIEWED ROUTES
// ═══════════════════════════════════════════════

const recentlyViewedSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  sessionId: { type: String },
  products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  updatedAt: { type: Date, default: Date.now }
});
recentlyViewedSchema.index({ user: 1 }, { sparse: true });
recentlyViewedSchema.index({ sessionId: 1 }, { sparse: true });
const RecentlyViewed = mongoose.model('RecentlyViewed', recentlyViewedSchema);

app.post('/api/recently-viewed', optionalAuth, async (req, res) => {
  try {
    const { productId, sessionId } = req.body;
    const userId = req.user?.id || null;
    if (!productId) return res.status(400).json({ error: 'productId required' });

    let query = userId ? { user: userId } : { sessionId: sessionId || 'guest' };
    let rv = await RecentlyViewed.findOne(query);
    if (!rv) {
      rv = await RecentlyViewed.create({ ...query, products: [productId] });
    } else {
      rv.products = rv.products.filter(id => id.toString() !== productId);
      rv.products.unshift(productId);
      if (rv.products.length > 20) rv.products = rv.products.slice(0, 20);
      rv.updatedAt = new Date();
      await rv.save();
    }
    res.json({ success: true });
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.get('/api/recently-viewed', optionalAuth, async (req, res) => {
  try {
    const userId = req.user?.id || null;
    const sessionId = req.query.sessionId || 'guest';
    let query = userId ? { user: userId } : { sessionId };
    let rv = await RecentlyViewed.findOne(query);
    if (!rv || !rv.products.length) return res.json([]);
    const products = await Product.find({ _id: { $in: rv.products } });
    const ordered = rv.products.map(id => products.find(p => p._id.toString() === id.toString())).filter(Boolean);
    res.json(ordered.slice(0, 8));
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// ═══════════════════════════════════════════════
// ADMIN ROUTES (from routes/admin.js)
// ═══════════════════════════════════════════════
app.use('/api', adminRoutes);

// ═══════════════════════════════════════════════
// SUPPORT SYSTEM - LIVE CHAT
// ═══════════════════════════════════════════════

app.post('/api/chat/send', optionalAuth, async (req, res) => {
  try {
    const { sessionId, name, email, text } = req.body;
    if (!sessionId || !text) return res.status(400).json({ error: 'Session ID and message required' });
    let chat = await ChatMessage.findOne({ sessionId });
    if (!chat) {
      chat = new ChatMessage({
        sessionId,
        user: req.user?.id || null,
        name: name || req.user?.name || 'Guest',
        email: email || req.user?.email || '',
        messages: [{ sender: 'user', text }]
      });
    } else {
      chat.messages.push({ sender: 'user', text });
      if (req.user?.id && !chat.user) chat.user = req.user.id;
      if (name && chat.name === 'Guest') chat.name = name;
      if (email && !chat.email) chat.email = email;
    }
    chat.updatedAt = new Date();
    await chat.save();
    const unreads = await ChatMessage.countDocuments({ status: 'open', 'messages.sender': 'user', 'messages.read': false });
    res.json(chat.messages[chat.messages.length - 1]);
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.get('/api/chat/:sessionId', chatLimiter, async (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    if (!sessionId || sessionId.length > 100 || !/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
      return res.status(400).json({ error: 'Invalid session ID' });
    }
    const chat = await ChatMessage.findOne({ sessionId }).populate('assignedTo', 'name');
    if (!chat) return res.json({ messages: [], status: 'open' });
    res.json(chat);
  } catch (err) { res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.post('/api/chat/:sessionId/close', auth, async (req, res) => {
  try {
    const chat = await ChatMessage.findOne({ sessionId: req.params.sessionId });
    if (!chat) return res.status(404).json({ error: 'Chat not found' });
    if (chat.user?.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }
    chat.status = 'closed';
    await chat.save();
    res.json({ success: true });
  } catch (err) {
    console.error('[CHAT] Close error:', err.message);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

// ═══════════════════════════════════════════════
// SUPPORT SYSTEM - TICKETS
// ═══════════════════════════════════════════════

app.post('/api/tickets', optionalAuth, async (req, res) => {
  try {
    const { name, email, phone, subject, category, priority, message, orderRef } = req.body;
    if (!name || !email || !subject || !message) return res.status(400).json({ error: 'Name, email, subject and message required' });
    const ticketNumber = 'TKT-' + Date.now().toString(36).toUpperCase();
    const ticket = new SupportTicket({
      ticketNumber,
      user: req.user?.id || null,
      name, email, phone, subject,
      category: category || 'other',
      priority: priority || 'medium',
      orderRef: orderRef || undefined,
      messages: [{ sender: 'customer', senderName: name, text: message }]
    });
    await ticket.save();
    const adminNotif = new Notification({
      type: 'info', title: 'New Support Ticket',
      message: `${name} submitted ticket ${ticketNumber}: ${subject}`,
      userId: req.user?.id
    });
    await adminNotif.save();
    res.status(201).json(ticket);
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.get('/api/tickets/my', auth, async (req, res) => {
  try {
    const tickets = await SupportTicket.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(tickets);
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.get('/api/tickets/:ticketNumber', auth, async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({ ticketNumber: req.params.ticketNumber }).populate('assignedTo', 'name');
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (ticket.user?.toString() !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    res.json(ticket);
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.post('/api/tickets/:ticketNumber/reply', auth, async (req, res) => {
  try {
    const ticket = await SupportTicket.findOne({ ticketNumber: req.params.ticketNumber });
    if (!ticket) return res.status(404).json({ error: 'Ticket not found' });
    if (ticket.user?.toString() !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const { text } = req.body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) return res.status(400).json({ error: 'Message required' });
    ticket.messages.push({ sender: req.user.role === 'admin' ? 'admin' : 'customer', senderName: req.user.name || 'Admin', text });
    ticket.updatedAt = new Date();
    if (ticket.status === 'waiting_customer' && req.user.role !== 'admin') ticket.status = 'open';
    await ticket.save();
    res.json(ticket);
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// ═══════════════════════════════════════════════
// SUPPORT SYSTEM - RETURNS & REFUNDS
// ═══════════════════════════════════════════════

app.post('/api/returns', auth, async (req, res) => {
  try {
    const { orderId, items, type, reason, description } = req.body;
    if (!orderId || !items || !items.length || !reason) return res.status(400).json({ error: 'Order, items and reason required' });
    const order = await Order.findById(orderId);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.user?.toString() !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    const requestNumber = 'RET-' + Date.now().toString(36).toUpperCase();
    const returnItems = items.map(i => ({
      product: i.productId,
      name: i.name,
      quantity: i.quantity,
      price: i.price,
      reason: i.reason || reason
    }));
    const totalRefund = returnItems.reduce((s, i) => s + (i.price * i.quantity), 0);
    const ret = new ReturnRequest({
      requestNumber,
      user: req.user.id,
      order: orderId,
      orderNumber: order.orderNumber,
      items: returnItems,
      type: type || 'return',
      reason,
      description,
      refundAmount: type === 'refund' ? totalRefund : 0,
      statusHistory: [{ status: 'pending', note: 'Return request submitted' }]
    });
    await ret.save();
    const adminNotif = new Notification({
      type: 'info', title: 'New Return Request',
      message: `${requestNumber} submitted for order ${order.orderNumber}`,
      userId: req.user.id
    });
    await adminNotif.save();
    res.status(201).json(ret);
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.get('/api/returns/my', auth, async (req, res) => {
  try {
    const returns = await ReturnRequest.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json(returns);
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.get('/api/returns/:requestNumber', auth, async (req, res) => {
  try {
    const ret = await ReturnRequest.findOne({ requestNumber: req.params.requestNumber });
    if (!ret) return res.status(404).json({ error: 'Return request not found' });
    if (ret.user?.toString() !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Access denied' });
    res.json(ret);
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

app.post('/api/returns/:requestNumber/cancel', auth, async (req, res) => {
  try {
    const ret = await ReturnRequest.findOne({ requestNumber: req.params.requestNumber });
    if (!ret) return res.status(404).json({ error: 'Return request not found' });
    if (ret.user?.toString() !== req.user.id) return res.status(403).json({ error: 'Access denied' });
    if (ret.status !== 'pending') return res.status(400).json({ error: 'Can only cancel pending requests' });
    ret.status = 'cancelled';
    ret.statusHistory.push({ status: 'cancelled', note: 'Cancelled by customer' });
    ret.updatedAt = new Date();
    await ret.save();
    res.json(ret);
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// ═══════════════════════════════════════════════
// SUPPORT SYSTEM - CONTACT FORM
// ═══════════════════════════════════════════════

app.post('/api/contact', contactLimiter, async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    if (!name || !email || !subject || !message) return res.status(400).json({ error: 'Name, email, subject and message required' });
    const ticketNumber = 'CTC-' + Date.now().toString(36).toUpperCase();
    const ticket = new SupportTicket({
      ticketNumber,
      name, email, phone,
      subject: '[Contact] ' + subject,
      category: 'other',
      priority: 'medium',
      messages: [{ sender: 'customer', senderName: name, text: message }]
    });
    await ticket.save();
    const adminNotif = new Notification({
      type: 'info', title: 'New Contact Message',
      message: `${name} (${email}): ${subject}`,
      userId: null
    });
    await adminNotif.save();
    res.status(201).json({ success: true, ticketNumber });
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// ═══════════════════════════════════════════════
// SUPPORT SYSTEM - FAQ
// ═══════════════════════════════════════════════

app.get('/api/faqs', async (req, res) => {
  try {
    const { category, search } = req.query;
    let query = { active: true };
    if (category && typeof category === 'string') query.category = category;
    if (search && typeof search === 'string') {
      const safe = escapeRegex(search);
      query.$or = [{ question: { $regex: safe, $options: 'i' } }, { answer: { $regex: safe, $options: 'i' } }];
    }
    const faqs = await FAQ.find(query).sort({ category: 1, order: 1 });
    res.json(faqs);
  } catch (err) {
    console.error('[FAQ] Error:', err.message);
    res.status(500).json({ error: 'An internal server error occurred' });
  }
});

app.post('/api/faqs/:id/helpful', async (req, res) => {
  try {
    const faq = await FAQ.findByIdAndUpdate(req.params.id, { $inc: { helpful: 1 } }, { new: true });
    if (!faq) return res.status(404).json({ error: 'FAQ not found' });
    res.json({ helpful: faq.helpful });
  } catch (err) { console.error('[SERVER ERROR]', err.message); res.status(500).json({ error: 'An internal server error occurred' }); }
});

// ═══════════════════════════════════════════════
// SEED DATA
// ═══════════════════════════════════════════════

async function seedData() {
  try {
    const count = await Product.countDocuments();
    if (count > 0) return;

    const products = [
      // ── PHONES ──
      { name: 'iPhone 17 Pro Max', slug: 'iphone-17-pro-max', category: 'phones', brand: 'Apple', price: 1850000, oldPrice: 1950000, description: 'The most powerful iPhone ever with A19 Pro chip, 48MP Fusion camera system, titanium design, and all-day battery life. Features a 6.9" Super Retina XDR display with ProMotion.', image: '/images/products/iPhone-17-Pro-Max.jpg', images: ['/images/products/iPhone-17-Pro-Max.jpg'], badge: 'new', rating: 4.9, reviews: 89, stock: 15, featured: true, bestSeller: true, specifications: { Display: '6.9" Super Retina XDR OLED', Chip: 'A19 Pro', Camera: '48MP + 12MP + 12MP', Storage: '256GB', Battery: 'Up to 33 hours video', Material: 'Titanium' }, colors: [{ name: 'Desert Titanium', hex: '#b8a88a' }, { name: 'Natural Titanium', hex: '#9a9a9a' }, { name: 'White Titanium', hex: '#e8e8e8' }, { name: 'Black Titanium', hex: '#3a3a3a' }], features: ['A19 Pro chip', '48MP Fusion camera system', '6.9" ProMotion display', 'Titanium design', 'All-day battery life', 'USB-C', 'Action Button', 'Camera Control'], storageOptions: [{ label: '256GB', price: 1850000 }, { label: '512GB', price: 2050000 }, { label: '1TB', price: 2250000 }], warranty: '1-year Apple warranty', estimatedDelivery: '2-3 business days' },
      { name: 'iPhone 16 Pro', slug: 'iphone-16-pro', category: 'phones', brand: 'Apple', price: 1450000, description: 'Pro-level performance with A18 Pro chip, 48MP camera system, and stunning titanium design. 6.3" display with always-on technology.', image: '/images/products/iPhone-16-Pro.jpg', images: ['/images/products/iPhone-16-Pro.jpg'], badge: 'new', rating: 4.8, reviews: 156, stock: 20, featured: true, specifications: { Display: '6.3" Super Retina XDR OLED', Chip: 'A18 Pro', Camera: '48MP + 12MP + 12MP', Storage: '128GB', Battery: 'Up to 27 hours video' }, colors: [{ name: 'Desert Titanium', hex: '#b8a88a' }, { name: 'Natural Titanium', hex: '#9a9a9a' }, { name: 'White Titanium', hex: '#e8e8e8' }, { name: 'Black Titanium', hex: '#3a3a3a' }], features: ['A18 Pro chip', '48MP camera system', 'Titanium design', 'Always-on display', 'Action Button'], storageOptions: [{ label: '128GB', price: 1450000 }, { label: '256GB', price: 1600000 }, { label: '512GB', price: 1800000 }, { label: '1TB', price: 2000000 }], warranty: '1-year Apple warranty', estimatedDelivery: '2-3 business days' },
      { name: 'iPhone 16', slug: 'iphone-16', category: 'phones', brand: 'Apple', price: 1150000, description: 'Latest generation with A18 chip, 48MP camera, Action Button, and USB-C. Beautifully designed with color-infused glass.', image: '/images/products/iPhone-16.jpg', images: ['/images/products/iPhone-16.jpg'], rating: 4.7, reviews: 203, stock: 30, featured: true, specifications: { Display: '6.1" Super Retina XDR OLED', Chip: 'A18', Camera: '48MP + 12MP', Storage: '128GB', Battery: 'Up to 22 hours video' }, colors: [{ name: 'Black', hex: '#3a3a3a' }, { name: 'White', hex: '#f0f0f0' }, { name: 'Pink', hex: '#f5c6c6' }, { name: 'Teal', hex: '#7ec8c8' }, { name: 'Ultramarine', hex: '#4a6cf7' }], features: ['A18 chip', '48MP camera', 'Action Button', 'USB-C', 'Color-infused glass'], storageOptions: [{ label: '128GB', price: 1150000 }, { label: '256GB', price: 1300000 }, { label: '512GB', price: 1500000 }], warranty: '1-year Apple warranty', estimatedDelivery: '2-3 business days' },
      { name: 'iPhone 15', slug: 'iphone-15', category: 'phones', brand: 'Apple', price: 899000, oldPrice: 950000, description: 'Dynamic Island and 48MP camera system. USB-C connectivity and durable color-infused glass with aluminum design.', image: '/images/products/iPhone-15.jpg', images: ['/images/products/iPhone-15.jpg'], badge: 'sale', rating: 4.6, reviews: 312, stock: 40, specifications: { Display: '6.1" Super Retina XDR OLED', Chip: 'A16 Bionic', Camera: '48MP + 12MP', Storage: '128GB', Battery: 'Up to 20 hours video' }, colors: [{ name: 'Black', hex: '#3a3a3a' }, { name: 'Blue', hex: '#7a9cc6' }, { name: 'Green', hex: '#a8d5a2' }, { name: 'Yellow', hex: '#f5e6a3' }, { name: 'Pink', hex: '#f0b8c8' }], features: ['Dynamic Island', '48MP camera', 'USB-C', 'Color-infused glass', 'Ceramic Shield'], storageOptions: [{ label: '128GB', price: 899000 }, { label: '256GB', price: 999000 }, { label: '512GB', price: 1199000 }], warranty: '1-year Apple warranty', estimatedDelivery: '2-5 business days' },
      { name: 'iPhone 14', slug: 'iphone-14', category: 'phones', brand: 'Apple', price: 720000, oldPrice: 780000, description: 'Crash Detection and Emergency SOS via satellite. 12MP camera with Photonic Engine and all-day battery life.', image: '/images/products/iPhone-14.jpg', images: ['/images/products/iPhone-14.jpg'], badge: 'sale', rating: 4.5, reviews: 456, stock: 50, bestSeller: true, specifications: { Display: '6.1" Super Retina XDR OLED', Chip: 'A15 Bionic', Camera: '12MP + 12MP', Storage: '128GB', Battery: 'Up to 20 hours video' }, colors: [{ name: 'Midnight', hex: '#2e3546' }, { name: 'Starlight', hex: '#f5f0e6' }, { name: 'Blue', hex: '#7a9cc6' }, { name: 'Purple', hex: '#c4a8d4' }, { name: '(PRODUCT)RED', hex: '#c42847' }], features: ['Crash Detection', 'Emergency SOS via satellite', 'Photonic Engine', 'All-day battery'], storageOptions: [{ label: '128GB', price: 720000 }, { label: '256GB', price: 820000 }, { label: '512GB', price: 1020000 }], warranty: '1-year Apple warranty', estimatedDelivery: '2-5 business days' },
      { name: 'iPhone 13', slug: 'iphone-13', category: 'phones', brand: 'Apple', price: 580000, oldPrice: 650000, description: 'Advanced dual-camera system with Photographic Modes. A15 Bionic chip for lightning-fast performance.', image: '/images/products/iPhone-13.jpg', images: ['/images/products/iPhone-13.jpg'], badge: 'sale', rating: 4.4, reviews: 678, stock: 60, bestSeller: true, specifications: { Display: '6.1" Super Retina XDR OLED', Chip: 'A15 Bionic', Camera: '12MP + 12MP', Storage: '128GB', Battery: 'Up to 19 hours video' }, colors: [{ name: 'Midnight', hex: '#2e3546' }, { name: 'Starlight', hex: '#f5f0e6' }, { name: 'Blue', hex: '#7a9cc6' }, { name: 'Pink', hex: '#f0b8c8' }, { name: '(PRODUCT)RED', hex: '#c42847' }], features: ['A15 Bionic chip', 'Cinematic mode', 'Photographic Styles', 'IP68 water resistance'], storageOptions: [{ label: '128GB', price: 580000 }, { label: '256GB', price: 680000 }, { label: '512GB', price: 880000 }], warranty: '1-year Apple warranty', estimatedDelivery: '2-5 business days' },
      { name: 'Samsung Galaxy S25 Ultra', slug: 'samsung-galaxy-s25-ultra', category: 'phones', brand: 'Samsung', price: 1650000, description: 'Galaxy AI-powered flagship with S Pen, 200MP camera, titanium frame, and 6.9" QHD+ Dynamic AMOLED 2X display.', image: '/images/products/Samsung-Galaxy-S25-Ultra.jpg', images: ['/images/products/Samsung-Galaxy-S25-Ultra.jpg'], badge: 'new', rating: 4.8, reviews: 124, stock: 25, featured: true, specifications: { Display: '6.9" QHD+ Dynamic AMOLED 2X', Chip: 'Snapdragon 8 Elite', Camera: '200MP + 50MP + 10MP + 50MP', Storage: '256GB', Battery: '5000mAh', S_Pen: 'Included' }, colors: [{ name: 'Titanium Silverblue', hex: '#a8b8c8' }, { name: 'Titanium Gray', hex: '#8a8a8a' }, { name: 'Titanium Black', hex: '#2a2a2a' }, { name: 'Titanium Whitesilver', hex: '#e8e8e8' }], features: ['Snapdragon 8 Elite', '200MP camera', 'S Pen included', 'Galaxy AI', 'Titanium frame', '6.9" QHD+ display'], storageOptions: [{ label: '256GB', price: 1650000 }, { label: '512GB', price: 1850000 }, { label: '1TB', price: 2050000 }], warranty: '1-year Samsung warranty', estimatedDelivery: '2-3 business days' },
      { name: 'Samsung Galaxy S24', slug: 'samsung-galaxy-s24', category: 'phones', brand: 'Samsung', price: 850000, description: 'Galaxy AI for everyone. Features AI-powered search, live translation, and nightography camera.', image: '/images/products/Samsung-Galaxy-S24.jpg', images: ['/images/products/Samsung-Galaxy-S24.jpg'], rating: 4.6, reviews: 189, stock: 30, specifications: { Display: '6.2" FHD+ Dynamic AMOLED 2X', Chip: 'Snapdragon 8 Gen 3', Camera: '50MP + 12MP + 10MP', Storage: '128GB', Battery: '4000mAh' }, colors: [{ name: 'Onyx Black', hex: '#2a2a2a' }, { name: 'Cobalt Violet', hex: '#7a5a9a' }, { name: 'Marble Gray', hex: '#b0b0b0' }, { name: 'Amber Yellow', hex: '#e8c84a' }], features: ['Galaxy AI', 'Live Translate', 'Nightography', '50MP camera'], storageOptions: [{ label: '128GB', price: 850000 }, { label: '256GB', price: 950000 }], warranty: '1-year Samsung warranty', estimatedDelivery: '2-5 business days' },
      { name: 'Samsung Galaxy A55', slug: 'samsung-galaxy-a55', category: 'phones', brand: 'Samsung', price: 385000, description: 'Premium mid-range with IP67 water resistance, 50MP OIS camera, and vibrant 120Hz Super AMOLED display.', image: '/images/products/Samsung-Galaxy-A55.jpg', images: ['/images/products/Samsung-Galaxy-A55.jpg'], rating: 4.4, reviews: 234, stock: 45, specifications: { Display: '6.6" FHD+ Super AMOLED 120Hz', Chip: 'Exynos 1480', Camera: '50MP + 12MP + 5MP', Storage: '128GB', Battery: '5000mAh', Water: 'IP67' }, colors: [{ name: 'Awesome Iceblue', hex: '#a8d8e8' }, { name: 'Awesome Lilac', hex: '#d4b8e8' }, { name: 'Awesome Navy', hex: '#2a3a5a' }, { name: 'Awesome Lemon', hex: '#e8e878' }], features: ['IP67 water resistance', '50MP OIS camera', '120Hz display', '5000mAh battery'], storageOptions: [{ label: '128GB', price: 385000 }, { label: '256GB', price: 435000 }], warranty: '1-year Samsung warranty', estimatedDelivery: '2-5 business days' },
      { name: 'Google Pixel 9 Pro', slug: 'google-pixel-9-pro', category: 'phones', brand: 'Google', price: 980000, description: 'Google AI at its best. Magic Eraser, Best Take, and Pro camera system with 50MP sensor and 30x Super Res Zoom.', image: '/images/products/Google-Pixel-9-Pro.jpg', images: ['/images/products/Google-Pixel-9-Pro.jpg'], badge: 'new', rating: 4.7, reviews: 98, stock: 18, featured: true, specifications: { Display: '6.3" Super Actua LTPO OLED', Chip: 'Google Tensor G4', Camera: '50MP + 48MP + 48MP', Storage: '128GB', Battery: '4700mAh' }, colors: [{ name: 'Obsidian', hex: '#3a3a3a' }, { name: 'Porcelain', hex: '#f0e8d8' }, { name: 'Bay', hex: '#7ab8d8' }, { name: 'Rose', hex: '#e8b8b8' }], features: ['Google Tensor G4', 'Magic Eraser', 'Best Take', '30x Super Res Zoom', '7 years of updates'], storageOptions: [{ label: '128GB', price: 980000 }, { label: '256GB', price: 1080000 }, { label: '512GB', price: 1280000 }], warranty: '2-year Google warranty', estimatedDelivery: '2-5 business days' },

      // ── LAPTOPS ──
      { name: 'MacBook Air M3', slug: 'macbook-air-m3', category: 'laptops', brand: 'Apple', price: 1850000, description: 'Impossibly thin with the M3 chip. Up to 18 hours of battery life, 15.3" Liquid Retina display, and fanless design.', image: '/images/products/MacBook-Air-M3.jpg', images: ['/images/products/MacBook-Air-M3.jpg'], badge: 'new', rating: 4.9, reviews: 156, stock: 12, featured: true, bestSeller: true, specifications: { Display: '13.6" Liquid Retina', Chip: 'Apple M3', Memory: '8GB Unified', Storage: '256GB SSD', Battery: 'Up to 18 hours', Weight: '1.24 kg' }, colors: [{ name: 'Midnight', hex: '#2e3546' }, { name: 'Starlight', hex: '#f5f0e6' }, { name: 'Space Gray', hex: '#6e6e6e' }, { name: 'Silver', hex: '#e8e8e8' }], features: ['Apple M3 chip', 'Fanless design', '18-hour battery', 'Liquid Retina display', 'MagSafe charging'], storageOptions: [{ label: '256GB', price: 1850000 }, { label: '512GB', price: 2050000 }, { label: '1TB', price: 2250000 }], warranty: '1-year Apple warranty', estimatedDelivery: '2-3 business days' },
      { name: 'MacBook Pro 14" M3 Pro', slug: 'macbook-pro-14-m3', category: 'laptops', brand: 'Apple', price: 3200000, description: 'Pro performance for demanding workflows. M3 Pro chip, 18GB unified memory, and stunning Liquid Retina XDR display.', image: '/images/products/MacBook-Pro-14-M3-Pro.jpg', images: ['/images/products/MacBook-Pro-14-M3-Pro.jpg'], rating: 4.9, reviews: 89, stock: 8, featured: true, specifications: { Display: '14.2" Liquid Retina XDR', Chip: 'Apple M3 Pro', Memory: '18GB Unified', Storage: '512GB SSD', Battery: 'Up to 17 hours' }, colors: [{ name: 'Space Black', hex: '#2a2a2a' }, { name: 'Silver', hex: '#e8e8e8' }], features: ['M3 Pro chip', 'Liquid Retina XDR', '18GB unified memory', 'MagSafe', 'HDMI port'], storageOptions: [{ label: '512GB', price: 3200000 }, { label: '1TB', price: 3600000 }], warranty: '1-year Apple warranty', estimatedDelivery: '2-3 business days' },
      { name: 'Dell XPS 15', slug: 'dell-xps-15', category: 'laptops', brand: 'Dell', price: 1650000, description: 'InfinityEdge display, 13th Gen Intel Core processor, and NVIDIA GeForce RTX graphics in a stunning design.', image: '/images/products/Dell-XPS-15.jpg', images: ['/images/products/Dell-XPS-15.jpg'], rating: 4.7, reviews: 134, stock: 15, featured: true, specifications: { Display: '15.6" 3.5K OLED', Processor: 'Intel Core i7-13700H', Graphics: 'NVIDIA RTX 4060', Memory: '16GB DDR5', Storage: '512GB SSD' }, colors: [{ name: 'Platinum Silver', hex: '#c0c0c0' }], features: ['InfinityEdge display', '3.5K OLED', 'NVIDIA RTX graphics', '13th Gen Intel'], storageOptions: [{ label: '512GB', price: 1650000 }, { label: '1TB', price: 1850000 }], warranty: '1-year Dell warranty', estimatedDelivery: '3-5 business days' },
      { name: 'HP Spectre x360 14', slug: 'hp-spectre-x360', category: 'laptops', brand: 'HP', price: 1350000, description: '2-in-1 convertible with 14" OLED touchscreen, Intel Evo platform, and 360-degree hinge for versatile use.', image: '/images/products/HP-Spectre-x360-14.jpg', images: ['/images/products/HP-Spectre-x360-14.jpg'], rating: 4.6, reviews: 87, stock: 18, specifications: { Display: '14" 2.8K OLED Touch', Processor: 'Intel Core Ultra 7', Memory: '16GB LPDDR5x', Storage: '512GB SSD', Convertible: '360° Hinge' }, colors: [{ name: 'Nightfall Black', hex: '#2a2a2a' }, { name: 'Nocturne Blue', hex: '#2a3a5a' }], features: ['360° hinge', 'OLED touchscreen', 'Intel Evo', 'Stylus support'], storageOptions: [{ label: '512GB', price: 1350000 }, { label: '1TB', price: 1550000 }], warranty: '1-year HP warranty', estimatedDelivery: '3-5 business days' },
      { name: 'Lenovo ThinkPad X1 Carbon', slug: 'lenovo-thinkpad-x1', category: 'laptops', brand: 'Lenovo', price: 1450000, description: 'Ultra-light business laptop with legendary ThinkPad durability, 14" 2.8K OLED display, and Intel vPro security.', image: '/images/products/Lenovo-ThinkPad-X1-Carbon.jpg', images: ['/images/products/Lenovo-ThinkPad-X1-Carbon.jpg'], rating: 4.7, reviews: 112, stock: 20, specifications: { Display: '14" 2.8K OLED', Processor: 'Intel Core Ultra 7 155H', Memory: '16GB LPDDR5x', Storage: '512GB SSD', Weight: '1.08 kg', Security: 'vPro, IR Camera' }, colors: [{ name: 'Black', hex: '#2a2a2a' }], features: ['Ultra-light 1.08kg', 'Intel vPro', 'IR Camera', 'Military-grade durability'], storageOptions: [{ label: '512GB', price: 1450000 }, { label: '1TB', price: 1650000 }], warranty: '3-year Lenovo warranty', estimatedDelivery: '3-5 business days' },
      { name: 'ASUS ROG Zephyrus G16', slug: 'asus-rog-zephyrus', category: 'laptops', brand: 'ASUS', price: 2100000, description: 'Gaming powerhouse with Intel Core Ultra 9, NVIDIA RTX 4080, 16" ROG Nebula display, and slim design.', image: '/images/products/ASUS-ROG-Zephyrus-G16.jpg', images: ['/images/products/ASUS-ROG-Zephyrus-G16.jpg'], badge: 'hot', rating: 4.8, reviews: 67, stock: 10, featured: true, specifications: { Display: '16" ROG Nebula OLED 240Hz', Processor: 'Intel Core Ultra 9 185H', Graphics: 'NVIDIA RTX 4080', Memory: '32GB LPDDR5x', Storage: '1TB SSD' }, colors: [{ name: 'Eclipse Gray', hex: '#4a4a4a' }], features: ['RTX 4080', 'ROG Nebula display', '240Hz OLED', 'Ultra 9 processor'], storageOptions: [{ label: '1TB', price: 2100000 }], warranty: '2-year ASUS warranty', estimatedDelivery: '3-5 business days' },

      // ── ACCESSORIES: EARBUDS & HEADPHONES ──
      { name: 'AirPods Pro 2 (USB-C)', slug: 'airpods-pro-2', category: 'accessories', brand: 'Apple', price: 285000, description: 'Active Noise Cancellation up to 2x more effective. Adaptive Transparency, Personalized Spatial Audio, and USB-C charging.', image: '/images/products/AirPods-Pro-2.jpg', images: ['/images/products/AirPods-Pro-2.jpg'], badge: 'bestseller', rating: 4.8, reviews: 892, stock: 80, bestSeller: true, specifications: { Type: 'In-ear Wireless', ANC: 'Active Noise Cancellation', Chip: 'Apple H2', Battery: '6h (30h with case)', Connector: 'USB-C', Water: 'IP54' }, features: ['Active Noise Cancellation', 'Adaptive Transparency', 'Personalized Spatial Audio', 'USB-C charging', 'MagSafe case'], warranty: '1-year Apple warranty', estimatedDelivery: '1-2 business days' },
      { name: 'AirPods 4', slug: 'airpods-4', category: 'accessories', brand: 'Apple', price: 165000, description: 'Redesigned for comfort with an open-ear fit. Personalized Spatial Audio and up to 30 hours of total battery life.', image: '/images/products/AirPods-4.jpg', images: ['/images/products/AirPods-4.jpg'], rating: 4.6, reviews: 456, stock: 100, specifications: { Type: 'Open-ear Wireless', Chip: 'Apple H2', Battery: '5h (30h with case)', Connector: 'USB-C' }, features: ['Open-ear design', 'Personalized Spatial Audio', 'USB-C charging', '30-hour total battery'], warranty: '1-year Apple warranty', estimatedDelivery: '1-2 business days' },
      { name: 'Sony WH-1000XM5', slug: 'sony-wh1000xm5', category: 'accessories', brand: 'Sony', price: 220000, description: 'Industry-leading noise cancellation with Auto NC Optimizer. 30-hour battery, multipoint connection, and speak-to-chat.', image: '/images/products/Sony-WH-1000XM5.jpg', images: ['/images/products/Sony-WH-1000XM5.jpg'], rating: 4.8, reviews: 567, stock: 35, featured: true, specifications: { Type: 'Over-ear Wireless', ANC: 'Industry-leading', Battery: '30 hours', Multipoint: 'Yes', Codec: 'LDAC, AAC' }, colors: [{ name: 'Black', hex: '#2a2a2a' }, { name: 'Platinum Silver', hex: '#c0c0c0' }], features: ['Industry-leading ANC', '30-hour battery', 'Multipoint connection', 'Speak-to-chat', 'LDAC Hi-Res'], warranty: '1-year Sony warranty', estimatedDelivery: '2-3 business days' },
      { name: 'Samsung Galaxy Buds3 Pro', slug: 'samsung-galaxy-buds3-pro', category: 'accessories', brand: 'Samsung', price: 155000, description: 'AI-powered Active Noise Cancellation with blade design. 360 Audio and Hi-Fi 24bit sound quality.', image: '/images/products/Samsung-Galaxy-Buds3-Pro.jpg', images: ['/images/products/Samsung-Galaxy-Buds3-Pro.jpg'], rating: 4.6, reviews: 198, stock: 45, specifications: { Type: 'In-ear Wireless', ANC: 'Adaptive ANC', Battery: '6h (30h with case)', Audio: 'Hi-Fi 24bit', Water: 'IP57' }, colors: [{ name: 'Silver', hex: '#c0c0c0' }, { name: 'White', hex: '#f0f0f0' }], features: ['AI-powered ANC', '360 Audio', 'Hi-Fi 24bit', 'IP57 water resistance'], warranty: '1-year Samsung warranty', estimatedDelivery: '2-3 business days' },

      // ── ACCESSORIES: WATCHES ──
      { name: 'Apple Watch Series 10', slug: 'apple-watch-series-10', category: 'accessories', brand: 'Apple', price: 380000, description: 'Thinnest Apple Watch ever with wide-angle OLED display. Sleep apnea detection, water temperature sensor, and fast charging.', image: '/images/products/Apple-Watch-Series-10.jpg', images: ['/images/products/Apple-Watch-Series-10.jpg'], badge: 'new', rating: 4.7, reviews: 189, stock: 30, featured: true, specifications: { Display: 'Wide-angle OLED', Case: '42mm / 46mm', Health: 'ECG, Blood O2, Temperature', Water: '100m WR', Battery: '18 hours', Fast_Charge: '80% in 30 min' }, colors: [{ name: 'Jet Black', hex: '#2a2a2a' }, { name: 'Rose Gold', hex: '#e8b8a8' }, { name: 'Silver', hex: '#e8e8e8' }], features: ['Sleep apnea detection', 'Water temperature sensor', 'Fast charging', 'ECG & Blood O2'], storageOptions: [{ label: '42mm', price: 380000 }, { label: '46mm', price: 420000 }], warranty: '1-year Apple warranty', estimatedDelivery: '1-2 business days' },
      { name: 'Samsung Galaxy Watch7', slug: 'samsung-galaxy-watch7', category: 'accessories', brand: 'Samsung', price: 220000, description: 'AI-powered health tracking with BioActive Sensor. Wear OS, GPS, and advanced sleep coaching.', image: '/images/products/Samsung-Galaxy-Watch-7.jpg', images: ['/images/products/Samsung-Galaxy-Watch-7.jpg'], rating: 4.5, reviews: 145, stock: 25, specifications: { Display: '1.47" Super AMOLED', Processor: 'Exynos W1000', Health: 'BioActive, GPS', OS: 'Wear OS 5', Battery: '40 hours', Water: '5ATM + IP68' }, colors: [{ name: 'Green', hex: '#4a7a4a' }, { name: 'Silver', hex: '#c0c0c0' }], features: ['AI health tracking', 'BioActive Sensor', 'Wear OS 5', 'Advanced sleep coaching'], storageOptions: [{ label: '40mm', price: 220000 }, { label: '44mm', price: 250000 }], warranty: '1-year Samsung warranty', estimatedDelivery: '2-3 business days' },

      // ── ACCESSORIES: SPEAKERS ──
      { name: 'JBL Charge 5', slug: 'jbl-charge-5', category: 'accessories', brand: 'JBL', price: 95000, description: 'Portable Bluetooth speaker with powerful JBL Pro Sound, IP67 waterproof, and 20 hours of playtime. Built-in powerbank.', image: '/images/products/JBL-Charge-5.jpg', images: ['/images/products/JBL-Charge-5.jpg'], badge: 'bestseller', rating: 4.7, reviews: 892, stock: 60, bestSeller: true, specifications: { Power: '30W', Battery: '20 hours', Water: 'IP67', Bluetooth: '5.1', Powerbank: 'Yes', Weight: '960g' }, colors: [{ name: 'Red', hex: '#c42847' }, { name: 'Blue', hex: '#3a6aa8' }, { name: 'Black', hex: '#2a2a2a' }, { name: 'Teal', hex: '#3a8a8a' }], features: ['JBL Pro Sound', 'IP67 waterproof', '20-hour battery', 'Built-in powerbank'], warranty: '1-year JBL warranty', estimatedDelivery: '2-3 business days' },
      { name: 'JBL Flip 6', slug: 'jbl-flip-6', category: 'accessories', brand: 'JBL', price: 65000, description: 'Portable Bluetooth speaker with bold JBL Original Pro Sound, IP67 waterproof and dustproof, and 12 hours of playtime.', image: '/images/products/JBL-Flip-6.jpg', images: ['/images/products/JBL-Flip-6.jpg'], rating: 4.6, reviews: 654, stock: 70, specifications: { Power: '20W', Battery: '12 hours', Water: 'IP67', Bluetooth: '5.1', Weight: '550g' }, colors: [{ name: 'Red', hex: '#c42847' }, { name: 'Blue', hex: '#3a6aa8' }, { name: 'Black', hex: '#2a2a2a' }, { name: 'Pink', hex: '#e8a8b8' }], features: ['JBL Pro Sound', 'IP67 waterproof & dustproof', '12-hour battery', 'PartyBoost'], warranty: '1-year JBL warranty', estimatedDelivery: '2-3 business days' },
      { name: 'Sony SRS-XB100', slug: 'sony-srs-xb100', category: 'accessories', brand: 'Sony', price: 35000, description: 'Ultra-portable wireless speaker with Sound Diffusion Processor, IP67 waterproof, and built-in microphone.', image: '/images/products/Sony-SRS-XB100.jpg', images: ['/images/products/Sony-SRS-XB100.jpg'], rating: 4.4, reviews: 321, stock: 80, specifications: { Battery: '16 hours', Water: 'IP67', Bluetooth: '5.3', Weight: '274g', Microphone: 'Yes' }, colors: [{ name: 'Black', hex: '#2a2a2a' }, { name: 'Blue', hex: '#3a6aa8' }, { name: 'Orange', hex: '#e88a3a' }], features: ['Ultra-portable 274g', 'IP67 waterproof', 'Sound Diffusion Processor', 'Built-in mic'], warranty: '1-year Sony warranty', estimatedDelivery: '2-3 business days' },

      // ── ACCESSORIES: CHARGERS & POWER BANKS ──
      { name: 'Anker 737 Power Bank (24,000mAh)', slug: 'anker-737-power-bank', category: 'accessories', brand: 'Anker', price: 65000, description: '140W bidirectional charging with smart digital display. Charges MacBook Pro, iPhone, and Samsung simultaneously.', image: '/images/products/Anker-737-Power-Bank.jpg', images: ['/images/products/Anker-737-Power-Bank.jpg'], rating: 4.7, reviews: 445, stock: 40, specifications: { Capacity: '24,000mAh / 86.4Wh', Output: '140W Max', Ports: '2 USB-C + 1 USB-A', Display: 'Smart Digital', Weight: '630g' }, features: ['140W bidirectional charging', 'Smart digital display', '24,000mAh capacity', 'Charge 3 devices at once'], warranty: '18-month Anker warranty', estimatedDelivery: '2-3 business days' },
      { name: 'Apple 35W Dual USB-C Charger', slug: 'apple-35w-dual-charger', category: 'accessories', brand: 'Apple', price: 42000, description: 'Charge two Apple devices simultaneously with compact design and intelligent power allocation.', image: '/images/products/Apple-35W-Dual-USB-C-Charger.jpg', images: ['/images/products/Apple-35W-Dual-USB-C-Charger.jpg'], rating: 4.5, reviews: 234, stock: 50, specifications: { Power: '35W Total', Ports: '2x USB-C', GaN: 'Yes', Foldable: 'Yes', Weight: '100g' }, features: ['Dual USB-C ports', 'GaN technology', 'Foldable design', 'Intelligent power allocation'], warranty: '1-year Apple warranty', estimatedDelivery: '1-2 business days' },
      { name: 'Samsung 45W Super Fast Charger', slug: 'samsung-45w-charger', category: 'accessories', brand: 'Samsung', price: 28000, description: 'Super Fast Charging 2.0 for Samsung Galaxy devices. USB-C PD compatible with cable included.', image: '/images/products/Samsung-45W-Super-Fast-Charger.jpg', images: ['/images/products/Samsung-45W-Super-Fast-Charger.jpg'], rating: 4.4, reviews: 567, stock: 90, specifications: { Power: '45W', Port: 'USB-C PD', Cable: 'Included', Compatible: 'Samsung Galaxy S/Note/A' }, features: ['Super Fast Charging 2.0', 'USB-C PD', 'Cable included', 'Wide compatibility'], warranty: '1-year Samsung warranty', estimatedDelivery: '2-3 business days' },

      // ── CONSOLES ──
      { name: 'PlayStation 5 Slim', slug: 'playstation-5-slim', category: 'gaming', brand: 'Sony', price: 520000, description: 'Slimmer PS5 with 1TB SSD, 4K gaming at 120fps, ray tracing, and DualSense wireless controller.', image: '/images/products/PlayStation-5-Slim.jpg', images: ['/images/products/PlayStation-5-Slim.jpg'], badge: 'hot', rating: 4.9, reviews: 1234, stock: 15, bestSeller: true, specifications: { CPU: 'AMD Zen 2, 8-core', GPU: '10.28 TFLOPS RDNA 2', Storage: '1TB SSD', Resolution: '4K @ 120fps', Ray_Tracing: 'Yes', Controller: 'DualSense' }, features: ['4K gaming at 120fps', 'Ray tracing', 'DualSense haptic feedback', '3D Audio', '1TB SSD'], storageOptions: [{ label: 'Digital Edition', price: 520000 }, { label: 'Disc Edition', price: 580000 }], warranty: '1-year Sony warranty', estimatedDelivery: '2-3 business days' },
      { name: 'Xbox Series X', slug: 'xbox-series-x', category: 'gaming', brand: 'Microsoft', price: 480000, description: 'Most powerful Xbox ever with 12 teraflops, 4K gaming at 120fps, Quick Resume, and Game Pass compatible.', image: '/images/products/Xbox-Series-X.jpg', images: ['/images/products/Xbox-Series-X.jpg'], rating: 4.8, reviews: 876, stock: 20, specifications: { CPU: 'AMD Zen 2, 8-core 3.8GHz', GPU: '12 TFLOPS RDNA 2', Storage: '1TB NVMe SSD', Resolution: '4K @ 120fps', Ray_Tracing: 'Yes', Game_Pass: 'Compatible' }, features: ['12 TFLOPS power', 'Quick Resume', 'Game Pass compatible', '4K at 120fps', 'Ray tracing'], warranty: '1-year Microsoft warranty', estimatedDelivery: '2-3 business days' },
      { name: 'Nintendo Switch OLED', slug: 'nintendo-switch-oled', category: 'gaming', brand: 'Nintendo', price: 320000, description: 'Vibrant 7-inch OLED screen, wide adjustable stand, enhanced audio, and 64GB of internal storage.', image: '/images/products/Nintendo-Switch-OLED.jpg', images: ['/images/products/Nintendo-Switch-OLED.jpg'], rating: 4.7, reviews: 2345, stock: 25, bestSeller: true, specifications: { Screen: '7" OLED Touch', Storage: '64GB', Resolution: '1280x720 (handheld)', Battery: '4.5 to 9 hours', Dock: 'Included', 'Joy-Con': 'Included' }, features: ['7" OLED screen', 'Adjustable stand', 'Enhanced audio', 'Tabletop & handheld modes'], warranty: '1-year Nintendo warranty', estimatedDelivery: '2-3 business days' },

      // ── TVs ──
      { name: 'Samsung 55" QN85D Neo QLED 4K', slug: 'samsung-55-qled', category: 'tvs', brand: 'Samsung', price: 850000, description: 'Neo QLED with Quantum Matrix Technology, Neural Quantum Processor 4K, and Anti-Glare screen.', image: '/images/products/Samsung-55-QN85D-Neo-QLED-4K.jpg', images: ['/images/products/Samsung-55-QN85D-Neo-QLED-4K.jpg'], rating: 4.7, reviews: 156, stock: 10, specifications: { Size: '55" Class', Resolution: '4K UHD', Panel: 'Neo QLED', HDR: 'HDR10+ / Dolby Atmos', Smart_TV: 'Tizen OS', HDMI: '4x HDMI 2.1' }, features: ['Quantum Matrix Technology', 'Neural Quantum Processor 4K', 'Anti-Glare screen', 'Dolby Atmos'], warranty: '1-year Samsung warranty', estimatedDelivery: '3-5 business days' },
      { name: 'LG 65" C4 OLED evo', slug: 'lg-65-c4-oled', category: 'tvs', brand: 'LG', price: 1450000, description: 'OLED evo with a9 Gen7 AI Processor, Dolby Vision & Atmos, 4K 120Hz, and webOS 24.', image: '/images/products/LG-65-C4-OLED-evo.jpg', images: ['/images/products/LG-65-C4-OLED-evo.jpg'], badge: 'new', rating: 4.9, reviews: 234, stock: 8, featured: true, specifications: { Size: '65" Class', Resolution: '4K OLED evo', Processor: 'a9 Gen7 AI', HDR: 'Dolby Vision / HDR10', Gaming: '4K 120Hz, VRR, G-Sync', Smart_TV: 'webOS 24' }, features: ['OLED evo panel', 'a9 Gen7 AI Processor', 'Dolby Vision & Atmos', '4K 120Hz gaming', 'G-Sync compatible'], warranty: '1-year LG warranty', estimatedDelivery: '3-5 business days' },

      // ── GAMING ACCESSORIES ──
      { name: 'Logitech G Pro X Superlight 2', slug: 'logitech-g-pro-x', category: 'gaming', brand: 'Logitech', price: 85000, description: 'Ultra-lightweight wireless gaming mouse at 60g. HERO 2 sensor, 95-hour battery, and LIGHTSPEED wireless.', image: '/images/products/Logitech-G-Pro-X-Superlight-2.jpg', images: ['/images/products/Logitech-G-Pro-X-Superlight-2.jpg'], rating: 4.8, reviews: 456, stock: 25, specifications: { Sensor: 'HERO 2 (32K DPI)', Weight: '60g', Battery: '95 hours', Wireless: 'LIGHTSPEED + BT', Switches: 'LIGHTFORCE' }, colors: [{ name: 'White', hex: '#f0f0f0' }, { name: 'Black', hex: '#2a2a2a' }], features: ['Ultra-lightweight 60g', 'HERO 2 sensor', '95-hour battery', 'LIGHTSPEED wireless'], warranty: '2-year Logitech warranty', estimatedDelivery: '2-3 business days' },
      { name: 'HyperX Cloud III Wireless', slug: 'hyperx-cloud-iii', category: 'gaming', brand: 'HyperX', price: 65000, description: 'Premium wireless gaming headset with angled 53mm drivers, DTS Headphone:X, and 120-hour battery.', image: '/images/products/HyperX-Cloud-III-Wireless.jpg', images: ['/images/products/HyperX-Cloud-III-Wireless.jpg'], rating: 4.6, reviews: 234, stock: 30, specifications: { Driver: '53mm Angled', Wireless: '2.4GHz', Battery: '120 hours', Mic: 'Detachable boom', DTS: 'Headphone:X' }, colors: [{ name: 'Black/Red', hex: '#2a2a2a' }], features: ['53mm angled drivers', '120-hour battery', 'DTS Headphone:X', 'Detachable mic'], warranty: '2-year HyperX warranty', estimatedDelivery: '2-3 business days' },
      { name: 'Razer BlackWidow V4 75%', slug: 'razer-blackwidow-v4', category: 'gaming', brand: 'Razer', price: 45000, description: 'Hot-swappable mechanical gaming keyboard with gasket-mounted FR4 plate, RGB, and aluminum construction.', image: '/images/products/Razer-BlackWidow-V4.jpg', images: ['/images/products/Razer-BlackWidow-V4.jpg'], badge: 'new', rating: 4.7, reviews: 123, stock: 20, specifications: { Type: 'Mechanical (Hot-swap)', Switch: 'Razer Orange V3', Layout: '75%', Plate: 'Gasket-mounted FR4', Connectivity: 'USB-C', RGB: 'Per-key Chroma' }, features: ['Hot-swappable switches', 'Gasket-mounted plate', 'Per-key RGB', 'Aluminum construction'], warranty: '2-year Razer warranty', estimatedDelivery: '2-3 business days' },
    ];

    await Product.insertMany(products);

    // Seed default settings
    await Settings.findOneAndUpdate({ key: 'cash_on_delivery' }, { key: 'cash_on_delivery', value: true }, { upsert: true });
    await Settings.findOneAndUpdate({ key: 'delivery_fee' }, { key: 'delivery_fee', value: 2000 }, { upsert: true });
    await Settings.findOneAndUpdate({ key: 'free_delivery_threshold' }, { key: 'free_delivery_threshold', value: 500000 }, { upsert: true });

    const categoriesDoc = await Settings.findOne({ key: 'categories' });
    if (!categoriesDoc) {
      await Settings.create({ key: 'categories', value: ['phones', 'laptops', 'tablets', 'smartwatches', 'headphones', 'speakers', 'gaming', 'tvs', 'accessories', 'networking', 'computer_components'] });
    }

    const adminExists = await User.findOne({ email: 'admin@dgelectronics.com' });
    if (!adminExists && process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD) {
      const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
      await User.create({ name: 'Admin', email: process.env.ADMIN_EMAIL, phone: process.env.ADMIN_PHONE || '', password: hash, role: 'admin' });
    }

    // Seed sample coupons
    const couponCount = await Coupon.countDocuments();
    if (couponCount === 0) {
      const now = new Date();
      const future = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
      await Coupon.insertMany([
        { code: 'WELCOME10', description: '10% off your first order', type: 'percentage', value: 10, minOrder: 50000, maxDiscount: 20000, usageLimit: 500, startDate: now, endDate: future, active: true },
        { code: 'SAVE5000', description: '₦5,000 off orders above ₦200,000', type: 'fixed', value: 5000, minOrder: 200000, usageLimit: 200, startDate: now, endDate: future, active: true },
        { code: 'FREESHIP', description: 'Free shipping on all orders', type: 'free_shipping', value: 0, usageLimit: 1000, startDate: now, endDate: future, active: true },
        { code: 'FLASH20', description: '20% off flash sale items', type: 'percentage', value: 20, maxDiscount: 50000, usageLimit: 100, startDate: now, endDate: future, active: true },
        { code: 'BOGO50', description: 'Buy one get one 50% off on selected items', type: 'bogo', value: 50, usageLimit: 50, startDate: now, endDate: future, active: true }
      ]);
    }

    // Seed sample promotions
    const promoCount = await Promotion.countDocuments();
    if (promoCount === 0) {
      const now = new Date();
      const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      const monthLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const phoneProducts = await Product.find({ category: 'phones' }).limit(5).select('_id');
      const laptopProducts = await Product.find({ category: 'laptops' }).limit(3).select('_id');
      const accessoryProducts = await Product.find({ category: 'accessories' }).limit(4).select('_id');
      await Promotion.insertMany([
        { title: 'Weekend Flash Sale', slug: 'weekend-flash-sale', description: 'Up to 20% off on selected phones this weekend only!', type: 'flash_sale', discountType: 'percentage', discountValue: 20, products: phoneProducts.map(p => p._id), categories: ['phones'], couponCode: 'FLASH20', startDate: now, endDate: weekLater, active: true, featured: true, priority: 10 },
        { title: 'Laptop Mega Deals', slug: 'laptop-mega-deals', description: 'Save up to ₦100,000 on premium laptops', type: 'daily_deal', discountType: 'fixed', discountValue: 100000, products: laptopProducts.map(p => p._id), categories: ['laptops'], startDate: now, endDate: monthLater, active: true, featured: true, priority: 8 },
        { title: 'Accessories Blowout', slug: 'accessories-blowout', description: '15% off all accessories - limited time!', type: 'weekly_deal', discountType: 'percentage', discountValue: 15, categories: ['accessories'], couponCode: 'SAVE5000', startDate: now, endDate: monthLater, active: true, priority: 5 },
        { title: 'New Year Tech Festival', slug: 'new-year-tech-festival', description: 'Massive discounts across all categories for the new year celebration!', type: 'holiday', discountType: 'percentage', discountValue: 25, categories: ['phones', 'laptops', 'accessories'], couponCode: 'WELCOME10', startDate: now, endDate: monthLater, active: true, featured: true, priority: 15 }
      ]);
    }

    // Seed FAQs
    const faqCount = await FAQ.countDocuments();
    if (faqCount === 0) {
      await FAQ.insertMany([
        { question: 'How do I place an order?', answer: 'Simply browse our products, add items to your cart, and proceed to checkout. You can pay via Paystack, Flutterwave, or bank transfer. You will receive an order confirmation email once your order is placed successfully.', category: 'orders', order: 1, helpful: 45 },
        { question: 'Can I modify my order after placing it?', answer: 'You can modify your order within 2 hours of placement by contacting our support team. After the order has been processed, modifications are no longer possible but you can request a return once delivered.', category: 'orders', order: 2, helpful: 32 },
        { question: 'How do I track my order?', answer: 'Go to the Track Order page and enter your tracking number. You can also find your tracking number in your order confirmation email and in your account dashboard under My Orders.', category: 'orders', order: 3, helpful: 67 },
        { question: 'What payment methods do you accept?', answer: 'We accept debit/credit cards (Visa, Mastercard, Verve), bank transfers, Paystack, and Flutterwave. All transactions are encrypted and secure.', category: 'payments', order: 1, helpful: 28 },
        { question: 'Is my payment information secure?', answer: 'Yes, all payments are processed through Paystack and Flutterwave, which use bank-level encryption. We never store your card details on our servers.', category: 'payments', order: 2, helpful: 35 },
        { question: 'Do you offer installment payments?', answer: 'Yes, we offer flexible payment plans through our partner Paystack. You can split your purchase into 3-6 monthly installments at checkout.', category: 'payments', order: 3, helpful: 41 },
        { question: 'How long does delivery take?', answer: 'Standard delivery within Nigeria takes 2-5 business days. Express delivery (Lagos and major cities) is 1-2 business days. Delivery to remote areas may take up to 7 business days.', category: 'shipping', order: 1, helpful: 53 },
        { question: 'How much is delivery?', answer: 'Delivery fee is ₦2,000 for standard delivery. Orders above ₦500,000 qualify for free delivery. Express delivery fee varies by location.', category: 'shipping', order: 2, helpful: 38 },
        { question: 'Which areas do you deliver to?', answer: 'We deliver to all 36 states in Nigeria including Abuja FCT. For international delivery inquiries, please contact our support team.', category: 'shipping', order: 3, helpful: 22 },
        { question: 'What is your return policy?', answer: 'We offer a 30-day hassle-free return policy. Items must be in original packaging and unused condition. Contact our support team to initiate a return.', category: 'returns', order: 1, helpful: 56 },
        { question: 'How do I request a refund?', answer: 'Go to your account dashboard, navigate to My Orders, select the order and click "Request Return/Refund". Fill in the form with your reason and our team will review within 48 hours.', category: 'returns', order: 2, helpful: 44 },
        { question: 'How long do refunds take?', answer: 'Refunds are processed within 5-7 business days after the return is approved. The amount will be credited to your original payment method or bank account.', category: 'returns', order: 3, helpful: 39 },
        { question: 'What warranty do products have?', answer: 'All products come with manufacturer warranty (typically 1-2 years). Apple products have 1-year Apple warranty. We also offer extended warranty options at checkout.', category: 'warranty', order: 1, helpful: 31 },
        { question: 'How do I make a warranty claim?', answer: 'Contact our support team with your order number and a description of the issue. We will arrange for inspection, repair, or replacement as applicable under the warranty terms.', category: 'warranty', order: 2, helpful: 27 },
        { question: 'How do I create an account?', answer: 'Click the Sign Up button in the navigation bar or go to /signup. Fill in your name, email, and password. You can also place orders as a guest.', category: 'account', order: 1, helpful: 19 },
        { question: 'How do I reset my password?', answer: 'Click "Forgot Password" on the login page. Enter your email address and we will send you a password reset link within minutes.', category: 'account', order: 2, helpful: 24 },
        { question: 'How do I update my profile information?', answer: 'Log in to your account, go to My Account, and click on the Profile tab. You can update your name, email, phone, and delivery addresses.', category: 'account', order: 3, helpful: 15 }
      ]);
    }

    console.log('Data seeded successfully: ' + products.length + ' products');
  } catch (err) { console.log('Seed error:', err.message); }
}

// ── Serve Pages ──
const sendPage = (page) => (req, res) => res.sendFile(path.join(__dirname, 'public', page));
app.get('/checkout', sendPage('checkout.html'));
app.get('/confirmation', sendPage('confirmation.html'));
app.get('/login', sendPage('login.html'));
app.get('/signup', sendPage('signup.html'));
app.get('/forgot-password', sendPage('forgot-password.html'));
app.get('/account', sendPage('account.html'));
app.get('/admin', (req, res) => {
  const token = req.header('Authorization')?.replace('Bearer ', '') || req.cookies?.token;
  if (!token) return res.status(403).sendFile(path.join(__dirname, 'public', '404.html'));
  try {
    const user = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    if (user.role !== 'admin') return res.status(403).sendFile(path.join(__dirname, 'public', '404.html'));
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  } catch { res.status(403).sendFile(path.join(__dirname, 'public', '404.html')); }
});
app.get('/track', sendPage('tracking.html'));
app.get('/category/:slug', sendPage('index.html'));
app.get('/product/:slug', sendPage('product.html'));
app.get('/contact', sendPage('contact.html'));
app.get('/faq', sendPage('faq.html'));
app.get('/compare', sendPage('compare.html'));

// ── 404 Handler ──
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// ── Global Error Handler ──
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message);
  if (req.path.startsWith('/api')) {
    res.status(500).json({ error: 'Internal server error' });
  } else {
    res.status(500).sendFile(path.join(__dirname, 'public', '500.html'));
  }
});

// ── Start Server ──
(async () => {
  
  await seedData();
  app.listen(PORT, () => {
    console.log(`DG Electronics running at http://localhost:${PORT}`);
  });
})();
