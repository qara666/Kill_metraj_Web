/**
 * Start TurboCalculator standalone
 * This script starts the TurboCalculator and keeps it running
 */

const http = require('http');
const { Server } = require('socket.io');
const logger = require('./src/utils/logger');

// Create HTTP server and Socket.io
const app = require('express')();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Import and start TurboCalculator
const turboCalculator = require('./workers/turboCalculator');

console.log('🚀 Starting TurboCalculator standalone...');
logger.info('🚀 Starting TurboCalculator standalone...');

turboCalculator.io = io;
turboCalculator.start();

// Keep process alive
setInterval(() => {
  console.log(`[TurboCalculator] ❤️ Heartbeat - Running: ${turboCalculator.isRunning}`);
}, 30000);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Shutting down TurboCalculator...');
  turboCalculator.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 Shutting down TurboCalculator...');
  turboCalculator.stop();
  process.exit(0);
});

console.log('✅ TurboCalculator started and running in background');
logger.info('✅ TurboCalculator started and running in background');