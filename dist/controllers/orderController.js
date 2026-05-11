import { z } from 'zod';
import supabase from '../config/supabase.js';
// ---------------------------------------------------------------------------
// Zod Schema
// ---------------------------------------------------------------------------
const orderItemSchema = z.object({
    product_id: z.string().uuid({ message: 'product_id harus berupa UUID yang valid' }),
    quantity: z.number().int().min(1, { message: 'quantity tidak boleh kurang dari 1' }),
});
export const posOrderSchema = z.object({
    /** Sumber transaksi — wajib literal 'pos' */
    source: z.literal('pos'),
    /** Status pembayaran */
    payment_status: z.enum(['paid', 'unpaid'], {
        errorMap: () => ({ message: "payment_status harus 'paid' atau 'unpaid'" }),
    }),
    /** Metode pembayaran */
    method: z.enum(['cash', 'qris', 'transfer'], {
        errorMap: () => ({ message: "method harus 'cash', 'qris', atau 'transfer'" }),
    }),
    /** customer_id opsional / nullable UUID */
    customer_id: z
        .string()
        .uuid({ message: 'customer_id harus berupa UUID yang valid' })
        .nullable()
        .optional(),
    /** Minimal satu item */
    items: z
        .array(orderItemSchema)
        .min(1, { message: 'Pesanan harus mengandung minimal satu item' }),
});
export const payOrderSchema = z.object({
    method: z.enum(['cash', 'qris', 'transfer'], {
        errorMap: () => ({ message: "method harus 'cash', 'qris', atau 'transfer'" }),
    }),
    discount_amount: z.number().min(0, { message: 'discount_amount tidak boleh negatif' }),
});
// ---------------------------------------------------------------------------
// Fail-fast guard — reject cepat sebelum Zod parsing penuh
// ---------------------------------------------------------------------------
export function failFastQuantityGuard(req, res, next) {
    const items = req.body?.items;
    if (!Array.isArray(items)) {
        next();
        return;
    }
    const invalidItem = items.find((item) => Number(item.quantity) < 1);
    if (invalidItem) {
        res.status(422).json({
            success: false,
            error: 'Fail Fast: quantity tidak valid',
            detail: `product_id "${invalidItem.product_id}" memiliki quantity ${invalidItem.quantity} (minimum: 1)`,
        });
        return;
    }
    next();
}
// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------
export async function createPosOrder(req, res, next) {
    try {
        const payload = req.body;
        const tenantId = req.user?.tenant_id;
        const userId = req.user?.user_id; // For created_by
        // 1. Fetch product prices and costs
        const productIds = payload.items.map(item => item.product_id);
        const { data: products, error: productsError } = await supabase
            .from('products')
            .select('id, price, cost')
            .in('id', productIds)
            .eq('tenant_id', tenantId);
        if (productsError) {
            console.error('[orderController] Error fetching products:', productsError.message);
            res.status(500).json({ success: false, error: 'Gagal mengambil data produk' });
            return;
        }
        if (!products || products.length === 0) {
            res.status(400).json({ success: false, error: 'Produk tidak ditemukan' });
            return;
        }
        // 2. Calculate totals and prepare order items
        let subtotalAmount = 0;
        const orderItemsToInsert = [];
        for (const item of payload.items) {
            const product = products.find(p => p.id === item.product_id);
            if (!product) {
                res.status(400).json({ success: false, error: `Produk dengan ID ${item.product_id} tidak valid` });
                return;
            }
            const itemSubtotal = product.price * item.quantity;
            subtotalAmount += itemSubtotal;
            orderItemsToInsert.push({
                tenant_id: tenantId,
                // order_id akan ditambahkan di langkah 4
                product_id: item.product_id,
                quantity: item.quantity,
                unit_price: product.price,
                unit_cost: product.cost,
                subtotal: itemSubtotal,
            });
        }
        const totalAmount = subtotalAmount; // Asumsi belum ada diskon untuk endpoint dasar ini
        // 3. Insert ke tabel orders (tanpa items dan method)
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .insert({
            tenant_id: tenantId,
            customer_id: payload.customer_id ?? null,
            source: payload.source,
            status: payload.payment_status === 'paid' ? 'completed' : 'draft',
            payment_status: payload.payment_status,
            subtotal_amount: subtotalAmount,
            discount_amount: 0,
            total_amount: totalAmount,
            created_by: userId,
        })
            .select()
            .single();
        if (orderError || !order) {
            console.error('[orderController] Supabase insert order error:', orderError?.message);
            res.status(500).json({
                success: false,
                error: 'Gagal membuat pesanan',
                detail: orderError?.message,
            });
            return;
        }
        // 4. Mapping order_id ke order_items
        const finalOrderItems = orderItemsToInsert.map(item => ({
            ...item,
            order_id: order.id,
        }));
        // 5. Insert ke tabel order_items
        const { error: itemsError } = await supabase
            .from('order_items')
            .insert(finalOrderItems);
        if (itemsError) {
            console.error('[orderController] Supabase insert order_items error:', itemsError.message);
            res.status(500).json({
                success: false,
                error: 'Pesanan terbuat tapi gagal menyimpan item',
                detail: itemsError.message,
            });
            return;
        }
        res.status(201).json({
            success: true,
            message: 'Pesanan POS berhasil dibuat dan item tersimpan',
            data: {
                ...order,
                items: finalOrderItems,
            },
        });
    }
    catch (err) {
        next(err);
    }
}
// ---------------------------------------------------------------------------
// PUT /api/v1/orders/:id/complete
// ---------------------------------------------------------------------------
export async function completeOrder(req, res, next) {
    try {
        const order_id = req.params.id;
        const tenant_id = req.user?.tenant_id;
        const user_id = req.user?.user_id;
        if (!tenant_id || !user_id) {
            return res.status(401).json({ error: 'Unauthorized: Invalid user or tenant' });
        }
        // 1. Ambil Data: Tarik pesanan dan semua order_items
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select(`
        id, 
        customer_id, 
        status, 
        payment_status,
        order_items (
          product_id,
          quantity
        )
      `)
            .eq('id', order_id)
            .eq('tenant_id', tenant_id)
            .maybeSingle();
        if (orderError)
            throw orderError;
        if (!order) {
            return res.status(404).json({ error: 'Pesanan tidak ditemukan atau Anda tidak memiliki akses' });
        }
        if (order.status === 'completed') {
            return res.status(400).json({ error: 'Pesanan sudah diselesaikan sebelumnya' });
        }
        // 2. Looping Keranjang & Potong Stok (The BOM Logic)
        if (order.order_items && Array.isArray(order.order_items)) {
            // Gunakan iterasi sinkron/berurutan untuk menghindari race condition
            for (const item of order.order_items) {
                // A. Cek Produk Utama
                const { data: mainProduct } = await supabase
                    .from('products')
                    .select('id, current_stock, is_stock_tracked')
                    .eq('id', item.product_id)
                    .eq('tenant_id', tenant_id)
                    .maybeSingle();
                if (mainProduct && mainProduct.is_stock_tracked) {
                    const stock_after = mainProduct.current_stock - item.quantity;
                    await supabase
                        .from('products')
                        .update({
                        current_stock: stock_after,
                        updated_by: user_id,
                        updated_at: new Date().toISOString(),
                    })
                        .eq('id', mainProduct.id)
                        .eq('tenant_id', tenant_id);
                    await supabase
                        .from('inventory_logs')
                        .insert({
                        tenant_id,
                        product_id: mainProduct.id,
                        reason: 'sale',
                        quantity_change: -item.quantity,
                        stock_after: stock_after,
                        reference_id: order.id,
                        created_by: user_id,
                    });
                }
                // B. Cek Komponen/Resep
                const { data: recipes } = await supabase
                    .from('recipes')
                    .select('ingredient_id, quantity_required')
                    .eq('product_id', item.product_id)
                    .eq('tenant_id', tenant_id);
                if (recipes && recipes.length > 0) {
                    for (const recipe of recipes) {
                        const { data: ingredient } = await supabase
                            .from('products')
                            .select('id, current_stock')
                            .eq('id', recipe.ingredient_id)
                            .eq('tenant_id', tenant_id)
                            .single();
                        if (ingredient) {
                            const pengurangan = item.quantity * recipe.quantity_required;
                            const ing_stock_after = ingredient.current_stock - pengurangan;
                            await supabase
                                .from('products')
                                .update({
                                current_stock: ing_stock_after,
                                updated_by: user_id,
                                updated_at: new Date().toISOString(),
                            })
                                .eq('id', ingredient.id)
                                .eq('tenant_id', tenant_id);
                            await supabase
                                .from('inventory_logs')
                                .insert({
                                tenant_id,
                                product_id: ingredient.id,
                                reason: 'sale',
                                quantity_change: -pengurangan,
                                stock_after: ing_stock_after,
                                reference_id: order.id,
                                created_by: user_id,
                            });
                        }
                    }
                }
            }
        }
        // 3. Denormalisasi: Jika ada customer_id, increment total_orders
        if (order.customer_id) {
            const { data: customer, error: fetchError } = await supabase
                .from('customers')
                .select('total_orders')
                .eq('id', order.customer_id)
                .eq('tenant_id', tenant_id)
                .single();
            if (!fetchError && customer) {
                const newTotal = (customer.total_orders || 0) + 1;
                await supabase
                    .from('customers')
                    .update({
                    total_orders: newTotal,
                    updated_by: user_id,
                    updated_at: new Date().toISOString(),
                })
                    .eq('id', order.customer_id)
                    .eq('tenant_id', tenant_id);
            }
        }
        // 4. Finalisasi: Update orders table
        const { data: updatedOrder, error: updateError } = await supabase
            .from('orders')
            .update({
            status: 'completed',
            payment_status: 'paid',
            updated_by: user_id,
            updated_at: new Date().toISOString(),
        })
            .eq('id', order_id)
            .eq('tenant_id', tenant_id)
            .select()
            .single();
        if (updateError || !updatedOrder) {
            return res.status(500).json({ error: 'Gagal memfinalisasi pesanan' });
        }
        return res.status(200).json({
            message: 'Pesanan berhasil diselesaikan, stok produk & komponen telah dipotong',
            data: updatedOrder,
        });
    }
    catch (error) {
        console.error('[CompleteOrder]', error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}
// ---------------------------------------------------------------------------
// POST /api/v1/orders/:id/pay
// ---------------------------------------------------------------------------
export async function payOrder(req, res, next) {
    try {
        const order_id = req.params.id;
        const tenant_id = req.user?.tenant_id;
        const user_id = req.user?.user_id;
        if (!tenant_id || !user_id) {
            return res.status(401).json({ error: 'Unauthorized: Invalid user or tenant' });
        }
        const { method, discount_amount } = req.body;
        // 1. Validasi Shift Aktif
        const { data: activeShift, error: shiftError } = await supabase
            .from('shifts')
            .select('id')
            .eq('user_id', user_id)
            .eq('tenant_id', tenant_id)
            .eq('status', 'open')
            .order('opened_at', { ascending: false })
            .limit(1)
            .maybeSingle();
        if (shiftError)
            throw shiftError;
        if (!activeShift) {
            return res.status(400).json({ error: 'Anda belum membuka kasir' });
        }
        const shift_id = activeShift.id;
        // 2. Ambil Data Pesanan
        const { data: order, error: orderError } = await supabase
            .from('orders')
            .select(`
        id, 
        customer_id, 
        status, 
        payment_status,
        order_items (
          product_id,
          quantity,
          subtotal
        )
      `)
            .eq('id', order_id)
            .eq('tenant_id', tenant_id)
            .maybeSingle();
        if (orderError)
            throw orderError;
        if (!order) {
            return res.status(404).json({ error: 'Pesanan tidak ditemukan atau Anda tidak memiliki akses' });
        }
        if (order.status === 'completed' || order.payment_status === 'paid') {
            return res.status(400).json({ error: 'Pesanan sudah dibayar/diselesaikan sebelumnya' });
        }
        // 3. Kalkulasi Server-Side (Zero Trust)
        let subtotal_amount = 0;
        if (order.order_items && Array.isArray(order.order_items)) {
            for (const item of order.order_items) {
                subtotal_amount += (item.subtotal || 0);
            }
        }
        const total_amount = Math.max(0, subtotal_amount - discount_amount);
        // 4. Database Transaction
        // A. Insert ke tabel payments
        const { error: paymentError } = await supabase
            .from('payments')
            .insert({
            tenant_id,
            order_id,
            shift_id,
            method,
            amount: total_amount,
        });
        if (paymentError)
            throw paymentError;
        // B. Update tabel orders
        const { data: updatedOrder, error: updateOrderError } = await supabase
            .from('orders')
            .update({
            payment_status: 'paid',
            status: 'completed',
            shift_id,
            subtotal_amount,
            discount_amount,
            total_amount,
            updated_by: user_id,
            updated_at: new Date().toISOString(),
        })
            .eq('id', order_id)
            .eq('tenant_id', tenant_id)
            .select()
            .maybeSingle();
        if (updateOrderError || !updatedOrder) {
            throw updateOrderError || new Error('Gagal memperbarui pesanan');
        }
        // 5. Integrasi Inventaris (Potong Stok)
        if (order.order_items && Array.isArray(order.order_items)) {
            for (const item of order.order_items) {
                const { data: mainProduct } = await supabase
                    .from('products')
                    .select('id, current_stock, is_stock_tracked')
                    .eq('id', item.product_id)
                    .eq('tenant_id', tenant_id)
                    .maybeSingle();
                if (mainProduct && mainProduct.is_stock_tracked) {
                    const stock_after = mainProduct.current_stock - item.quantity;
                    await supabase
                        .from('products')
                        .update({
                        current_stock: stock_after,
                        updated_by: user_id,
                        updated_at: new Date().toISOString(),
                    })
                        .eq('id', mainProduct.id)
                        .eq('tenant_id', tenant_id);
                    await supabase
                        .from('inventory_logs')
                        .insert({
                        tenant_id,
                        product_id: mainProduct.id,
                        reason: 'sale',
                        quantity_change: -item.quantity,
                        stock_after: stock_after,
                        reference_id: order.id,
                        created_by: user_id,
                    });
                }
                const { data: recipes } = await supabase
                    .from('recipes')
                    .select('ingredient_id, quantity_required')
                    .eq('product_id', item.product_id)
                    .eq('tenant_id', tenant_id);
                if (recipes && recipes.length > 0) {
                    for (const recipe of recipes) {
                        const { data: ingredient } = await supabase
                            .from('products')
                            .select('id, current_stock')
                            .eq('id', recipe.ingredient_id)
                            .eq('tenant_id', tenant_id)
                            .maybeSingle();
                        if (ingredient) {
                            const pengurangan = item.quantity * recipe.quantity_required;
                            const ing_stock_after = ingredient.current_stock - pengurangan;
                            await supabase
                                .from('products')
                                .update({
                                current_stock: ing_stock_after,
                                updated_by: user_id,
                                updated_at: new Date().toISOString(),
                            })
                                .eq('id', ingredient.id)
                                .eq('tenant_id', tenant_id);
                            await supabase
                                .from('inventory_logs')
                                .insert({
                                tenant_id,
                                product_id: ingredient.id,
                                reason: 'sale',
                                quantity_change: -pengurangan,
                                stock_after: ing_stock_after,
                                reference_id: order.id,
                                created_by: user_id,
                            });
                        }
                    }
                }
            }
        }
        // 6. Update CRM (total_orders)
        if (order.customer_id) {
            const { data: customer, error: fetchError } = await supabase
                .from('customers')
                .select('total_orders')
                .eq('id', order.customer_id)
                .eq('tenant_id', tenant_id)
                .maybeSingle();
            if (!fetchError && customer) {
                const newTotal = (customer.total_orders || 0) + 1;
                await supabase
                    .from('customers')
                    .update({
                    total_orders: newTotal,
                    updated_by: user_id,
                    updated_at: new Date().toISOString(),
                })
                    .eq('id', order.customer_id)
                    .eq('tenant_id', tenant_id);
            }
        }
        return res.status(200).json({
            message: 'Pembayaran berhasil diproses dan stok telah dipotong',
            data: updatedOrder,
        });
    }
    catch (error) {
        console.error('[payOrder]', error);
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
}
