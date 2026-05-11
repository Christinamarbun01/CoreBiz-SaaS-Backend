import { z } from 'zod';
import supabase from '../config/supabase.js';
// ---------------------------------------------------------------------------
// Zod Schema
// ---------------------------------------------------------------------------
export const recipeSchema = z.object({
    ingredient_id: z.string().uuid('ingredient_id harus berupa UUID valid'),
    quantity_required: z
        .number()
        .positive('quantity_required harus lebih dari 0')
        .finite('quantity_required harus berupa angka valid'),
});
// ---------------------------------------------------------------------------
// GET /api/v1/products/:id/recipes
// ---------------------------------------------------------------------------
export const getRecipes = async (req, res) => {
    try {
        const tenant_id = req.user?.tenant_id;
        const product_id = req.params.id;
        if (!tenant_id)
            return res.status(401).json({ error: 'Unauthorized' });
        const { data, error } = await supabase
            .from('recipes')
            .select(`
        id,
        quantity_required,
        created_at,
        ingredient_id,
        ingredients:products!recipes_ingredient_id_fkey (
          id,
          name,
          sku,
          current_stock,
          is_stock_tracked,
          type
        )
      `)
            .eq('product_id', product_id)
            .eq('tenant_id', tenant_id);
        if (error)
            throw error;
        return res.status(200).json({
            message: 'Berhasil mengambil daftar resep/BOM',
            product_id,
            total: data?.length ?? 0,
            data,
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};
// ---------------------------------------------------------------------------
// POST /api/v1/products/:id/recipes
// ---------------------------------------------------------------------------
export const addRecipe = async (req, res) => {
    try {
        const tenant_id = req.user?.tenant_id;
        const user_id = req.user?.user_id;
        const product_id = req.params.id;
        if (!tenant_id || !user_id) {
            return res.status(401).json({ error: 'Unauthorized: Informasi user tidak lengkap' });
        }
        const { ingredient_id, quantity_required } = req.body;
        // ── FAIL FAST: Cegah self-referencing ──
        if (ingredient_id === product_id) {
            return res.status(422).json({
                error: 'Produk tidak bisa menjadi bahan baku untuk dirinya sendiri',
            });
        }
        // ── Cek Silang Database: Pastikan ingredient ada dan valid ──
        const { data: ingredient, error: fetchError } = await supabase
            .from('products')
            .select('id, name, is_stock_tracked, type')
            .eq('id', ingredient_id)
            .eq('tenant_id', tenant_id)
            .is('deleted_at', null)
            .maybeSingle();
        if (fetchError || !ingredient) {
            return res.status(404).json({
                error: 'Bahan baku tidak ditemukan di tenant Anda',
            });
        }
        // ── Validasi Logis: Bahan baku wajib barang fisik ──
        if (!ingredient.is_stock_tracked) {
            return res.status(422).json({
                error: 'Bahan baku wajib berupa barang fisik yang dilacak stoknya. Tidak bisa meresepkan jasa.',
            });
        }
        // ── INSERT ke tabel recipes ──
        const { data, error: insertError } = await supabase
            .from('recipes')
            .insert({
            tenant_id,
            product_id,
            ingredient_id,
            quantity_required,
            created_by: user_id,
            updated_by: user_id,
        })
            .select()
            .maybeSingle();
        if (insertError) {
            // Handle unique constraint violation (product_id + ingredient_id)
            if (insertError.code === '23505') {
                return res.status(409).json({
                    error: `Bahan baku "${ingredient.name}" sudah terdaftar di resep produk ini`,
                });
            }
            throw insertError;
        }
        return res.status(201).json({
            message: `Berhasil menambahkan "${ingredient.name}" sebagai bahan baku (${quantity_required} unit per produk)`,
            data,
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};
// ---------------------------------------------------------------------------
// DELETE /api/v1/products/:id/recipes/:recipeId
// ---------------------------------------------------------------------------
export const removeRecipe = async (req, res) => {
    try {
        const tenant_id = req.user?.tenant_id;
        const { id: product_id, recipeId } = req.params;
        if (!tenant_id)
            return res.status(401).json({ error: 'Unauthorized' });
        const { data, error } = await supabase
            .from('recipes')
            .delete()
            .eq('id', recipeId)
            .eq('product_id', product_id)
            .eq('tenant_id', tenant_id)
            .select()
            .maybeSingle();
        if (error || !data) {
            return res.status(404).json({ error: 'Resep bahan baku tidak ditemukan' });
        }
        return res.status(200).json({
            message: 'Berhasil menghapus bahan baku dari resep',
            data,
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};
