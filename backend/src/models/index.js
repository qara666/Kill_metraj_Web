const { sequelize } = require('../config/database');
const logger = require('../utils/logger');
const User = require('./User');
const UserPreset = require('./UserPreset');
const AuditLog = require('./AuditLog');
const DashboardState = require('./DashboardState');

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

// Sync database (only in development)
async function syncDatabase() {
    try {
        const isDev = process.env.NODE_ENV === 'development';
        // Run sync in production for initial setup
        await sequelize.sync({ alter: isDev });
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
    syncDatabase
};
