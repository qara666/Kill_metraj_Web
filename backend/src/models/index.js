const { sequelize } = require('../config/database');
const { DataTypes } = require('sequelize');
const logger = require('../utils/logger');
const User = require('./User');
const UserPreset = require('./UserPreset');
const AuditLog = require('./AuditLog');
const DashboardState = require('./DashboardState');
const DashboardCache = require('./DashboardCache');
const KmlHub = require('./KmlHub');
const KmlZone = require('./KmlZone');
const Route = require('./Route');
const GeoCache = require('./GeoCache');
const DashboardDivisionState = require('./DashboardDivisionState')(sequelize, DataTypes);

// Define associations
User.hasOne(UserPreset, {
    foreignKey: 'userId',
    as: 'preset',
    onDelete: 'CASCADE'
});

User.hasOne(DashboardState, {
    foreignKey: 'userId',
    as: 'dashboardState',
    onDelete: 'CASCADE'
});

UserPreset.belongsTo(User, {
    foreignKey: 'userId',
    as: 'user'
});

UserPreset.belongsTo(User, {
    foreignKey: 'updatedBy',
    as: 'updater'
});

DashboardState.belongsTo(User, {
    foreignKey: 'userId',
    as: 'user'
});

User.hasMany(AuditLog, {
    foreignKey: 'userId',
    as: 'logs',
    onDelete: 'CASCADE'
});

AuditLog.belongsTo(User, {
    foreignKey: 'userId',
    as: 'user'
});

// KML Associations
KmlHub.hasMany(KmlZone, {
    foreignKey: 'hub_id',
    as: 'zones',
    onDelete: 'CASCADE'
});

KmlZone.belongsTo(KmlHub, {
    foreignKey: 'hub_id',
    as: 'hub'
});

// Sync database (only in development)
async function syncDatabase() {
    try {
        const isDev = process.env.NODE_ENV === 'development';
        const forceAlter = process.env.DB_ALTER_SYNC === 'true';

        // Run sync in production for initial setup or if explicitly requested
        // v38.0: DISABLED alter: true because it hangs on RLS policy conflicts
        const syncOptions = { alter: false };

        logger.info(`Синхронизация базы данных (alter: ${syncOptions.alter})...`);
        await sequelize.sync(syncOptions);
        
        // v39.0: Manual Migration Guard for centroid column
        try {
            const [results] = await sequelize.query(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'api_kml_zones' AND column_name = 'centroid';
            `);
            if (results.length === 0) {
                logger.info('Migration: Adding missing "centroid" column to api_kml_zones...');
                await sequelize.query('ALTER TABLE api_kml_zones ADD COLUMN centroid JSONB DEFAULT NULL;');
            }
        } catch (migErr) {
            logger.warn('Migration Guard failed (ignoring):', { error: migErr.message });
        }

        logger.info('Синхронизация базы данных выполнена успешно');
    } catch (error) {
        logger.error('Ошибка синхронизации базы данных', { error: error.message });
    }
}

module.exports = {
    sequelize,
    User,
    UserPreset,
    AuditLog,
    DashboardState,
    DashboardDivisionState,
    DashboardCache,
    KmlHub,
    KmlZone,
    Route,
    GeoCache,
    syncDatabase
};
