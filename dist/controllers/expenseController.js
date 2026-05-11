import { z } from 'zod';
import supabase from '../config/supabase.js';
export const createExpenseSchema = z.object({
    category: z.string().min(1, 'Category wajib diisi'),
    description: z.string().max(500, 'Deskripsi maksimal 500 karakter').optional(),
    amount: z.number().min(1, 'Amount harus lebih dari 0'),
});
export async function createExpense(req, res, next) {
    try {
        const { category, description, amount } = req.body;
        const tenant_id = req.user?.tenant_id;
        const user_id = req.user?.user_id;
        if (!tenant_id || !user_id) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        // Guard Shift Aktif
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
            return res.status(400).json({ error: 'Tidak bisa mencatat pengeluaran. Anda harus membuka kasir (Shift) terlebih dahulu.' });
        }
        const { data: newExpense, error: insertError } = await supabase
            .from('expenses')
            .insert({
            tenant_id,
            shift_id: activeShift.id,
            category,
            description,
            amount,
            created_by: user_id,
        })
            .select()
            .maybeSingle();
        if (insertError)
            throw insertError;
        return res.status(201).json({
            message: 'Pengeluaran berhasil dicatat',
            data: newExpense,
        });
    }
    catch (error) {
        next(error);
    }
}
export async function getExpenses(req, res, next) {
    try {
        const tenant_id = req.user?.tenant_id;
        if (!tenant_id) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { shift_id } = req.query;
        let query = supabase
            .from('expenses')
            .select('*')
            .eq('tenant_id', tenant_id)
            .order('created_at', { ascending: false });
        if (shift_id) {
            query = query.eq('shift_id', shift_id);
        }
        const { data: expenses, error } = await query;
        if (error)
            throw error;
        return res.status(200).json({
            data: expenses,
        });
    }
    catch (error) {
        next(error);
    }
}
