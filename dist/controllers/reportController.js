import supabase from '../config/supabase.js';
export async function getPnlReport(req, res, next) {
    try {
        const tenant_id = req.user?.tenant_id;
        if (!tenant_id) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        // Determine start_date and end_date
        const today = new Date();
        let startDateStr = req.query.start_date;
        let endDateStr = req.query.end_date;
        if (!startDateStr) {
            const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
            startDateStr = firstDay.toISOString();
        }
        else {
            const sd = new Date(startDateStr);
            if (isNaN(sd.getTime())) {
                return res.status(400).json({ error: 'Format start_date tidak valid' });
            }
            startDateStr = sd.toISOString();
        }
        if (!endDateStr) {
            endDateStr = today.toISOString();
        }
        else {
            const ed = new Date(endDateStr);
            if (isNaN(ed.getTime())) {
                return res.status(400).json({ error: 'Format end_date tidak valid' });
            }
            endDateStr = ed.toISOString();
        }
        // Run queries in parallel
        const [ordersResult, expensesResult, orderItemsResult] = await Promise.all([
            // 1. Orders for Revenue
            supabase
                .from('orders')
                .select('created_at, total_amount')
                .eq('tenant_id', tenant_id)
                .eq('status', 'completed')
                .gte('created_at', startDateStr)
                .lte('created_at', endDateStr),
            // 2. Expenses for Expense
            supabase
                .from('expenses')
                .select('created_at, amount')
                .eq('tenant_id', tenant_id)
                .gte('created_at', startDateStr)
                .lte('created_at', endDateStr),
            // 3. Order Items for COGS (via completed orders)
            supabase
                .from('order_items')
                .select(`
          quantity,
          unit_cost,
          orders!inner (
            status,
            tenant_id,
            created_at
          )
        `)
                .eq('tenant_id', tenant_id)
                .eq('orders.status', 'completed')
                .gte('orders.created_at', startDateStr)
                .lte('orders.created_at', endDateStr)
        ]);
        if (ordersResult.error)
            throw ordersResult.error;
        if (expensesResult.error)
            throw expensesResult.error;
        if (orderItemsResult.error)
            throw orderItemsResult.error;
        const orders = ordersResult.data || [];
        const expenses = expensesResult.data || [];
        const orderItems = orderItemsResult.data || [];
        // Aggregation
        let totalRevenue = 0;
        let totalExpense = 0;
        let totalCogs = 0;
        // Daily aggregation structure: { 'YYYY-MM-DD': { revenue: 0, expense: 0, cogs: 0 } }
        const dailyData = {};
        const getDayKey = (isoString) => isoString.split('T')[0];
        // Process Orders
        for (const order of orders) {
            const amount = order.total_amount || 0;
            totalRevenue += amount;
            const day = getDayKey(order.created_at);
            if (!dailyData[day])
                dailyData[day] = { revenue: 0, expense: 0, cogs: 0 };
            dailyData[day].revenue += amount;
        }
        // Process Expenses
        for (const expense of expenses) {
            const amount = expense.amount || 0;
            totalExpense += amount;
            const day = getDayKey(expense.created_at);
            if (!dailyData[day])
                dailyData[day] = { revenue: 0, expense: 0, cogs: 0 };
            dailyData[day].expense += amount;
        }
        // Process COGS
        for (const item of orderItems) {
            const orderCreatedAt = item.orders.created_at;
            const cogs = (item.quantity || 0) * (item.unit_cost || 0);
            totalCogs += cogs;
            const day = getDayKey(orderCreatedAt);
            if (!dailyData[day])
                dailyData[day] = { revenue: 0, expense: 0, cogs: 0 };
            dailyData[day].cogs += cogs;
        }
        const netProfit = totalRevenue - totalCogs - totalExpense;
        // Format daily data for charts
        const chartData = Object.keys(dailyData).sort().map(date => {
            const d = dailyData[date];
            return {
                date,
                revenue: d.revenue,
                expense: d.expense,
                cogs: d.cogs,
                net_profit: d.revenue - d.cogs - d.expense
            };
        });
        return res.status(200).json({
            success: true,
            message: 'Berhasil mengambil Laporan Laba/Rugi (P&L)',
            data: {
                period: {
                    start_date: startDateStr,
                    end_date: endDateStr
                },
                summary: {
                    total_revenue: totalRevenue,
                    total_cogs: totalCogs,
                    total_expense: totalExpense,
                    net_profit: netProfit
                },
                daily_breakdown: chartData
            }
        });
    }
    catch (error) {
        console.error('[reportController] getPnlReport error:', error);
        next(error);
    }
}
