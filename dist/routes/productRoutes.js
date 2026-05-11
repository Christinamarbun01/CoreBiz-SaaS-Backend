import { Router } from 'express';
import { verifyJwt, authorizeRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { productSchema, getProducts, createProduct, updateProduct, deleteProduct, } from '../controllers/productController.js';
import recipeRoutes from './recipeRoutes.js';
const router = Router();
// Semua rute diisolasi oleh middleware
router.use(verifyJwt, authorizeRole(['admin', 'owner', 'manager', 'staff']));
router.get('/', getProducts);
router.post('/', validateBody(productSchema), createProduct);
router.put('/:id', validateBody(productSchema), updateProduct);
router.delete('/:id', authorizeRole(['admin', 'owner', 'manager']), deleteProduct);
// Nested: BOM / Resep Bahan Baku
router.use('/:id/recipes', recipeRoutes);
export default router;
