const { Pool } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function diagnose() {
    console.log('--- Dashboard Diagnostic Script ---');
    console.log(`Time: ${new Date().toISOString()}`);
    console.log(`Database Host: ${process.env.DB_HOST || 'localhost'}`);
    console.log(`Database Name: ${process.env.DB_NAME || 'kill_metraj'}`);
    console.log(`External API URL: ${process.env.DASHBOARD_API_URL || 'Not specified'}`);
    console.log('---------------------------------');

    const pool = new Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'kill_metraj',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD,
    });

    try {
        // 1. Check table existence
        console.log('1. Checking api_dashboard_cache table...');
        const tableCheck = await pool.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'api_dashboard_cache'
            );
        `);
        const exists = tableCheck.rows[0].exists;
        console.log(`   Table exists: ${exists}`);

        if (!exists) {
            console.error('CRITICAL: api_dashboard_cache table is missing!');
            return;
        }

        // 2. Check record count
        const countCheck = await pool.query('SELECT COUNT(*) FROM api_dashboard_cache');
        console.log(`2. Total records in cache: ${countCheck.rows[0].count}`);

        // 3. Check latest successful record
        const latestSuccess = await pool.query(`
            SELECT id, status_code, created_at, division_id, 
                   jsonb_pretty(payload->'orders'->0) as sample_order
            FROM api_dashboard_cache 
            WHERE status_code = 200 
            ORDER BY created_at DESC 
            LIMIT 1
        `);

        if (latestSuccess.rows.length > 0) {
            const row = latestSuccess.rows[0];
            console.log('3. Latest successful sync:');
            console.log(`   ID: ${row.id}`);
            console.log(`   Status: ${row.status_code}`);
            console.log(`   Time: ${row.created_at}`);
            console.log(`   Division: ${row.division_id}`);
            // Sample order is too much for logs, just check if payload exists
            const payloadCheck = await pool.query('SELECT payload IS NOT NULL as has_payload FROM api_dashboard_cache WHERE id = $1', [row.id]);
            console.log(`   Has Payload: ${payloadCheck.rows[0].has_payload}`);
        } else {
            console.warn('3. No successful sync records found in cache.');
        }

        // 4. Check latest error record
        const latestError = await pool.query(`
            SELECT id, status_code, created_at, division_id, payload
            FROM api_dashboard_cache 
            WHERE status_code >= 400 
            ORDER BY created_at DESC 
            LIMIT 1
        `);

        if (latestError.rows.length > 0) {
            const row = latestError.rows[0];
            console.log('4. Latest error recorded:');
            console.log(`   ID: ${row.id}`);
            console.log(`   Status: ${row.status_code}`);
            console.log(`   Time: ${row.created_at}`);
            console.log(`   Error data: ${JSON.stringify(row.payload)}`);
        }

        // 5. Check if worker might be stuck
        const lastRecord = await pool.query('SELECT created_at FROM api_dashboard_cache ORDER BY created_at DESC LIMIT 1');
        if (lastRecord.rows.length > 0) {
            const lastTime = new Date(lastRecord.rows[0].created_at);
            const diffMin = (new Date() - lastTime) / (1000 * 60);
            console.log(`5. Time since last sync attempt: ${diffMin.toFixed(1)} minutes`);
            if (diffMin > 30) {
                console.warn('   WARNING: No sync attempts in the last 30 minutes. Is the worker running?');
            }
        }

    } catch (error) {
        console.error('Diagnostic failed:', error.message);
    } finally {
        await pool.end();
    }
}

diagnose();
