const mongoose = require('mongoose');
const { Schema } = mongoose;

const CourierSchema = new Schema({
  name: { 
    type: String, 
    required: [true, 'Courier name is required'],
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
  },
  phoneNumber: { 
    type: String,
    trim: true,
    match: [/^[\+]?[1-9][\d]{0,15}$/, 'Please enter a valid phone number']
  },
  isActive: { 
    type: Boolean, 
    default: true 
  },
  vehicleType: { 
    type: String, 
    enum: {
      values: ['car', 'motorcycle'],
      message: 'Vehicle type must be either car or motorcycle'
    }, 
    default: 'car' 
  },
  location: { 
    type: String, 
    default: 'Київ',
    trim: true,
    maxlength: [100, 'Location cannot be more than 100 characters']
  },
  isArchived: { 
    type: Boolean, 
    default: false 
  },
  routes: [{ 
    type: Schema.Types.ObjectId, 
    ref: 'Route' 
  }],
  
  // Statistics (calculated fields)
  totalOrders: { 
    type: Number, 
    default: 0,
    min: [0, 'Total orders cannot be negative']
  },
  totalDistance: { 
    type: Number, 
    default: 0,
    min: [0, 'Total distance cannot be negative']
  },
  totalDistanceWithAdditional: { 
    type: Number, 
    default: 0,
    min: [0, 'Total distance with additional cannot be negative']
  },
  averageOrdersPerRoute: { 
    type: Number, 
    default: 0,
    min: [0, 'Average orders per route cannot be negative']
  },
  efficiencyScore: { 
    type: Number, 
    default: 0,
    min: [0, 'Efficiency score cannot be negative'],
    max: [100, 'Efficiency score cannot exceed 100']
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
CourierSchema.index({ name: 1 });
CourierSchema.index({ isActive: 1 });
CourierSchema.index({ location: 1 });
CourierSchema.index({ vehicleType: 1 });

// Virtual for route count
CourierSchema.virtual('routeCount').get(function() {
  return this.routes.length;
});

// Method to calculate additional kilometers
CourierSchema.methods.calculateAdditionalKilometers = function() {
  const additionalKm = this.totalOrders * 0.5;
  return {
    total: additionalKm,
    orderCount: this.totalOrders
  };
};

// Method to update statistics
CourierSchema.methods.updateStatistics = async function() {
  const Route = mongoose.model('Route');
  const routes = await Route.find({ courier: this._id });
  
  this.totalOrders = routes.reduce((sum, route) => sum + route.waypoints.length, 0);
  this.totalDistance = routes.reduce((sum, route) => {
    const distance = parseFloat(route.totalDistance.replace(/[^\d.]/g, '')) || 0;
    return sum + distance;
  }, 0);
  
  const additionalKm = this.totalOrders * 0.5;
  this.totalDistanceWithAdditional = this.totalDistance + additionalKm;
  this.averageOrdersPerRoute = routes.length > 0 ? this.totalOrders / routes.length : 0;
  this.efficiencyScore = this.calculateEfficiencyScore(routes);
  
  return this.save();
};

// Method to calculate efficiency score
CourierSchema.methods.calculateEfficiencyScore = function(routes) {
  if (routes.length === 0) return 0;
  
  const completedRoutes = routes.filter(r => r.isCompleted);
  const completionRate = (completedRoutes.length / routes.length) * 40;
  
  const avgOrders = routes.reduce((sum, r) => sum + r.waypoints.length, 0) / routes.length;
  const orderEfficiency = Math.min(avgOrders * 10, 30);
  
  const avgDistance = routes.reduce((sum, r) => {
    const distance = parseFloat(r.totalDistance.replace(/[^\d.]/g, '')) || 0;
    return sum + distance;
  }, 0) / routes.length;
  const distanceEfficiency = avgDistance > 0 ? Math.min(50 / avgDistance * 10, 30) : 0;
  
  return Math.min(completionRate + orderEfficiency + distanceEfficiency, 100);
};

// Pre-save middleware to update statistics
CourierSchema.pre('save', async function(next) {
  if (this.isModified('routes')) {
    await this.updateStatistics();
  }
  next();
});

module.exports = mongoose.model('Courier', CourierSchema);


