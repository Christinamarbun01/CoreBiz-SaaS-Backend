import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import supabase from '../config/supabase.js';

// Schema validasi query parameter
export const dashboardQuerySchema = z.object({
  period: z.enum(['7d', '30d', 'all'], {
    errorMap: () => ({ message: "Period harus '7d', '30d', atau 'all'" })
  }).default('7d')
});

export async function getProfitLoss(req: Request, res: Response, next: NextFunction): Promise<any> {
  try {
    const tenant_id = req.user?.tenant_id;
    if (!tenant_id) {
      return res.status(401).json({ error: 'Unauthorized: Tenant ID required' });
    }

    // 1. Validate query parameters
    const parsed = dashboardQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Bad Request',
        details: parsed.error.flatten().fieldErrors
      });
    }
    const { period } = parsed.data;

    // 2. Determine date ranges
    const now = new Date();
    let startDate: Date | null = null;
    
    if (period === '7d') {
      startDate = new Date();
      startDate.setDate(now.getDate() - 7);
    } else if (period === '30d') {
      startDate = new Date();
      startDate.setDate(now.getDate() - 30);
    } 
    // If 'all', we keep startDate as null (no lower bound filter)

    // 3. Execute queries in parallel
    const queries = [
      // Query for Revenue (Completed orders only)
      (() => {
        let q = supabase
          .from('orders')
          .select('created_at, total_amount')
          .eq('tenant_id', tenant_id)
          .eq('status', 'completed');
        if (startDate) {
          q = q.gte('created_at', startDate.toISOString());
        }
        return q;
      })(),

      // Query for COGS (Order Items for completed orders)
      (() => {
        let q = supabase
          .from('order_items')
          .select(`
            quantity,
            unit_cost,
            orders!inner (
              status,
              created_at
            )
          `)
          .eq('tenant_id', tenant_id)
          .eq('orders.status', 'completed');
        if (startDate) {
          q = q.gte('orders.created_at', startDate.toISOString());
        }
        return q;
      })()
    ];

    const [ordersResult, cogsResult] = await Promise.all(queries);

    if (ordersResult.error) throw ordersResult.error;
    if (cogsResult.error) throw cogsResult.error;

    const orders = ordersResult.data || [];
    const orderItems = cogsResult.data || [];

    // 4. Aggregations
    let totalRevenue = 0;
    let totalCogs = 0;

    // Map to aggregate daily revenue: { 'YYYY-MM-DD': number }
    const dailyRevenueMap: Record<string, number> = {};
    const getDayKey = (isoString: string) => isoString.split('T')[0];

    // Sum revenue & fill daily data
    for (const order of orders) {
      const amount = parseFloat(order.total_amount) || 0;
      totalRevenue += amount;

      const day = getDayKey(order.created_at);
      dailyRevenueMap[day] = (dailyRevenueMap[day] || 0) + amount;
    }

    // Sum COGS
    for (const item of orderItems) {
      const qty = parseFloat(item.quantity) || 0;
      const cost = parseFloat(item.unit_cost) || 0;
      totalCogs += (qty * cost);
    }

    const netProfit = totalRevenue - totalCogs;

    // 5. Format Chart Data
    // Sort days to present ordered data to chart
    const chartData = Object.keys(dailyRevenueMap)
      .sort()
      .map(date => ({
        date,
        revenue: dailyRevenueMap[date]
      }));

    // 6. Prepare Response consistent with frontend DashboardData
    const responsePayload = {
      revenue: totalRevenue,
      revenue_trend: 0, // Placeholder for trend logic (to be extended later if needed)
      cogs: totalCogs,
      cogs_trend: 0,
      net_profit: netProfit,
      net_profit_trend: 0,
      chart_data: chartData
    };

    return res.status(200).json(responsePayload);

  } catch (error: any) {
    console.error('[dashboardController] getProfitLoss error:', error);
    next(error);
  }
}
