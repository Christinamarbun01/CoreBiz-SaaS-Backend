import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { faker } from '@faker-js/faker';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

// Initialize Supabase client with the Service Role Key to bypass RLS
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function cleanDatabase() {
  console.log('🧹 Cleaning existing data...');
  
  // Order matters due to foreign key constraints (delete children first)
  const tables = [
    'expenses',
    'payments',
    'order_items',
    'orders',
    'shifts',
    'inventory_logs',
    'recipes',
    'products',
    'categories',
    'customers',
    'tenant_users',
    'tenants',
    'users'
  ];

  for (const table of tables) {
    const { error } = await supabase
      .from(table)
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows
    
    if (error) {
      console.warn(`   ⚠️ Note: Could not clean table ${table}: ${error.message}`);
    } else {
      console.log(`   ✅ Cleaned table: ${table}`);
    }
  }
}

async function seed() {
  console.log('🚀 Starting database seeding...');
  
  await cleanDatabase();

  try {
    // ==============================================================================
    // 1. GENERATE USERS & TENANTS
    // ==============================================================================
    console.log('\n⏳ Seeding Users & Tenants...');

    // Generate Users
    const users = Array.from({ length: 6 }).map(() => ({
      id: faker.string.uuid(),
      email: faker.internet.email(),
      full_name: faker.person.fullName(),
    }));
    await supabase.from('users').upsert(users);

    // Generate Tenants
    const tenants = [
      { id: faker.string.uuid(), name: 'CoreBiz Digital Store', is_active: true },
      { id: faker.string.uuid(), name: 'SaaS Coffee & Co', is_active: true },
    ];
    await supabase.from('tenants').upsert(tenants);
    console.log('✅ Users and Tenants seeded');

    // Link Users to Tenants (Tenant Users)
    const tenantUsers = [];
    let userIndex = 0;
    for (const tenant of tenants) {
      // Assign 3 users per tenant (1 owner, 1 manager, 1 staff)
      const roles = ['owner', 'manager', 'staff'];
      for (const role of roles) {
        tenantUsers.push({
          id: faker.string.uuid(),
          user_id: users[userIndex].id,
          tenant_id: tenant.id,
          role: role,
          is_active: true,
        });
        userIndex++;
      }
    }
    await supabase.from('tenant_users').upsert(tenantUsers);
    console.log('✅ Tenant Users seeded');

    // ==============================================================================
    // SEEDING PER TENANT
    // ==============================================================================
    for (const tenant of tenants) {
      const tenantId = tenant.id;
      const tenantStaff = tenantUsers.filter(tu => tu.tenant_id === tenantId);
      console.log(`\n📦 Seeding data for tenant: ${tenant.name}`);

      // 2. Customers
      const customers = Array.from({ length: 100 }).map(() => ({
        id: faker.string.uuid(),
        tenant_id: tenantId,
        phone_number: faker.phone.number({ style: 'international' }),
        name: faker.person.fullName(),
        profile_metadata: faker.datatype.boolean() ? { loyalty_points: faker.number.int({ min: 0, max: 1000 }) } : {},
        total_orders: 0, // Will be updated or just left as dummy
      }));
      await supabase.from('customers').insert(customers);
      console.log(`   ✅ ${customers.length} customers seeded`);

      // 3. Categories & Products
      const categories = Array.from({ length: 5 }).map(() => ({
        id: faker.string.uuid(),
        tenant_id: tenantId,
        name: faker.commerce.department(),
      }));
      await supabase.from('categories').insert(categories);

      const products = Array.from({ length: 50 }).map(() => {
        const isComponent = faker.datatype.boolean({ probability: 0.1 });
        const cost = Math.floor(parseFloat(faker.commerce.price({ min: 5000, max: 50000 })));
        return {
          id: faker.string.uuid(),
          tenant_id: tenantId,
          category_id: faker.helpers.arrayElement(categories).id,
          type: isComponent ? 'component' : faker.helpers.arrayElement(['sellable', 'both']),
          is_stock_tracked: true,
          sku: faker.string.alphanumeric(8).toUpperCase(),
          name: faker.commerce.productName(),
          price: isComponent ? 0 : cost + Math.floor(parseFloat(faker.commerce.price({ min: 5000, max: 50000 }))),
          cost: cost,
          current_stock: faker.number.int({ min: 20, max: 200 }),
          min_stock_alert: faker.number.int({ min: 5, max: 15 }),
        };
      });
      await supabase.from('products').insert(products);
      
      const sellableProducts = products.filter(p => p.type !== 'component');
      console.log(`   ✅ ${categories.length} categories and ${products.length} products seeded`);

      // 4. Shifts
      // We need shifts for orders, payments, and expenses
      const shifts = Array.from({ length: 10 }).map(() => {
        const staff = faker.helpers.arrayElement(tenantStaff);
        return {
          id: faker.string.uuid(),
          tenant_id: tenantId,
          user_id: staff.user_id,
          opening_balance: 500000,
          closing_balance: faker.datatype.boolean() ? faker.number.int({ min: 500000, max: 2000000 }) : null,
          status: faker.helpers.arrayElement(['open', 'closed']),
          opened_at: faker.date.recent({ days: 30 }).toISOString(),
        };
      });
      await supabase.from('shifts').insert(shifts);
      console.log(`   ✅ ${shifts.length} shifts seeded`);

      // 5. Orders, Order Items, Payments
      console.log(`   ⏳ Generating 500 orders...`);
      const ordersData: any[] = [];
      const orderItemsData: any[] = [];
      const paymentsData: any[] = [];

      for (let i = 0; i < 500; i++) {
        const orderId = faker.string.uuid();
        const customer = faker.helpers.arrayElement(customers);
        const shift = faker.helpers.arrayElement(shifts);
        const orderDate = faker.date.recent({ days: 90 });
        const status = faker.helpers.arrayElement(['completed', 'completed', 'draft', 'processing', 'cancelled']);
        const paymentStatus = status === 'completed' ? 'paid' : faker.helpers.arrayElement(['unpaid', 'paid']);
        
        const numItems = faker.number.int({ min: 1, max: 5 });
        const selectedProducts = faker.helpers.arrayElements(sellableProducts, numItems);
        
        let subtotalAmount = 0;
        
        const items = selectedProducts.map(p => {
          const qty = faker.number.int({ min: 1, max: 3 });
          const itemSubtotal = p.price * qty;
          subtotalAmount += itemSubtotal;
          
          return {
            id: faker.string.uuid(),
            tenant_id: tenantId,
            order_id: orderId,
            product_id: p.id,
            quantity: qty,
            unit_price: p.price,
            unit_cost: p.cost,
            subtotal: itemSubtotal,
          };
        });

        const discountAmount = faker.datatype.boolean({ probability: 0.2 }) ? faker.number.int({ min: 1000, max: 10000 }) : 0;
        const totalAmount = Math.max(0, subtotalAmount - discountAmount);

        ordersData.push({
          id: orderId,
          tenant_id: tenantId,
          customer_id: customer.id,
          shift_id: shift.id,
          source: faker.helpers.arrayElement(['pos', 'whatsapp']),
          status: status,
          payment_status: paymentStatus,
          subtotal_amount: subtotalAmount,
          discount_amount: discountAmount,
          total_amount: totalAmount,
          created_at: orderDate.toISOString(),
          created_by: shift.user_id,
        });

        orderItemsData.push(...items);

        if (paymentStatus === 'paid') {
          paymentsData.push({
            id: faker.string.uuid(),
            tenant_id: tenantId,
            order_id: orderId,
            shift_id: shift.id,
            method: faker.helpers.arrayElement(['cash', 'qris', 'transfer']),
            amount: totalAmount,
          });
        }
      }

      // Batch insert Orders
      const orderChunkSize = 250;
      for (let i = 0; i < ordersData.length; i += orderChunkSize) {
        const { error } = await supabase.from('orders').insert(ordersData.slice(i, i + orderChunkSize));
        if (error) console.error('Error orders:', error.message);
      }

      // Batch insert Order Items
      const itemChunkSize = 250;
      for (let i = 0; i < orderItemsData.length; i += itemChunkSize) {
        const { error } = await supabase.from('order_items').insert(orderItemsData.slice(i, i + itemChunkSize));
        if (error) console.error('Error order_items:', error.message);
      }

      // Batch insert Payments
      const paymentChunkSize = 250;
      for (let i = 0; i < paymentsData.length; i += paymentChunkSize) {
        const { error } = await supabase.from('payments').insert(paymentsData.slice(i, i + paymentChunkSize));
        if (error) console.error('Error payments:', error.message);
      }
      
      console.log(`   ✅ 500 orders, ${orderItemsData.length} items, and ${paymentsData.length} payments seeded`);

      // 6. Expenses
      const expenses = Array.from({ length: 30 }).map(() => {
        const shift = faker.helpers.arrayElement(shifts);
        return {
          id: faker.string.uuid(),
          tenant_id: tenantId,
          shift_id: shift.id,
          category: faker.helpers.arrayElement(['Operational', 'Supplies', 'Maintenance', 'Other']),
          description: faker.lorem.sentence(),
          amount: Math.floor(parseFloat(faker.commerce.price({ min: 10000, max: 500000 }))),
          created_by: shift.user_id,
        };
      });

      await supabase.from('expenses').insert(expenses);
      console.log(`   ✅ ${expenses.length} expenses seeded`);
    }

    console.log('\n✨ Seeding completed successfully!');
  } catch (err) {
    console.error('❌ Seeding failed with exception:', err);
  }
}

seed().catch(err => {
  console.error('❌ Unhandled promise rejection during seeding:', err);
  process.exit(1);
});
