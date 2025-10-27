const mongoose = require('mongoose');
const { Schema } = mongoose;

const OrderSchema = new Schema({
  orderNumber: {
    type: String,
    required: [true, 'Номер замовлення є обовязковим'],
    unique: true,
    trim: true,
    index: true
  },
  address: {
    type: String,
    required: [true, 'Адреса є обовязковою'],
    trim: true
  },
  phone: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        return !v || /^[\+]?[0-9\s\-\(\)]{10,}$/.test(v);
      },
      message: 'Невірний формат телефону'
    }
  },
  courier: {
    type: Schema.Types.ObjectId,
    ref: 'Courier'
  },
  paymentMethod: {
    type: Schema.Types.ObjectId,
    ref: 'PaymentMethod'
  },
  amount: {
    type: Number,
    default: 0,
    min: [0, 'Сума не може бути від\'ємною']
  },
  note: {
    type: String,
    trim: true,
    maxlength: [1000, 'Примітка не може перевищувати 1000 символів']
  },
  priority: {
    type: String,
    enum: {
      values: ['low', 'normal', 'high', 'urgent'],
      message: 'Пріоритет повинен бути одним з: low, normal, high, urgent'
    },
    default: 'normal'
  },
  status: {
    type: String,
    enum: {
      values: ['pending', 'assigned', 'in_progress', 'completed', 'cancelled'],
      message: 'Статус повинен бути одним з: pending, assigned, in_progress, completed, cancelled'
    },
    default: 'pending'
  },
  assignedDate: {
    type: Date
  },
  completedDate: {
    type: Date
  },
  estimatedDeliveryTime: {
    type: Date
  },
  actualDeliveryTime: {
    type: Date
  },
  deliveryNotes: {
    type: String,
    trim: true,
    maxlength: [500, 'Примітки доставки не можуть перевищувати 500 символів']
  },
  customerRating: {
    type: Number,
    min: [1, 'Рейтинг не може бути менше 1'],
    max: [5, 'Рейтинг не може бути більше 5']
  },
  customerFeedback: {
    type: String,
    trim: true,
    maxlength: [1000, 'Відгук клієнта не може перевищувати 1000 символів']
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
OrderSchema.index({ orderNumber: 1 });
OrderSchema.index({ courier: 1 });
OrderSchema.index({ paymentMethod: 1 });
OrderSchema.index({ status: 1 });
OrderSchema.index({ priority: 1 });
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ isArchived: 1 });

// Віртуальне поле для тривалості обробки
OrderSchema.virtual('processingTime').get(function() {
  if (this.assignedDate && this.completedDate) {
    return this.completedDate.getTime() - this.assignedDate.getTime();
  }
  return null;
});

// Віртуальне поле для затримки доставки
OrderSchema.virtual('deliveryDelay').get(function() {
  if (this.estimatedDeliveryTime && this.actualDeliveryTime) {
    return this.actualDeliveryTime.getTime() - this.estimatedDeliveryTime.getTime();
  }
  return null;
});

// Метод для призначення курєра
OrderSchema.methods.assignCourier = function(courierId) {
  this.courier = courierId;
  this.status = 'assigned';
  this.assignedDate = new Date();
  return this.save();
};

// Метод для початку виконання
OrderSchema.methods.startDelivery = function() {
  this.status = 'in_progress';
  return this.save();
};

// Метод для завершення замовлення
OrderSchema.methods.complete = function(deliveryNotes, rating, feedback) {
  this.status = 'completed';
  this.completedDate = new Date();
  this.actualDeliveryTime = new Date();
  
  if (deliveryNotes) this.deliveryNotes = deliveryNotes;
  if (rating) this.customerRating = rating;
  if (feedback) this.customerFeedback = feedback;
  
  return this.save();
};

// Метод для скасування замовлення
OrderSchema.methods.cancel = function(reason) {
  this.status = 'cancelled';
  if (reason) this.note = (this.note || '') + `\nСкасовано: ${reason}`;
  return this.save();
};

// Метод для архівування
OrderSchema.methods.archive = function() {
  this.isArchived = true;
  return this.save();
};

// Pre-save middleware для оновлення статистики курєра
OrderSchema.pre('save', async function(next) {
  if (this.isModified('status') && this.status === 'completed' && this.courier) {
    const Courier = mongoose.model('Courier');
    await Courier.findByIdAndUpdate(this.courier, {
      $inc: { totalOrders: 1 }
    });
  }
  next();
});

module.exports = mongoose.model('Order', OrderSchema);







