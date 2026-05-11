import { Router } from 'express';
import { verifyJwt, authorizeRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  createExpenseSchema,
  createExpense,
  getExpenses,
} from '../controllers/expenseController.js';

const router = Router();

router.post(
  '/',
  verifyJwt,
  authorizeRole(['admin', 'owner', 'manager', 'staff']),
  validateBody(createExpenseSchema),
  createExpense
);

router.get(
  '/',
  verifyJwt,
  authorizeRole(['admin', 'owner', 'manager', 'staff']),
  getExpenses
);

export default router;
