const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * KmlZone Model
 * Stores individual polygons (sectors) within a hub.
 */
const KmlZone = sequelize.define('KmlZone', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    hub_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'api_kml_hubs',
            key: 'id'
        }
    },
    name: {
        type: DataTypes.TEXT,
        allowNull: false
    },
    // GeoJSON or path array stored as JSONB
    boundary: {
        type: DataTypes.JSONB,
        allowNull: false
    },
    // Bounds for fast intersection checks
    bounds: {
        type: DataTypes.JSONB,
        allowNull: true
    },
    centroid: {
        type: DataTypes.JSONB,
        allowNull: true
    },
    is_technical: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'api_kml_zones',
    timestamps: false,
    indexes: [
        {
            fields: ['hub_id']
        },
        {
            fields: ['name']
        }
    ]
});

module.exports = KmlZone;
