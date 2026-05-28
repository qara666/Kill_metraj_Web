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
            // API ключи
            googleMapsApiKey: '',
            mapboxToken: '',
            fastopertorApiKey: '',

            // Общие настройки (уже русский)
            cityBias: '',
            theme: 'dark',
            courierTransportType: 'car',
            defaultStartAddress: '',
            defaultStartLat: null,
            defaultStartLng: null,
            defaultEndAddress: '',
            defaultEndLat: null,
            defaultEndLng: null,

            // Ограничения планирования маршрутов
            maxStopsPerRoute: 12,
            maxRouteDurationMin: 120,
            maxRouteDistanceKm: 80,
            maxWaitPerStopMin: 15,

            // Стратегия планирования (уже русский)
            orderPriority: 'deliveryTime',
            prioritizeUrgent: true,
            urgentThresholdMinutes: 30,
            loadBalancing: 'equal',
            maxOrdersPerCourier: null,
            minOrdersPerRoute: 1,
            groupingStrategy: 'proximity',
            proximityGroupingRadius: 1000,
            timeWindowGroupingMinutes: 60,

            // Функции оптимизации (уже русский)
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

            // Пользовательские фильтры (уже русский)
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
