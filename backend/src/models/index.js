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
        const syncOptions = { alter: isDev || forceAlter };

        logger.info(`Синхронизация базы данных (alter: ${syncOptions.alter})...`);
        await sequelize.sync(syncOptions);
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
