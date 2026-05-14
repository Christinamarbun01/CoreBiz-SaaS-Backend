import { Router } from 'express';
import { verifyJwt } from '../middleware/auth.js';
import { getProfitLoss } from '../controllers/dashboardController.js';
const router = Router();
/**
 * @route   GET /api/v1/dashboard/profit-loss
 * @desc    Mengambil ringkasan Laba Rugi dan data chart untuk Dashboard
 * @access  Private
 */
router.get('/profit-loss', verifyJwt, getProfitLoss);
export default router;
