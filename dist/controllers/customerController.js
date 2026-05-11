import { z } from 'zod';
import supabase from '../config/supabase.js';
// Validasi Payload Tambah Customer
export const createCustomerSchema = z.object({
    name: z.string().min(1, 'Nama wajib diisi').max(100, 'Nama maksimal 100 karakter'),
    phone_number: z.string().max(20, 'Nomor HP maksimal 20 karakter').optional().nullable(),
    profile_metadata: z.record(z.any()).optional().nullable(),
});
// GET /api/v1/customers
export const getCustomers = async (req, res) => {
    try {
        const tenant_id = req.user?.tenant_id;
        if (!tenant_id)
            return res.status(401).json({ error: 'Unauthorized: Tenant tidak valid' });
        const search = req.query.search;
        let query = supabase
            .from('customers')
            .select('*')
            .eq('tenant_id', tenant_id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false });
        if (search) {
            // Menggunakan OR operator untuk mencari nama atau nomor hp
            query = query.or(`name.ilike.%${search}%,phone_number.ilike.%${search}%`);
        }
        const { data, error } = await query;
        if (error)
            throw error;
        return res.status(200).json({
            message: 'Berhasil mengambil daftar pelanggan',
            data,
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};
// GET /api/v1/customers/:id
export const getCustomerById = async (req, res) => {
    try {
        const tenant_id = req.user?.tenant_id;
        const customer_id = req.params.id;
        if (!tenant_id)
            return res.status(401).json({ error: 'Unauthorized: Tenant tidak valid' });
        const { data: customer, error: customerError } = await supabase
            .from('customers')
            .select('*')
            .eq('id', customer_id)
            .eq('tenant_id', tenant_id)
            .is('deleted_at', null)
            .single();
        if (customerError || !customer) {
            return res.status(404).json({ error: 'Pelanggan tidak ditemukan atau sudah dihapus' });
        }
        // Ambil riwayat order pelanggan
        const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select('*')
            .eq('customer_id', customer_id)
            .eq('tenant_id', tenant_id)
            .is('deleted_at', null)
            .order('created_at', { ascending: false });
        if (ordersError) {
            return res.status(500).json({ error: 'Gagal mengambil riwayat pesanan pelanggan' });
        }
        return res.status(200).json({
            message: 'Berhasil mengambil detail pelanggan',
            data: {
                ...customer,
                orders: orders || [],
            },
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};
// POST /api/v1/customers
export const createCustomer = async (req, res) => {
    try {
        const tenant_id = req.user?.tenant_id;
        const user_id = req.user?.user_id;
        if (!tenant_id || !user_id) {
            return res.status(401).json({ error: 'Unauthorized: Informasi user tidak lengkap' });
        }
        const { name, phone_number, profile_metadata } = req.body;
        // Pastikan nomor HP unik untuk tenant ini jika diberikan
        if (phone_number) {
            const { data: existing } = await supabase
                .from('customers')
                .select('id')
                .eq('tenant_id', tenant_id)
                .eq('phone_number', phone_number)
                .is('deleted_at', null)
                .single();
            if (existing) {
                return res.status(409).json({ error: 'Nomor telepon sudah terdaftar di sistem' });
            }
        }
        const insertData = {
            tenant_id,
            name,
            phone_number: phone_number || null,
            profile_metadata: profile_metadata || {},
            created_by: user_id,
            updated_by: user_id,
        };
        const { data, error } = await supabase
            .from('customers')
            .insert(insertData)
            .select()
            .single();
        if (error) {
            return res.status(500).json({ error: error.message || 'Gagal menambahkan pelanggan' });
        }
        return res.status(201).json({
            message: 'Berhasil menambahkan pelanggan baru',
            data,
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};
// DELETE /api/v1/customers/:id
export const deleteCustomer = async (req, res) => {
    try {
        const tenant_id = req.user?.tenant_id;
        const user_id = req.user?.user_id;
        const customer_id = req.params.id;
        if (!tenant_id || !user_id) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        // Soft delete: Update deleted_at dan deleted_by
        const updateData = {
            deleted_at: new Date().toISOString(),
            deleted_by: user_id,
        };
        const { data, error } = await supabase
            .from('customers')
            .update(updateData)
            .eq('id', customer_id)
            .eq('tenant_id', tenant_id)
            .is('deleted_at', null)
            .select()
            .single();
        if (error || !data) {
            return res.status(404).json({ error: 'Pelanggan tidak ditemukan atau sudah dihapus' });
        }
        return res.status(200).json({
            message: 'Berhasil menghapus pelanggan',
            data,
        });
    }
    catch (error) {
        return res.status(500).json({ error: error.message || 'Internal Server Error' });
    }
};
