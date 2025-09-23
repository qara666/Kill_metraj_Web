const mongoose = require('mongoose');
const { Schema } = mongoose;

const PaymentMethodSchema = new Schema({
  name: {
    type: String,
    required: [true, 'Назва способу оплати є обов\'язковою'],
    unique: true,
    trim: true,
    index: true
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Опис не може перевищувати 500 символів']
  },
  type: {
    type: String,
    enum: {
      values: ['cash', 'card', 'online', 'bank_transfer', 'crypto', 'other'],
      message: 'Тип оплати повинен бути одним з: cash, card, online, bank_transfer, crypto, other'
    },
    default: 'cash'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  requiresConfirmation: {
    type: Boolean,
    default: false
  },
  processingFee: {
    type: Number,
    default: 0,
    min: [0, 'Комісія не може бути від\'ємною']
  },
  processingFeeType: {
    type: String,
    enum: {
      values: ['fixed', 'percentage'],
      message: 'Тип комісії повинен бути fixed або percentage'
    },
    default: 'fixed'
  },
  minAmount: {
    type: Number,
    default: 0,
    min: [0, 'Мінімальна сума не може бути від\'ємною']
  },
  maxAmount: {
    type: Number,
    min: [0, 'Максимальна сума не може бути від\'ємною']
  },
  icon: {
    type: String,
    trim: true
  },
  color: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        return !v || /^#[0-9A-F]{6}$/i.test(v);
      },
      message: 'Колір повинен бути в форматі HEX (#RRGGBB)'
    }
  },
  sortOrder: {
    type: Number,
    default: 0
  },
  isArchived: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Індекси для кращої продуктивності
PaymentMethodSchema.index({ name: 1 });
PaymentMethodSchema.index({ type: 1 });
PaymentMethodSchema.index({ isActive: 1 });
PaymentMethodSchema.index({ isArchived: 1 });
PaymentMethodSchema.index({ sortOrder: 1 });

// Віртуальне поле для загальної кількості замовлень
PaymentMethodSchema.virtual('totalOrders', {
  ref: 'Order',
  localField: '_id',
  foreignField: 'paymentMethod',
  count: true
});

// Віртуальне поле для загальної суми замовлень
PaymentMethodSchema.virtual('totalAmount', {
  ref: 'Order',
  localField: '_id',
  foreignField: 'paymentMethod',
  options: { match: { status: 'completed' } }
});

// Метод для розрахунку комісії
PaymentMethodSchema.methods.calculateFee = function(amount) {
  if (this.processingFeeType === 'percentage') {
    return (amount * this.processingFee) / 100;
  }
  return this.processingFee;
};

// Метод для перевірки валідності суми
PaymentMethodSchema.methods.isValidAmount = function(amount) {
  if (amount < this.minAmount) return false;
  if (this.maxAmount && amount > this.maxAmount) return false;
  return true;
};

// Метод для активації
PaymentMethodSchema.methods.activate = function() {
  this.isActive = true;
  this.isArchived = false;
  return this.save();
};

// Метод для деактивації
PaymentMethodSchema.methods.deactivate = function() {
  this.isActive = false;
  return this.save();
};

// Метод для архівування
PaymentMethodSchema.methods.archive = function() {
  this.isArchived = true;
  this.isActive = false;
  return this.save();
};

// Статичний метод для отримання активних способів оплати
PaymentMethodSchema.statics.getActive = function() {
  return this.find({ isActive: true, isArchived: false }).sort({ sortOrder: 1, name: 1 });
};

// Статичний метод для отримання способів оплати за типом
PaymentMethodSchema.statics.getByType = function(type) {
  return this.find({ type, isActive: true, isArchived: false }).sort({ sortOrder: 1, name: 1 });
};

module.exports = mongoose.model('PaymentMethod', PaymentMethodSchema);
