const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'https://kill-metraj-frontend.onrender.com',
  ],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer configuration for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

// Minimal placeholder routes for frontend api.ts expectations
// Couriers
app.get('/api/couriers', (_req, res) => res.json({ success: true, data: [] }));
app.get('/api/couriers/:id', (_req, res) => res.json({ success: true, data: { id: _req.params.id } }));
app.get('/api/couriers/:id/statistics', (_req, res) => res.json({ success: true, data: { id: _req.params.id, stats: {} } }));
app.post('/api/couriers', (_req, res) => res.json({ success: true, data: { ..._req.body, id: 'new' } }));
app.put('/api/couriers/:id', (_req, res) => res.json({ success: true, data: { id: _req.params.id, ..._req.body } }));
app.delete('/api/couriers/:id', (_req, res) => res.json({ success: true }));

// Routes
app.get('/api/routes', (_req, res) => res.json({ success: true, data: [] }));
app.get('/api/routes/:id', (_req, res) => res.json({ success: true, data: { id: _req.params.id } }));
app.get('/api/routes/statistics', (_req, res) => res.json({ success: true, data: { id: 'statistics' } }));
app.post('/api/routes/from-waypoints', (_req, res) => res.json({ success: true, data: [] }));
app.post('/api/routes', (_req, res) => res.json({ success: true, data: { ..._req.body, id: 'new_route' } }));
app.put('/api/routes/:id', (_req, res) => res.json({ success: true, data: { id: _req.params.id, ..._req.body } }));
app.put('/api/routes/:id/complete', (_req, res) => res.json({ success: true, data: { id: _req.params.id, status: 'completed' } }));
app.put('/api/routes/:id/archive', (_req, res) => res.json({ success: true, data: { id: _req.params.id, status: 'archived' } }));
app.delete('/api/routes/:id', (_req, res) => res.json({ success: true }));

// Upload
app.post('/api/upload/excel', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    // Simple response for now
    res.json({
      success: true,
      data: {
        message: 'File uploaded successfully',
        filename: req.file.originalname,
        size: req.file.size
      }
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ success: false, error: 'Upload failed' });
  }
});

app.post('/api/upload/create-routes', (_req, res) => res.json({ success: true, data: [] }));
app.get('/api/upload/sample-template', (_req, res) => res.json({ success: true, data: {} }));
app.post('/api/upload/batch-geocode', (_req, res) => res.json({ success: true, data: [] }));
app.post('/api/upload/test-api-key', (_req, res) => res.json({ success: true, data: { isValid: true, message: 'API key tested' } }));

// Analytics
app.get('/api/analytics/dashboard', (_req, res) => res.json({ success: true, data: {} }));
app.get('/api/analytics/courier-performance', (_req, res) => res.json({ success: true, data: [] }));
app.get('/api/analytics/route-analytics', (_req, res) => res.json({ success: true, data: {} }));

// Catch-all for undefined routes
app.use('*', (req, res) => {
  res.status(404).json({ success: false, error: 'Route not found', path: req.originalUrl });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Minimal server running on 0.0.0.0:${PORT}`);
  console.log(`[LOG] Server started`);
});

module.exports = app;
