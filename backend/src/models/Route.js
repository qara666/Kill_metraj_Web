const mongoose = require('mongoose');
const { Schema } = mongoose;

const AddressSchema = new Schema({
  scannedText: { 
    type: String, 
    required: [true, 'Scanned text is required'],
    trim: true
  },
  formattedAddress: { 
    type: String, 
    required: [true, 'Formatted address is required'],
    trim: true
  },
  latitude: { 
    type: Number,
    min: [-90, 'Latitude must be between -90 and 90'],
    max: [90, 'Latitude must be between -90 and 90']
  },
  longitude: { 
    type: Number,
    min: [-180, 'Longitude must be between -180 and 180'],
    max: [180, 'Longitude must be between -180 and 180']
  },
  isDestination: { 
    type: Boolean, 
    default: false 
  },
  isWaypoint: { 
    type: Boolean 
  },
  orderIndex: { 
    type: Number,
    min: [0, 'Order index cannot be negative']
  },
  orderNumber: { 
    type: String,
    trim: true
  }
});

const RouteSchema = new Schema({
  startPoint: { 
    type: AddressSchema, 
    required: [true, 'Start point is required'] 
  },
  endPoint: { 
    type: AddressSchema, 
    required: [true, 'End point is required'] 
  },
  waypoints: [AddressSchema],
  totalDistance: { 
    type: String, 
    default: '',
    trim: true
  },
  totalDuration: { 
    type: String, 
    default: '',
    trim: true
  },
  polyline: { 
    type: String, 
    default: '',
    trim: true
  },
  transportationMode: { 
    type: String, 
    default: 'driving',
    enum: {
      values: ['driving', 'walking', 'bicycling', 'transit'],
      message: 'Transportation mode must be one of: driving, walking, bicycling, transit'
    }
  },
  courier: { 
    type: Schema.Types.ObjectId, 
    ref: 'Courier' 
  },
  
  // Route management
  isActive: { 
    type: Boolean, 
    default: true 
  },
  isCompleted: { 
    type: Boolean, 
    default: false 
  },
  isArchived: { 
    type: Boolean, 
    default: false 
  },
  completionDate: { 
    type: Date 
  },
  notes: { 
    type: String, 
    default: '',
    trim: true,
    maxlength: [1000, 'Notes cannot be more than 1000 characters']
  },
  priority: { 
    type: String, 
    enum: {
      values: ['low', 'normal', 'high', 'urgent'],
      message: 'Priority must be one of: low, normal, high, urgent'
    }, 
    default: 'normal' 
  },
  estimatedFuelCost: { 
    type: Number, 
    default: 0,
    min: [0, 'Estimated fuel cost cannot be negative']
  },
  actualFuelCost: { 
    type: Number, 
    default: 0,
    min: [0, 'Actual fuel cost cannot be negative']
  },
  routeRating: { 
    type: Number, 
    default: 0,
    min: [0, 'Route rating cannot be negative'],
    max: [5, 'Route rating cannot exceed 5']
  },
  difficulty: { 
    type: String, 
    enum: {
      values: ['easy', 'medium', 'hard', 'expert'],
      message: 'Difficulty must be one of: easy, medium, hard, expert'
    }, 
    default: 'medium' 
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for better performance
RouteSchema.index({ courier: 1 });
RouteSchema.index({ isActive: 1 });
RouteSchema.index({ isCompleted: 1 });
RouteSchema.index({ priority: 1 });
RouteSchema.index({ createdAt: -1 });

// Virtual for waypoint count
RouteSchema.virtual('waypointCount').get(function() {
  return this.waypoints.filter(wp => wp.isWaypoint).length;
});

// Virtual for total order count
RouteSchema.virtual('orderCount').get(function() {
  return this.waypoints.length;
});

// Method to calculate route efficiency
RouteSchema.methods.calculateEfficiency = function() {
  const orderCount = this.waypoints.length;
  const distance = parseFloat(this.totalDistance.replace(/[^\d.]/g, '')) || 0;
  
  if (orderCount === 0) return 0;
  return distance / orderCount; // km per order (lower is better)
};

// Method to complete route
RouteSchema.methods.complete = function() {
  this.isCompleted = true;
  this.isActive = false;
  this.completionDate = new Date();
  return this.save();
};

// Method to archive route
RouteSchema.methods.archive = function() {
  this.isArchived = true;
  this.isActive = false;
  return this.save();
};

// Method to activate route
RouteSchema.methods.activate = function() {
  this.isActive = true;
  this.isCompleted = false;
  this.isArchived = false;
  return this.save();
};

// Pre-save middleware to update courier statistics
RouteSchema.pre('save', async function(next) {
  if (this.isModified('isCompleted') && this.isCompleted && this.courier) {
    const Courier = mongoose.model('Courier');
    await Courier.findByIdAndUpdate(this.courier, {
      $addToSet: { routes: this._id }
    });
  }
  next();
});

module.exports = mongoose.model('Route', RouteSchema);
