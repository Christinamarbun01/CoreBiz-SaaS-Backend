import { Router } from 'express';
import { verifyJwt, authorizeRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  categorySchema,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from '../controllers/categoryController.js';

const router = Router();

// Semua rute wajib diisolasi dengan authMiddleware
router.use(verifyJwt, authorizeRole(['admin', 'owner', 'manager', 'staff']));

router.get('/', getCategories);
router.post('/', validateBody(categorySchema), createCategory);
router.put('/:id', validateBody(categorySchema), updateCategory);
router.delete('/:id', authorizeRole(['admin', 'owner', 'manager']), deleteCategory); // Biasanya staff tidak bisa hapus kategori

export default router;
