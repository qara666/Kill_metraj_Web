const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DashboardCache = sequelize.define('DashboardCache', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    payload: {
        type: DataTypes.JSONB,
        allowNull: false
    },
    data_hash: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    status_code: {
        type: DataTypes.INTEGER,
        defaultValue: 200
    },
    error_message: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    division_id: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: true
    },
    target_date: {
        type: DataTypes.DATEONLY,
        allowNull: true
    }
}, {
    tableName: 'api_dashboard_cache', // Explicit table name to match legacy SQL
    timestamps: false, // We use created_at manually
    indexes: [
        {
            name: 'idx_dashboard_cache_created_at',
            fields: [{ name: 'created_at', order: 'DESC' }]
        },
        {
            name: 'idx_dashboard_cache_hash',
            fields: ['data_hash']
        },
        {
            name: 'idx_dashboard_cache_target_date',
            fields: ['target_date']
        }
    ]
});

module.exports = DashboardCache;
