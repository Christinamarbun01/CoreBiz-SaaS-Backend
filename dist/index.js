import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { verifyJwt, authorizeRole } from './middleware/auth.js';
import supabase from './config/supabase.js';
import orderRoutes from './routes/orderRoutes.js';
import { initializeWhatsApp } from './services/whatsappService.js';
// ---------------------------------------------------------------------------
// App Setup
// ---------------------------------------------------------------------------
const app = express();
const PORT = Number(process.env.PORT) || 5000;
// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
const corsOptions = {
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.includes(origin))
            return callback(null, true);
        callback(new Error('CORS domain tidak diizinkan'));
    },
};
app.use(cors(corsOptions));
app.use(express.json());
// ---------------------------------------------------------------------------
// Rate Limiters
// ---------------------------------------------------------------------------
const publicLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Terlalu banyak request publik. Coba lagi nanti.' },
});
const webhookLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Terlalu banyak request webhook. Tunggu sebelum mencoba lagi.' },
});
// ---------------------------------------------------------------------------
// API v1 Router
// ---------------------------------------------------------------------------
const apiV1Router = express.Router();
// Health check
apiV1Router.get('/health', (_req, res) => {
    res.json({ status: 'ok', message: 'Backend CoreBiz SaaS v1 siap!' });
});
// Test DB connection
apiV1Router.get('/test-db', async (_req, res) => {
    try {
        const { data, error } = await supabase
            .from('pg_tables')
            .select('tablename')
            .limit(1);
        if (error) {
            return res.status(500).json({
                status: 'Gagal',
                message: 'Koneksi ke Supabase bermasalah',
                detail: error.message,
            });
        }
        return res.status(200).json({
            status: 'Sukses',
            message: 'Berhasil terhubung ke database Supabase!',
            data,
        });
    }
    catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        return res.status(500).json({ status: 'Error', message });
    }
});
// Endpoint private RBAC demo
apiV1Router.get('/private', verifyJwt, authorizeRole(['admin', 'owner', 'manager', 'staff']), (req, res) => {
    res.json({
        message: 'Akses privat berhasil. RBAC valid.',
        user: {
            user_id: req.user?.user_id,
            role: req.user?.role,
            tenant_id: req.user?.tenant_id,
        },
    });
});
// Endpoint khusus owner/admin
apiV1Router.get('/admin', verifyJwt, authorizeRole(['admin', 'owner']), (req, res) => {
    res.json({ message: 'Halo admin/owner, akses valid.', tenant: req.user?.tenant_id });
});
// Webhook WhatsApp
apiV1Router.post('/webhook/whatsapp', webhookLimiter, (req, res) => {
    const token = req.headers['x-webhook-token'] ?? req.query['token'];
    if (token !== process.env.WHATSAPP_WEBHOOK_TOKEN) {
        return res.status(401).json({ error: 'Token webhook tidak valid' });
    }
    return res.status(200).json({ message: 'Webhook WhatsApp diterima', data: req.body });
});
import customerRoutes from './routes/customerRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import productRoutes from './routes/productRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import shiftRoutes from './routes/shiftRoutes.js';
import expenseRoutes from './routes/expenseRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
// Mount sub-routers
apiV1Router.use('/orders', orderRoutes);
apiV1Router.use('/customers', customerRoutes);
apiV1Router.use('/categories', categoryRoutes);
apiV1Router.use('/products', productRoutes);
apiV1Router.use('/inventory', inventoryRoutes);
apiV1Router.use('/shifts', shiftRoutes);
apiV1Router.use('/expenses', expenseRoutes);
apiV1Router.use('/reports', reportRoutes);
apiV1Router.use('/dashboard', dashboardRoutes);
// Mount v1 router
app.use('/api/v1', publicLimiter, apiV1Router);
// Root convenience route
app.get('/', (_req, res) => {
    res.send('API berjalan di /api/v1');
});
initializeWhatsApp().catch((err) => {
    console.error('Gagal menyalakan mesin WhatsApp:', err);
});
// ---------------------------------------------------------------------------
// Global Error Handler
// ---------------------------------------------------------------------------
app.use((err, _req, res, _next) => {
    console.error('Unhandled Error:', err);
    if (err.message === 'CORS domain tidak diizinkan') {
        return res.status(403).json({ error: err.message });
    }
    res.status(500).json({
        error: 'Terjadi kesalahan pada server (Internal Server Error)',
        message: err.message,
        stack: err.stack
    });
});
// ---------------------------------------------------------------------------
// Start Server
// ---------------------------------------------------------------------------
app.listen(PORT, () => {
    console.log(`Server jalan di http://localhost:${PORT}`);
});
