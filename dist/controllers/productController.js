import { z } from 'zod';
import supabase from '../config/supabase.js';
// Zod Schema
export const productSchema = z.object({
    category_id: z.string().uuid('ID Kategori tidak valid').nullable().optional(),
    name: z.string().min(1, 'Nama produk wajib diisi').max(150, 'Nama maksimal 150 karakter'),
    sku: z.string().max(50, 'SKU maksimal 50 karakter').optional().nullable(),
    price: z.number().int().min(0, 'Harga (Price) tidak boleh negatif'),
    cost: z.number().int().min(0, 'HPP (Cost) tidak boleh negatif'),
    type: z.enum(['sellable', 'component', 'both'], {
        errorMap: () => ({ message: "Type harus 'sellable', 'component', atau 'both'" })
    }),
    is_stock_tracked: z.boolean(),
    current_stock: z.number().int().optional(),
    min_stock_alert: z.number().int().optional(),
}).superRefine((data, ctx) => {
    // Jika is_stock_tracked true, wajibkan/validasi current_stock dan min_stock_alert
    if (data.is_stock_tracked) {
        if (data.current_stock === undefined || data.current_stock === null) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "current_stock wajib diisi jika stok dilacak",
                path: ["current_stock"]
            });
        }
        if (data.min_stock_alert === undefined || data.min_stock_alert === null) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "min_stock_alert wajib diisi jika stok dilacak",
                path: ["min_stock_alert"]
            });
        }
    }
});
// GET /api/v1/products
export const getProducts = async (req, res) => {
    try {
        const tenant_id = req.user?.tenant_id;
        if (!tenant_id)
            return res.status(401).json({ error: 'Unauthorized: Tenant tidak valid' });
        // Gunakan query select beserta kategori-nya jika diinginkan
        const { data, error } = await supabase
            .from('products')
            .select('*, categories(id, name)')
            .eq('tenant_id', tenant_id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false });
        if (error)
            throw error;
        return res.status(200).json({
            message: 'Berhasil mengambil daftar produk',
            data,
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};
// POST /api/v1/products
export const createProduct = async (req, res) => {
    try {
        const tenant_id = req.user?.tenant_id;
        const user_id = req.user?.user_id;
        if (!tenant_id || !user_id)
            return res.status(401).json({ error: 'Unauthorized' });
        const payload = req.body;
        const { data, error } = await supabase
            .from('products')
            .insert({
            tenant_id,
            category_id: payload.category_id || null,
            type: payload.type,
            is_stock_tracked: payload.is_stock_tracked,
            sku: payload.sku || null,
            name: payload.name,
            price: payload.price,
            cost: payload.cost,
            current_stock: payload.is_stock_tracked ? payload.current_stock : 0,
            min_stock_alert: payload.is_stock_tracked ? payload.min_stock_alert : 0,
            created_by: user_id,
            updated_by: user_id,
        })
            .select()
            .maybeSingle();
        if (error)
            throw error;
        return res.status(201).json({
            message: 'Berhasil membuat produk baru',
            data,
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};
// PUT /api/v1/products/:id
export const updateProduct = async (req, res) => {
    try {
        const tenant_id = req.user?.tenant_id;
        const user_id = req.user?.user_id;
        const product_id = req.params.id;
        if (!tenant_id || !user_id)
            return res.status(401).json({ error: 'Unauthorized' });
        const payload = req.body;
        const { data, error } = await supabase
            .from('products')
            .update({
            category_id: payload.category_id || null,
            type: payload.type,
            is_stock_tracked: payload.is_stock_tracked,
            sku: payload.sku || null,
            name: payload.name,
            price: payload.price,
            cost: payload.cost,
            current_stock: payload.is_stock_tracked ? payload.current_stock : 0,
            min_stock_alert: payload.is_stock_tracked ? payload.min_stock_alert : 0,
            updated_by: user_id,
            updated_at: new Date().toISOString(),
        })
            .eq('id', product_id)
            .eq('tenant_id', tenant_id)
            .is('deleted_at', null)
            .select()
            .maybeSingle();
        if (error || !data) {
            return res.status(404).json({ error: 'Produk tidak ditemukan atau gagal diperbarui' });
        }
        return res.status(200).json({
            message: 'Berhasil memperbarui produk',
            data,
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};
// DELETE /api/v1/products/:id
export const deleteProduct = async (req, res) => {
    try {
        const tenant_id = req.user?.tenant_id;
        const user_id = req.user?.user_id;
        const product_id = req.params.id;
        if (!tenant_id || !user_id)
            return res.status(401).json({ error: 'Unauthorized' });
        // WAJIB Soft Delete (Harga Mati)
        const { data, error } = await supabase
            .from('products')
            .update({
            deleted_at: new Date().toISOString(),
            deleted_by: user_id,
        })
            .eq('id', product_id)
            .eq('tenant_id', tenant_id)
            .is('deleted_at', null)
            .select()
            .maybeSingle();
        if (error || !data) {
            return res.status(404).json({ error: 'Produk tidak ditemukan atau sudah dihapus' });
        }
        return res.status(200).json({
            message: 'Berhasil menghapus produk secara soft delete',
            data,
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};
