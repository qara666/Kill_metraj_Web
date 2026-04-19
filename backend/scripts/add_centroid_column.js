const { sequelize } = require('../src/config/database');
const logger = require('../src/utils/logger');

async function migrate() {
    try {
        console.log('--- Starting Migration: Add centroid to api_kml_zones ---');
        
        // 1. Check if column exists
        const [results] = await sequelize.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'api_kml_zones' AND column_name = 'centroid';
        `);

        if (results.length > 0) {
            console.log('Column "centroid" already exists. Skipping.');
        } else {
            console.log('Column "centroid" missing. Adding...');
            await sequelize.query('ALTER TABLE api_kml_zones ADD COLUMN centroid JSONB DEFAULT NULL;');
            console.log('Column "centroid" added successfully.');
        }

        console.log('--- Migration Complete ---');
        process.exit(0);
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
