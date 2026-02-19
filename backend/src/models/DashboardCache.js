const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * DashboardCache V2
 * 
 * Key change: UNIQUE(division_id, target_date) enables UPSERT pattern.
 * Only 1 row per division per day — no accumulation, no cleanup needed.
 */
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
    target_date: {
        type: DataTypes.DATEONLY,
        allowNull: true
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: true
    },
    // V2 columns
    updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: true
    },
    order_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    courier_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    fetch_etag: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'api_dashboard_cache',
    timestamps: false,
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
            name: 'idx_dashboard_cache_div_date',
            unique: true,
            fields: ['division_id', 'target_date']
        }
    ]
});

module.exports = DashboardCache;
