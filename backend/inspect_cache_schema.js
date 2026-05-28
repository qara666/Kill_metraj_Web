const { sequelize } = require('./src/config/database');

async function inspectTable() {
    try {
        await sequelize.authenticate();
        const [results] = await sequelize.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'api_dashboard_cache'");
        console.log('--- TABLE SCHEMA: api_dashboard_cache ---');
        results.forEach(c => console.log(`${c.column_name}: ${c.data_type}`));
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
inspectTable();
