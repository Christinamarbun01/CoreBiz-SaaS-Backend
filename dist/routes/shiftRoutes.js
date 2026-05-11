import { Router } from 'express';
import { verifyJwt, authorizeRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { openShiftSchema, closeShiftSchema, openShift, getActiveShift, closeShift, } from '../controllers/shiftController.js';
const router = Router();
// ─── Auth Guard: Semua rute dilindungi ──────────────────────────────────────
router.use(verifyJwt, authorizeRole(['admin', 'owner', 'manager', 'staff']));
// ─── Routes ─────────────────────────────────────────────────────────────────
/**
 * POST /api/v1/shifts
 * Buka shift baru (opening_balance wajib diisi).
 */
router.post('/', validateBody(openShiftSchema), openShift);
/**
 * GET /api/v1/shifts/active
 * Ambil shift aktif milik user yang sedang login.
 */
router.get('/active', getActiveShift);
/**
 * PATCH /api/v1/shifts/:id/close
 * Tutup shift + auto-audit laci kasir.
 */
router.patch('/:id/close', validateBody(closeShiftSchema), closeShift);
export default router;
