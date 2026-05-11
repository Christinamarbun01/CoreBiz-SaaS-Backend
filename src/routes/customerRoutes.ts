import { Router } from 'express';
import { verifyJwt, authorizeRole } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import {
  createCustomerSchema,
  getCustomers,
  getCustomerById,
  createCustomer,
  deleteCustomer,
} from '../controllers/customerController.js';

const router = Router();

/**
 * GET /api/v1/customers
 * Ambil daftar pelanggan.
 */
router.get(
  '/',
  verifyJwt,
  authorizeRole(['admin', 'owner', 'manager', 'staff']),
  getCustomers
);

/**
 * GET /api/v1/customers/:id
 * Ambil detail pelanggan beserta riwayat pesanannya.
 */
router.get(
  '/:id',
  verifyJwt,
  authorizeRole(['admin', 'owner', 'manager', 'staff']),
  getCustomerById
);

/**
 * POST /api/v1/customers
 * Tambah pelanggan baru.
 */
router.post(
  '/',
  verifyJwt,
  authorizeRole(['admin', 'owner', 'manager', 'staff']),
  validateBody(createCustomerSchema),
  createCustomer
);

/**
 * DELETE /api/v1/customers/:id
 * Soft delete pelanggan.
 */
router.delete(
  '/:id',
  verifyJwt,
  authorizeRole(['admin', 'owner', 'manager']), // Opsional: mungkin staff tidak boleh hapus? Tapi kita beri staff juga jika sesuai kebutuhan. Diubah ke ['owner', 'manager', 'admin'] sesuai best practice, jika user ingin ubah bisa disesuaikan.
  deleteCustomer
);

export default router;
