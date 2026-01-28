/**
 * Database Migration Runner
 * Executes SQL migration files using node-pg
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function runMigration(migrationFile) {
    const client = new Client({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'kill_metraj',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD
    });

    try {
        console.log('Connecting to database...');
        await client.connect();
        console.log('✅ Connected to database');

        console.log(`\nReading migration file: ${migrationFile}`);
        // Use process.cwd() to resolve relative to where command is run
        const sqlPath = path.resolve(process.cwd(), migrationFile);
        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('Executing migration...\n');
        await client.query(sql);

        console.log('✅ Migration executed successfully!');
        console.log('\nVerifying migration...');

        // Verify table exists
        const tableCheck = await client.query(`
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'api_dashboard_cache'
            );
        `);

        if (tableCheck.rows[0].exists) {
            console.log('✅ Table api_dashboard_cache created');
        } else {
            console.error('❌ Table api_dashboard_cache not found');
        }

        // Verify trigger exists
        const triggerCheck = await client.query(`
            SELECT tgname 
            FROM pg_trigger 
            WHERE tgname = 'dashboard_update_trigger';
        `);

        if (triggerCheck.rows.length > 0) {
            console.log('✅ Trigger dashboard_update_trigger created');
        } else {
            console.error('❌ Trigger dashboard_update_trigger not found');
        }

        // Verify functions exist
        const functionsCheck = await client.query(`
            SELECT proname 
            FROM pg_proc 
            WHERE proname IN ('notify_dashboard_update', 'get_latest_dashboard_data', 'cleanup_old_dashboard_data');
        `);

        console.log(`✅ ${functionsCheck.rows.length}/3 functions created`);
        functionsCheck.rows.forEach(row => {
            console.log(`   - ${row.proname}`);
        });

        console.log('\n✅ Migration completed successfully!');

    } catch (error) {
        console.error('\n❌ Migration failed:');
        console.error(error.message);
        if (error.detail) {
            console.error('Detail:', error.detail);
        }
        process.exit(1);
    } finally {
        await client.end();
        console.log('\n✅ Database connection closed');
    }
}

// Run migration
const migrationFile = process.argv[2] || 'migrations/001_create_dashboard_cache.sql';
runMigration(migrationFile);
