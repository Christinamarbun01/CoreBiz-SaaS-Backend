import { Router } from 'express';
import { verifyJwt, authorizeRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  recipeSchema,
  getRecipes,
  addRecipe,
  removeRecipe,
} from '../controllers/recipeController.js';

const router = Router({ mergeParams: true }); // mergeParams agar :id dari parent route tersedia

// ─── Auth Guard ──────────────────────────────────────────────────────────────
router.use(verifyJwt, authorizeRole(['admin', 'owner', 'manager', 'staff']));

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /api/v1/products/:id/recipes
 * Mengambil daftar bahan baku (BOM) untuk satu produk.
 */
router.get('/', getRecipes);

/**
 * POST /api/v1/products/:id/recipes
 * Menambahkan bahan baku ke resep produk.
 */
router.post(
  '/',
  authorizeRole(['admin', 'owner', 'manager']),
  validateBody(recipeSchema),
  addRecipe,
);

/**
 * DELETE /api/v1/products/:id/recipes/:recipeId
 * Menghapus bahan baku dari resep produk.
 */
router.delete(
  '/:recipeId',
  authorizeRole(['admin', 'owner', 'manager']),
  removeRecipe,
);

export default router;
