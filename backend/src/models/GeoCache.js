const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * GeoCache Model
 * 
 * Stores geocoding results centrally so all courier managers share the same cache.
 * Uses address_key as unique index to allow UPSERT operations.
 */
const GeoCache = sequelize.define('GeoCache', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    address_key: {
        type: DataTypes.TEXT,
        allowNull: false,
        unique: true
    },
    lat: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    lng: {
        type: DataTypes.FLOAT,
        allowNull: true
    },
    formatted_address: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    location_type: {
        type: DataTypes.TEXT, // 'ROOFTOP', 'RANGE_INTERPOLATED', etc.
        allowNull: true
    },
    place_id: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    types: {
        type: DataTypes.ARRAY(DataTypes.TEXT), // array of strings like ['street_address']
        allowNull: true
    },
    is_success: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    error_message: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    hit_count: {
        type: DataTypes.INTEGER,
        defaultValue: 0
    },
    expires_at: {
        type: DataTypes.DATE,
        allowNull: false
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: true
    },
    updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: true
    }
}, {
    tableName: 'api_geo_cache',
    timestamps: false,
    indexes: [
        {
            name: 'idx_geocache_address_key',
            unique: true,
            fields: ['address_key']
        },
        {
            name: 'idx_geocache_expires_at',
            fields: ['expires_at']
        }
    ]
});

module.exports = GeoCache;
