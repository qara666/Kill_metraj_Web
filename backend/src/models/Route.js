const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Route = sequelize.define('Route', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    courier_id: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    division_id: {
        type: DataTypes.STRING(50),
        allowNull: true
    },
    total_distance: {
        type: DataTypes.DECIMAL(10, 2),
        defaultValue: 0
    },
    total_duration: {
        type: DataTypes.INTEGER, // in seconds
        defaultValue: 0
    },
    engine_used: {
        type: DataTypes.STRING(50),
        defaultValue: 'manual'
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    orders_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    calculated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    route_data: {
        type: DataTypes.JSONB,
        defaultValue: {}
    }
}, {
    tableName: 'calculated_routes',
    timestamps: true,
    underscored: true,
    indexes: [
        {
            unique: true,
            name: 'idx_calculated_routes_upsert',
            fields: [
                'division_id',
                'courier_id',
                sequelize.literal("(route_data->>'time_block')")
            ]
        },
        {
            name: 'idx_calculated_routes_date',
            using: 'gin',
            fields: [sequelize.literal("(route_data->>'target_date')")]
        },
        {
            name: 'idx_calculated_routes_timeblock',
            fields: [sequelize.literal("(route_data->>'time_block')")]
        }
    ]
});

module.exports = Route;
