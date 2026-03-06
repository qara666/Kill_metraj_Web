const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const UserPreset = sequelize.define('UserPreset', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        references: {
            model: 'users',
            key: 'id'
        },
        onDelete: 'CASCADE'
    },
    settings: {
        type: DataTypes.JSONB,
        defaultValue: {
            // API Keys
            googleMapsApiKey: '',
            mapboxToken: '',
            fastopertorApiKey: '',

            // General Settings
            cityBias: '',
            theme: 'dark',
            courierTransportType: 'car',
            defaultStartAddress: '',
            defaultStartLat: null,
            defaultStartLng: null,
            defaultEndAddress: '',
            defaultEndLat: null,
            defaultEndLng: null,

            // Route Planning Constraints
            maxStopsPerRoute: 12,
            maxRouteDurationMin: 120,
            maxRouteDistanceKm: 80,
            maxWaitPerStopMin: 15,

            // Planning Strategy
            orderPriority: 'deliveryTime',
            prioritizeUrgent: true,
            urgentThresholdMinutes: 30,
            loadBalancing: 'equal',
            maxOrdersPerCourier: null,
            minOrdersPerRoute: 1,
            groupingStrategy: 'proximity',
            proximityGroupingRadius: 1000,
            timeWindowGroupingMinutes: 60,

            // Optimization Features
            optimizationGoal: 'balance',
            avoidTraffic: true,
            preferMainRoads: false,
            minRouteEfficiency: 0.5,
            allowRouteSplitting: true,
            preferSingleZoneRoutes: true,
            maxReadyTimeDifferenceMinutes: 45,
            maxDistanceBetweenOrdersKm: 15,
            enableOrderCombining: true,
            combineMaxDistanceMeters: 500,
            combineMaxTimeWindowMinutes: 30,
            trafficImpactLevel: 'medium',
            lateDeliveryPenalty: 50,

            // Custom Filters
            sector: '',
            citySectors: {},
            anomalyFilterEnabled: false
        },
        allowNull: false
    },
    updatedBy: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: 'users',
            key: 'id'
        },
        onDelete: 'SET NULL'
    }
}, {
    tableName: 'user_presets',
    timestamps: true
});

module.exports = UserPreset;
