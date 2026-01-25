const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DashboardState = sequelize.define('DashboardState', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false
        // ForeignKey defined in index.js
    },
    data: {
        type: DataTypes.JSONB,
        defaultValue: {},
        allowNull: false
    },
    lastSavedAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'dashboard_states',
    timestamps: true,
    indexes: [
        {
            unique: true,
            fields: ['userId']
        }
    ]
});

module.exports = DashboardState;
