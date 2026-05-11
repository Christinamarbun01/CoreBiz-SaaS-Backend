import { z } from 'zod';
import supabase from '../config/supabase.js';
// Zod Schema
export const categorySchema = z.object({
    name: z.string().min(1, 'Nama kategori wajib diisi').max(100, 'Nama kategori maksimal 100 karakter'),
});
// GET /api/v1/categories
export const getCategories = async (req, res) => {
    try {
        const tenant_id = req.user?.tenant_id;
        if (!tenant_id)
            return res.status(401).json({ error: 'Unauthorized: Tenant tidak valid' });
        const { data, error } = await supabase
            .from('categories')
            .select('*')
            .eq('tenant_id', tenant_id)
            .is('deleted_at', null)
            .order('name', { ascending: true });
        if (error)
            throw error;
        return res.status(200).json({
            message: 'Berhasil mengambil daftar kategori',
            data,
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};
// POST /api/v1/categories
export const createCategory = async (req, res) => {
    try {
        const tenant_id = req.user?.tenant_id;
        const user_id = req.user?.user_id;
        if (!tenant_id || !user_id) {
            return res.status(401).json({ error: 'Unauthorized: Informasi user tidak lengkap' });
        }
        const { name } = req.body;
        const { data, error } = await supabase
            .from('categories')
            .insert({
            tenant_id,
            name,
            created_by: user_id,
            updated_by: user_id,
        })
            .select()
            .maybeSingle();
        if (error)
            throw error;
        return res.status(201).json({
            message: 'Berhasil membuat kategori baru',
            data,
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};
// PUT /api/v1/categories/:id
export const updateCategory = async (req, res) => {
    try {
        const tenant_id = req.user?.tenant_id;
        const user_id = req.user?.user_id;
        const category_id = req.params.id;
        if (!tenant_id || !user_id) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { name } = req.body;
        const { data, error } = await supabase
            .from('categories')
            .update({
            name,
            updated_by: user_id,
            updated_at: new Date().toISOString(),
        })
            .eq('id', category_id)
            .eq('tenant_id', tenant_id)
            .is('deleted_at', null)
            .select()
            .maybeSingle();
        if (error || !data) {
            return res.status(404).json({ error: 'Kategori tidak ditemukan atau gagal diperbarui' });
        }
        return res.status(200).json({
            message: 'Berhasil memperbarui kategori',
            data,
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};
// DELETE /api/v1/categories/:id
export const deleteCategory = async (req, res) => {
    try {
        const tenant_id = req.user?.tenant_id;
        const user_id = req.user?.user_id;
        const category_id = req.params.id;
        if (!tenant_id || !user_id) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        // WAJIB Soft Delete (Harga Mati)
        const { data, error } = await supabase
            .from('categories')
            .update({
            deleted_at: new Date().toISOString(),
            deleted_by: user_id,
        })
            .eq('id', category_id)
            .eq('tenant_id', tenant_id)
            .is('deleted_at', null)
            .select()
            .maybeSingle();
        if (error || !data) {
            return res.status(404).json({ error: 'Kategori tidak ditemukan atau sudah dihapus' });
        }
        return res.status(200).json({
            message: 'Berhasil menghapus kategori secara soft delete',
            data,
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};
