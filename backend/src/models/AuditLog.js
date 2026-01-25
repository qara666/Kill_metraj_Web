const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const AuditLog = sequelize.define('AuditLog', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: 'users',
            key: 'id'
        },
        onDelete: 'CASCADE'
    },
    username: {
        type: DataTypes.STRING(50),
        allowNull: false
    },
    action: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    details: {
        type: DataTypes.JSONB,
        defaultValue: {},
        allowNull: false
    },
    ipAddress: {
        type: DataTypes.STRING(45),
        allowNull: false
    },
    userAgent: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    timestamp: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
        allowNull: false
    }
}, {
    tableName: 'audit_logs',
    timestamps: false,
    indexes: [
        {
            fields: ['userId', 'timestamp']
        },
        {
            fields: ['action', 'timestamp']
        },
        {
            fields: ['timestamp']
        }
    ]
});

module.exports = AuditLog;
