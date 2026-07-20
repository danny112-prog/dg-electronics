/* ═══════════════════════════════════════════════
   DG Electronics – Payment Configuration
   Keys are loaded from environment variables (.env file)
   Get your keys at: https://dashboard.paystack.com/settings/keys
   ═══════════════════════════════════════════════ */

const paymentConfig = {
  // ── Paystack ──
  paystack: {
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',    // pk_test_... or pk_live_...
    secretKey: process.env.PAYSTACK_SECRET_KEY || '',    // sk_test_... or sk_live_... (NEVER expose to frontend!)
    webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET || '', // whsec_... (used to verify webhook signatures)
    callbackUrl: '/confirmation',
  },

  // ── Flutterwave ──
  flutterwave: {
    publicKey: process.env.FLUTTERWAVE_PUBLIC_KEY || '',
    secretKey: process.env.FLUTTERWAVE_SECRET_KEY || '',
    encryptionKey: process.env.FLUTTERWAVE_ENCRYPTION_KEY || '',
    callbackUrl: '/confirmation',
  },

  // ── Supported Payment Methods ──
  methods: {
    paystackCard: true,
    paystackBank: true,
    paystackUssd: true,
    flutterwaveCard: true,
    flutterwaveBank: true,
    flutterwaveUssd: true,
    applePay: false,
    googlePay: false,
    cashOnDelivery: true,
  },

  // ── Delivery ──
  delivery: {
    fee: 2000,
    freeThreshold: 500000,
    estimatedDays: '3-5',
    expressDays: '1-2',
  },

  // ── Currency ──
  currency: 'NGN',
};

// Node.js module export (for server-side use)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = paymentConfig;
}
