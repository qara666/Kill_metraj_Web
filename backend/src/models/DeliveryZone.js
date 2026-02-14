const mongoose = require('mongoose');

const deliveryZoneSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    polygon: {
        type: [[Number]], // Array of [lat, lng] pairs
        required: true,
        validate: {
            validator: function (v) {
                return Array.isArray(v) && v.length >= 3 && v.every(point =>
                    Array.isArray(point) && point.length === 2 &&
                    typeof point[0] === 'number' && typeof point[1] === 'number'
                );
            },
            message: 'Polygon must be an array of at least 3 [lat, lng] coordinate pairs'
        }
    },
    hub: {
        type: {
            lat: Number,
            lng: Number
        },
        required: false
    },
    divisionId: {
        type: String,
        required: true,
        default: 'default'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Обновляем updatedAt при изменении
deliveryZoneSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

// Индексы для быстрого поиска
deliveryZoneSchema.index({ divisionId: 1, isActive: 1 });

module.exports = mongoose.model('DeliveryZone', deliveryZoneSchema);
