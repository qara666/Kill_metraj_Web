const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

/**
 * KmlHub Model
 * Groups individual KML zones/polygons.
 */
const KmlHub = sequelize.define('KmlHub', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.TEXT,
        allowNull: false,
        unique: true
    },
    source_url: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    },
    last_sync_at: {
        type: DataTypes.DATE,
        allowNull: true
    },
    created_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    updated_at: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'api_kml_hubs',
    timestamps: false
});

module.exports = KmlHub;
