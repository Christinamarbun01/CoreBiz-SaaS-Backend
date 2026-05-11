import { Router } from 'express';
import { verifyJwt, authorizeRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  adjustInventorySchema,
  adjustInventory,
  getInventoryLogs,
} from '../controllers/inventoryController.js';

const router = Router();

// ─── Auth Guard ──────────────────────────────────────────────────────────────
// Semua rute inventory wajib terautentikasi
router.use(verifyJwt, authorizeRole(['admin', 'owner', 'manager', 'staff']));

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * POST /api/v1/inventory/adjust
 * Melakukan penyesuaian stok (Restock atau Opname).
 * Hanya owner & manager yang bisa menyesuaikan stok.
 */
router.post(
  '/adjust',
  authorizeRole(['admin', 'owner', 'manager']),
  validateBody(adjustInventorySchema),
  adjustInventory,
);

/**
 * GET /api/v1/inventory/logs
 * Mengambil riwayat log inventaris.
 * Filter opsional: ?product_id=<uuid>
 */
router.get('/logs', getInventoryLogs);

// ─── ATURAN MUTLAK ───────────────────────────────────────────────────────────
// Tidak ada rute PUT, PATCH, DELETE pada module ini.
// inventory_logs bersifat append-only (immutable audit trail).

export default router;
