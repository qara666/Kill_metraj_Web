const { sequelize } = require('../config/database');
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
        if (process.env.NODE_ENV === 'development') {
            await sequelize.sync({ alter: true });
            console.log('✅ Database synced successfully');
        }
    } catch (error) {
        console.error('❌ Database sync error:', error);
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
