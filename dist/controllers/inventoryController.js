import { z } from 'zod';
import supabase from '../config/supabase.js';
// ---------------------------------------------------------------------------
// Zod Schema
// ---------------------------------------------------------------------------
export const adjustInventorySchema = z.object({
    product_id: z.string().uuid('product_id harus berupa UUID valid'),
    type: z.enum(['restock', 'opname'], {
        errorMap: () => ({ message: "type harus 'restock' atau 'opname'" }),
    }),
    value: z.number().int('Value harus bilangan bulat').min(0, 'Value tidak boleh negatif'),
});
// ---------------------------------------------------------------------------
// POST /api/v1/inventory/adjust
// ---------------------------------------------------------------------------
export const adjustInventory = async (req, res) => {
    try {
        const tenant_id = req.user?.tenant_id;
        const user_id = req.user?.user_id;
        if (!tenant_id || !user_id) {
            return res.status(401).json({ error: 'Unauthorized: Informasi user tidak lengkap' });
        }
        const { product_id, type, value } = req.body;
        // ── LANGKAH 1: Ambil stok terkini (Zero Trust — jangan percaya frontend) ──
        const { data: product, error: fetchError } = await supabase
            .from('products')
            .select('id, name, current_stock, is_stock_tracked')
            .eq('id', product_id)
            .eq('tenant_id', tenant_id)
            .is('deleted_at', null)
            .single();
        if (fetchError || !product) {
            return res.status(404).json({ error: 'Produk tidak ditemukan di tenant Anda' });
        }
        if (!product.is_stock_tracked) {
            return res.status(400).json({ error: 'Produk ini tidak memiliki pelacakan stok fisik (is_stock_tracked = false)' });
        }
        // ── LANGKAH 2: Komputasi server-side ──
        const current_stock = product.current_stock;
        let quantity_change;
        let stock_after;
        let reason;
        if (type === 'restock') {
            // Tambah stok
            quantity_change = value;
            stock_after = current_stock + value;
            reason = 'restock';
        }
        else {
            // Opname: value = stok aktual di rak
            quantity_change = value - current_stock; // bisa negatif jika ada selisih kurang
            stock_after = value;
            reason = 'manual_adjustment';
        }
        // ── LANGKAH 3: UPDATE tabel products ──
        const { error: updateError } = await supabase
            .from('products')
            .update({
            current_stock: stock_after,
            updated_by: user_id,
            updated_at: new Date().toISOString(),
        })
            .eq('id', product_id)
            .eq('tenant_id', tenant_id);
        if (updateError) {
            console.error('[InventoryController] Update products failed:', updateError);
            return res.status(500).json({ error: 'Gagal memperbarui stok produk', detail: updateError.message });
        }
        // ── LANGKAH 4: INSERT ke inventory_logs (append-only) ──
        const { data: log, error: logError } = await supabase
            .from('inventory_logs')
            .insert({
            tenant_id,
            product_id,
            reason,
            quantity_change,
            stock_after,
            created_by: user_id,
        })
            .select()
            .single();
        if (logError) {
            console.error('[InventoryController] Insert inventory_log failed:', logError);
            // CATATAN: Stok produk sudah ter-update, tapi log gagal dibuat.
            // Ini kondisi yang perlu dicatat untuk audit trail manual.
            return res.status(500).json({
                error: 'Stok berhasil diperbarui NAMUN pencatatan log gagal. Segera hubungi admin.',
                detail: logError.message,
            });
        }
        return res.status(200).json({
            message: type === 'restock'
                ? `Berhasil melakukan restock +${quantity_change} unit untuk "${product.name}"`
                : `Berhasil melakukan opname. Stok disesuaikan dari ${current_stock} → ${stock_after} (selisih: ${quantity_change > 0 ? '+' : ''}${quantity_change})`,
            data: {
                product_name: product.name,
                previous_stock: current_stock,
                quantity_change,
                stock_after,
                reason,
                log_id: log.id,
            },
        });
    }
    catch (error) {
        console.error('[InventoryController] Unexpected error:', error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};
// ---------------------------------------------------------------------------
// GET /api/v1/inventory/logs
// ---------------------------------------------------------------------------
export const getInventoryLogs = async (req, res) => {
    try {
        const tenant_id = req.user?.tenant_id;
        if (!tenant_id)
            return res.status(401).json({ error: 'Unauthorized' });
        // Optional filter by product_id
        const product_id = req.query.product_id;
        let query = supabase
            .from('inventory_logs')
            .select(`
        id,
        reason,
        quantity_change,
        stock_after,
        created_at,
        created_by,
        product_id,
        products (id, name, sku)
      `)
            .eq('tenant_id', tenant_id)
            .order('created_at', { ascending: false })
            .limit(100);
        // Filter opsional berdasarkan product_id
        if (product_id) {
            query = query.eq('product_id', product_id);
        }
        const { data, error } = await query;
        if (error)
            throw error;
        return res.status(200).json({
            message: 'Berhasil mengambil riwayat inventory log',
            filter: { product_id: product_id || null },
            total: data?.length ?? 0,
            data,
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};
