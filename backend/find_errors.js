const { Sequelize, DataTypes } = require('sequelize');
const sequelize = new Sequelize('postgres://msun:@localhost:5432/yapiko_auto_km');

const DashboardCache = sequelize.define('api_dashboard_cache', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    payload: { type: DataTypes.JSONB }
}, {
    tableName: 'api_dashboard_cache',
    timestamps: false
});

async function run() {
    try {
        const cache = await DashboardCache.findOne({ order: [['id', 'DESC']] });
        if (!cache || !cache.payload) {
            console.log("No cache found");
            return;
        }
        
        const data = cache.payload;
        const routes = data.routeStats || data.routes || [];
        const couriers = data.couriers || [];
        
        let allOrders = [];
        if (Array.isArray(data.activeOrders)) allOrders = data.activeOrders;
        
        if (allOrders.length === 0) {
            if (Array.isArray(couriers)) couriers.forEach(c => {
                if (Array.isArray(c.orders)) allOrders.push(...c.orders);
            });
            if (Array.isArray(routes)) routes.forEach(r => {
                if (Array.isArray(r.orders)) allOrders.push(...r.orders);
            });
            if (Array.isArray(data.uncalculatedOrders)) {
                allOrders.push(...data.uncalculatedOrders);
            }
        }

        const unique = {};
        allOrders.forEach(o => {
            const id = o.id || o.orderNumber;
            if (id) unique[id] = o;
        });

        const orders = Object.values(unique);
        console.log(`Total unique orders: ${orders.length}`);

        const errors = orders.filter(o => {
            const c = o.coords || (o.lat ? {lat: o.lat, lng: o.lng} : null);
            return !c || !c.lat || !c.lng || c.lat === 0 || c.lng === 0 || o.geoError === true || o.locationType === 'FAILED';
        });

        console.log(`Found ${errors.length} errors:`);
        errors.forEach(e => {
            console.log(`- #${e.orderNumber}: ${e.address}`);
        });

    } catch(e) {
        console.error(e);
    } finally {
        await sequelize.close();
    }
}
run();
