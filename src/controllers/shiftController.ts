import { Request, Response } from 'express';
import { z } from 'zod';
import supabase from '../config/supabase.js';

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

export const openShiftSchema = z.object({
  opening_balance: z
    .number({ required_error: 'opening_balance wajib diisi' })
    .min(0, 'opening_balance tidak boleh negatif')
    .finite('opening_balance harus berupa angka valid'),
});

export const closeShiftSchema = z.object({
  closing_balance: z
    .number({ required_error: 'closing_balance wajib diisi' })
    .min(0, 'closing_balance tidak boleh negatif')
    .finite('closing_balance harus berupa angka valid'),
});

// ---------------------------------------------------------------------------
// POST /api/v1/shifts — Buka Shift
// ---------------------------------------------------------------------------
export const openShift = async (req: Request, res: Response): Promise<any> => {
  try {
    const tenant_id = req.user?.tenant_id;
    const user_id = req.user?.user_id;

    if (!tenant_id || !user_id) {
      return res.status(401).json({ error: 'Unauthorized: Informasi user tidak lengkap' });
    }

    const { opening_balance } = req.body as z.infer<typeof openShiftSchema>;

    // ── Guard: Cek apakah user masih punya shift yang 'open' ──
    const { data: existingShift, error: checkError } = await supabase
      .from('shifts')
      .select('id')
      .eq('user_id', user_id)
      .eq('tenant_id', tenant_id)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (checkError) throw checkError;

    if (existingShift) {
      return res.status(409).json({
        error: 'Anda masih memiliki shift yang aktif. Tutup shift sebelumnya terlebih dahulu.',
        active_shift_id: existingShift.id,
      });
    }

    // ── Insert shift baru ──
    const { data: shift, error: insertError } = await supabase
      .from('shifts')
      .insert({
        tenant_id,
        user_id,
        opening_balance,
        status: 'open',
        opened_at: new Date().toISOString(),
      })
      .select()
      .maybeSingle();

    if (insertError) throw insertError;
    if (!shift) throw new Error('Gagal membuat shift (no data returned)');

    return res.status(201).json({
      message: 'Shift berhasil dibuka. Selamat bekerja!',
      data: shift,
    });
  } catch (error: any) {
    console.error('[ShiftController] openShift error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
};

// ---------------------------------------------------------------------------
// GET /api/v1/shifts/active — Ambil shift aktif user
// ---------------------------------------------------------------------------
export const getActiveShift = async (req: Request, res: Response): Promise<any> => {
  try {
    const tenant_id = req.user?.tenant_id;
    const user_id = req.user?.user_id;

    if (!tenant_id || !user_id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data: shift, error } = await supabase
      .from('shifts')
      .select('*')
      .eq('user_id', user_id)
      .eq('tenant_id', tenant_id)
      .eq('status', 'open')
      .order('opened_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    return res.status(200).json({
      message: shift ? 'Shift aktif ditemukan' : 'Tidak ada shift aktif',
      data: shift || null,
    });
  } catch (error: any) {
    console.error('[ShiftController] getActiveShift error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
};

// ---------------------------------------------------------------------------
// PATCH /api/v1/shifts/:id/close — Tutup Shift + Audit Laci
// ---------------------------------------------------------------------------
export const closeShift = async (req: Request, res: Response): Promise<any> => {
  try {
    const tenant_id = req.user?.tenant_id;
    const user_id = req.user?.user_id;
    const shift_id = req.params.id;

    if (!tenant_id || !user_id) {
      return res.status(401).json({ error: 'Unauthorized: Informasi user tidak lengkap' });
    }

    const { closing_balance } = req.body as z.infer<typeof closeShiftSchema>;

    // ── 1. Ambil data shift (pastikan milik user & masih open) ──
    const { data: shift, error: shiftError } = await supabase
      .from('shifts')
      .select('id, opening_balance, status, user_id')
      .eq('id', shift_id)
      .eq('tenant_id', tenant_id)
      .maybeSingle();

    if (shiftError) throw shiftError;
    
    if (!shift) {
      return res.status(404).json({ error: 'Shift tidak ditemukan atau Anda tidak memiliki akses' });
    }

    if (shift.status === 'closed') {
      return res.status(400).json({ error: 'Shift ini sudah ditutup sebelumnya' });
    }

    if (shift.user_id !== user_id) {
      return res.status(403).json({ error: 'Anda tidak berhak menutup shift milik user lain' });
    }

    // ── 2. Query SUM: Total pembayaran tunai di shift ini ──
    const { data: cashPayments, error: cashError } = await supabase
      .from('payments')
      .select('amount')
      .eq('shift_id', shift_id)
      .eq('tenant_id', tenant_id)
      .eq('method', 'cash');

    if (cashError) throw cashError;

    const total_cash_payments = (cashPayments || []).reduce(
      (sum: number, p: { amount: number }) => sum + (p.amount || 0),
      0,
    );

    // ── 3. Query SUM: Total pengeluaran di shift ini ──
    const { data: expenses, error: expenseError } = await supabase
      .from('expenses')
      .select('amount')
      .eq('shift_id', shift_id)
      .eq('tenant_id', tenant_id);

    if (expenseError) throw expenseError;

    const total_expenses = (expenses || []).reduce(
      (sum: number, e: { amount: number }) => sum + (e.amount || 0),
      0,
    );

    // ── 4. Komputasi Audit Laci ──
    const expected_cash = shift.opening_balance + total_cash_payments - total_expenses;
    const difference = closing_balance - expected_cash;

    // ── 5. Update shift: tutup & simpan closing data ──
    const { data: updatedShift, error: updateError } = await supabase
      .from('shifts')
      .update({
        closing_balance,
        status: 'closed',
        closed_at: new Date().toISOString(),
        updated_by: user_id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', shift_id)
      .eq('tenant_id', tenant_id)
      .select()
      .maybeSingle();

    if (updateError) throw updateError;
    if (!updatedShift) throw new Error('Gagal memperbarui data shift');

    return res.status(200).json({
      message: 'Shift berhasil ditutup. Berikut laporan audit laci.',
      data: updatedShift,
      audit: {
        opening_balance: shift.opening_balance,
        total_cash_payments,
        total_expenses,
        expected_cash,
        closing_balance,
        difference,
        status: difference === 0
          ? 'BALANCE — Laci seimbang ✅'
          : difference > 0
            ? `SURPLUS — Kelebihan ${difference} di laci 📈`
            : `DEFICIT — Selisih kurang ${Math.abs(difference)} di laci ⚠️`,
      },
    });
  } catch (error: any) {
    console.error('[ShiftController] closeShift error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
};
