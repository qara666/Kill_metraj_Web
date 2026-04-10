const { DashboardCache, Route } = require('./src/models');
const { sequelize } = require('./src/config/database');

async function debug() {
  try {
    const targetDate = '2026-04-07';
    console.log(`--- Checking Database for ${targetDate} ---`);

    const caches = await DashboardCache.findAll({
      where: { target_date: targetDate }
    });
    console.log(`\n[DashboardCache] Found ${caches.length} records:`);
    caches.forEach(c => {
      console.log(`- Division: ${c.division_id}, Orders: ${c.order_count}, Updated: ${c.updated_at}`);
    });

    const routes = await Route.findAll({
       where: sequelize.where(
         sequelize.literal("route_data->>'target_date'"),
         targetDate
       )
    });
    console.log(`\n[Route] Found ${routes.length} calculated routes:`);
    routes.forEach(r => {
      console.log(`- Division: ${r.division_id}, Courier: ${r.courier_id}, Orders: ${r.orders_count}`);
    });

    const divStates = global.divisionStatusStore || {};
    console.log(`\n[Global Status Store] content:`, JSON.stringify(divStates, null, 2));

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

debug();
