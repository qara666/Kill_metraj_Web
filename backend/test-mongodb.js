// Test MongoDB connection
const mongoose = require('mongoose');
require('dotenv').config({ path: './backend/.env' });

console.log('🔌 Testing MongoDB connection...');

const testConnection = async () => {
  try {
    let mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/kill_metraj';
    
    console.log('📍 Connection string:', mongoURI.replace(/\/\/.*@/, '//***:***@'));
    
    // If using MongoDB Atlas, ensure proper connection string format
    if (mongoURI.includes('mongodb+srv://')) {
      if (!mongoURI.includes('retryWrites')) {
        mongoURI += '?retryWrites=true&w=majority';
      }
    }
    
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });
    
    console.log('✅ MongoDB connected successfully!');
    console.log('📊 Database name:', mongoose.connection.db.databaseName);
    console.log('🌐 Host:', mongoose.connection.host);
    console.log('🔌 Port:', mongoose.connection.port);
    
    // Test a simple operation
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('📁 Collections:', collections.map(c => c.name));
    
    await mongoose.connection.close();
    console.log('🔌 Connection closed');
    
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    
    if (error.message.includes('ENOTFOUND')) {
      console.error('💡 Tip: Check your MongoDB connection string and network connectivity');
      console.error('💡 Make sure your MongoDB Atlas cluster is active');
    } else if (error.message.includes('authentication failed')) {
      console.error('💡 Tip: Check your MongoDB username and password');
    } else if (error.message.includes('timeout')) {
      console.error('💡 Tip: Check your MongoDB cluster status and network connection');
    } else if (error.message.includes('not authorized')) {
      console.error('💡 Tip: Check your MongoDB user permissions');
    }
    
    process.exit(1);
  }
};

testConnection();
