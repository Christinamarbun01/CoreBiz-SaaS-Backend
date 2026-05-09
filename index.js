require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { z } = require('zod');

const { verifyJwt, authorizeRole } = require('./middleware/auth');
const { validateBody } = require('./middleware/validate');

const app = express();
const PORT = process.env.PORT || 5000;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,https://kasir-umkm.com')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error('CORS domain tidak diizinkan'));
  },
};

app.use(cors(corsOptions));
app.use(express.json());

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Terlalu banyak request publik. Coba lagi nanti.',
  },
});

const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Terlalu banyak request webhook. Tunggu sebelum mencoba lagi.',
  },
});

// Create an API router for v1
const apiV1Router = express.Router();

apiV1Router.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Backend CoreBiz SaaS v1 siap!' });
});

// Zod Schema untuk endpoint demo orders
const orderSchema = z.object({
  item_name: z.string().min(1, 'Nama item tidak boleh kosong'),
  quantity: z.number().int().positive('Jumlah harus angka positif'),
  total_price: z.number().int().positive('Total harga harus berupa integer positif'),
});

// Demo endpoint order menggunakan Zod Middleware
apiV1Router.post('/orders', verifyJwt, authorizeRole(['admin', 'manager', 'staff', 'owner']), validateBody(orderSchema), (req, res) => {
  const { item_name, quantity, total_price } = req.body;
  // Di sini logic masuk ke DB
  return res.status(201).json({
    message: 'Pesanan berhasil dibuat',
    data: { item_name, quantity, total_price, tenant_id: req.user.tenant_id },
  });
});

// Endpoint webhook WhatsApp (Rate limited & token protected)
apiV1Router.post('/webhook/whatsapp', webhookLimiter, (req, res) => {
  const token = req.headers['x-webhook-token'] || req.query.token;
  if (token !== process.env.WHATSAPP_WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Token webhook tidak valid' });
  }
  
  return res.status(200).json({ message: 'Webhook WhatsApp diterima', data: req.body });
});

// Endpoint private demo (RBAC)
apiV1Router.get('/private', verifyJwt, authorizeRole(['admin', 'owner', 'manager', 'staff']), (req, res) => {
  return res.json({
    message: 'Akses privat berhasil. RBAC valid.',
    user: {
      user_id: req.user.user_id,
      role: req.user.role,
      tenant_id: req.user.tenant_id,
    },
  });
});

// Endpoint khusus owner/admin
apiV1Router.get('/admin', verifyJwt, authorizeRole(['admin', 'owner']), (req, res) => {
  return res.json({ message: 'Halo admin/owner, akses valid.', tenant: req.user.tenant_id });
});

// Mount the v1 router to /api/v1
app.use('/api/v1', publicLimiter, apiV1Router);

// Root route for convenience
app.get('/', (req, res) => {
  res.send('API berjalan di /api/v1');
});

// Global Error Handler Middleware
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err); // Log the real error to server console quietly
  
  // Custom CORS error handling
  if (err.message === 'CORS domain tidak diizinkan') {
    return res.status(403).json({ error: err.message });
  }

  // Return generic error to client
  res.status(500).json({
    error: 'Terjadi kesalahan pada server (Internal Server Error)',
  });
});

app.listen(PORT, () => {
  console.log(`Server jalan di http://localhost:${PORT}`);
});