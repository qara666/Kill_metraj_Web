const { sequelize } = require('../src/models');
const logger = require('../src/utils/logger');

async function addPerformanceIndexes() {
    try {
        console.log('--- Adding Performance Indexes ---');

        // Index for dashboard cache - critical for GetDashboardDataQuery
        console.log('Creating index on api_dashboard_cache (target_date, created_at)...');
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_dashboard_cache_date_created 
            ON api_dashboard_cache (target_date, created_at DESC);
        `);

        // Index for audit logs - critical for Admin Logs page
        console.log('Creating index on audit_logs (userId, timestamp)...');
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_audit_logs_user_time 
            ON audit_logs ("userId", timestamp DESC);
        `);

        // Index for user presets
        console.log('Creating index on user_presets (userId)...');
        await sequelize.query(`
            CREATE INDEX IF NOT EXISTS idx_user_presets_user_id 
            ON user_presets ("userId");
        `);

        console.log('--- Performance Indexes Created Successfully ---');
        process.exit(0);
    } catch (error) {
        console.error('Failed to create indexes:', error);
        process.exit(1);
    }
}

addPerformanceIndexes();
