import { Router } from 'express';
import { verifyJwt, authorizeRole } from '../middleware/auth.js';
import { getPnlReport } from '../controllers/reportController.js';
const router = Router();
// HANYA owner yang boleh akses
router.get('/pnl', verifyJwt, authorizeRole(['owner']), getPnlReport);
export default router;
