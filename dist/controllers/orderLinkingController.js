import { z } from 'zod';
import supabase from '../config/supabase.js';
// Payload Validation Schema
export const linkItemsSchema = z.object({
    notes: z.string().optional(),
    items: z
        .array(z.object({
        product_id: z.string().uuid('ID Produk harus berupa UUID yang valid'),
        quantity: z.number().int().positive('Kuantitas harus berupa bilangan bulat positif'),
    }))
        .min(1, 'Minimal satu item harus ditambahkan'),
});
// Controller Logic
export const linkOrderItems = async (req, res) => {
    try {
        const { id: order_id } = req.params;
        const { items, notes } = req.body;
        const tenant_id = req.user?.tenant_id;
        const user_id = req.user?.user_id;
        if (!tenant_id || !user_id) {
            return res.status(401).json({ error: 'Unauthorized: Informasi user tidak lengkap' });
        }
        // Zero Trust: Fetch harga asli dari DB
        const productIds = items.map((item) => item.product_id);
        const { data: products, error: productError } = await supabase
            .from('products')
            .select('id, price, cost')
            .in('id', productIds)
            .eq('tenant_id', tenant_id); // Pastikan mengambil produk dari tenant yang sama
        if (productError || !products) {
            return res.status(500).json({ error: 'Database error saat mengambil data produk' });
        }
        if (products.length !== productIds.length) {
            return res.status(404).json({ error: 'Satu atau lebih product_id tidak ditemukan di database' });
        }
        let totalAmount = 0;
        const orderItemsToInsert = items.map((item) => {
            const product = products.find((p) => p.id === item.product_id);
            const unitPrice = product.price || 0;
            const unitCost = product.cost || 0;
            const subtotal = unitPrice * item.quantity;
            totalAmount += subtotal;
            return {
                order_id,
                tenant_id,
                product_id: item.product_id,
                quantity: item.quantity,
                unit_price: unitPrice,
                unit_cost: unitCost,
                subtotal,
            };
        });
        // Lakukan INSERT ke tabel order_items
        const { error: insertError } = await supabase
            .from('order_items')
            .insert(orderItemsToInsert);
        if (insertError) {
            return res.status(500).json({ error: 'Gagal menyimpan data item pesanan' });
        }
        // Lakukan UPDATE pada tabel orders
        const updatePayload = {
            subtotal_amount: totalAmount,
            total_amount: totalAmount, // asumsi tidak ada diskon saat pengikatan ini, atau gunakan kalkulasi lain jika perlu
            status: 'processing',
            updated_by: user_id,
        };
        if (notes !== undefined) {
            updatePayload.notes = notes;
        }
        const { error: updateError } = await supabase
            .from('orders')
            .update(updatePayload)
            .eq('id', order_id)
            .eq('tenant_id', tenant_id);
        if (updateError) {
            return res.status(500).json({ error: 'Gagal memperbarui status dan total pesanan' });
        }
        return res.status(200).json({
            message: 'Berhasil mengikat item dan memperbarui pesanan',
            data: {
                order_id,
                total_amount: totalAmount,
                status: 'processing',
                notes: notes !== undefined ? notes : null
            },
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};
