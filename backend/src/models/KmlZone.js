const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * KmlZone Model
 * Хранит отдельные полигоны (сектора) внутри хаба.
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
    // GeoJSON или массив пути, хранящийся как JSONB
    boundary: {
        type: DataTypes.JSONB,
        allowNull: false
    },
    // Границы для быстрой проверки пересечений
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
