const { Pool } = require('pg');
require('dotenv').config({ path: 'backend/.env' });

const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'kill_metraj',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
});

async function verify() {
    try {
        console.log('--- История статусов ---');
        const history = await pool.query('SELECT * FROM api_dashboard_status_history ORDER BY changed_at DESC LIMIT 5');
        console.table(history.rows);

        console.log('\n--- Последние замеры кэша ---');
        const cache = await pool.query("SELECT payload->'orders'->0->'orderNumber' as order, payload->'orders'->0->'status' as status, payload->'orders'->0->'statusTimings' as timings FROM api_dashboard_cache WHERE status_code = 200 ORDER BY created_at DESC LIMIT 1");
        console.log(JSON.stringify(cache.rows[0], null, 2));

        const cache2 = await pool.query("SELECT payload->'orders'->1->'orderNumber' as order, payload->'orders'->1->'status' as status, payload->'orders'->1->'statusTimings' as timings FROM api_dashboard_cache WHERE status_code = 200 ORDER BY created_at DESC LIMIT 1");
        console.log(JSON.stringify(cache2.rows[0], null, 2));

    } catch (err) {
        console.error(err);
    } finally {
        await pool.end();
    }
}

verify();
