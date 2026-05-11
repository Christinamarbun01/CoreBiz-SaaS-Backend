import { Router } from 'express';
import { verifyJwt, authorizeRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { posOrderSchema, failFastQuantityGuard, createPosOrder, completeOrder, payOrder, payOrderSchema, } from '../controllers/orderController.js';
import { linkItemsSchema, linkOrderItems, } from '../controllers/orderLinkingController.js';
const router = Router();
/**
 * POST /api/v1/orders
 *
 * Pipeline middleware:
 *  1. verifyJwt              — validasi & decode JWT Supabase
 *  2. authorizeRole(...)     — batasi ke role yang diizinkan
 *  3. failFastQuantityGuard  — tolak cepat jika ada quantity < 1
 *  4. validateBody(schema)   — parse & validasi penuh dengan Zod
 *  5. createPosOrder         — INSERT ke Supabase & kirim respons
 */
router.post('/', verifyJwt, authorizeRole(['admin', 'owner', 'manager', 'staff']), failFastQuantityGuard, validateBody(posOrderSchema), createPosOrder);
/**
 * POST /api/v1/orders/:id/link-items
 *
 * Pipeline middleware:
 *  1. verifyJwt
 *  2. authorizeRole
 *  3. validateBody(linkItemsSchema)
 *  4. linkOrderItems
 */
router.post('/:id/link-items', verifyJwt, authorizeRole(['admin', 'owner', 'manager', 'staff']), validateBody(linkItemsSchema), linkOrderItems);
/**
 * PUT /api/v1/orders/:id/complete
 * Menyelesaikan pesanan dan melakukan increment total_orders pelanggan.
 */
router.put('/:id/complete', verifyJwt, authorizeRole(['admin', 'owner', 'manager', 'staff']), completeOrder);
/**
 * POST /api/v1/orders/:id/pay
 * Memproses pembayaran dan menyelesaikan pesanan (Zero Trust, Kalkulasi Server-Side)
 */
router.post('/:id/pay', verifyJwt, authorizeRole(['admin', 'owner', 'manager', 'staff']), validateBody(payOrderSchema), payOrder);
export default router;
