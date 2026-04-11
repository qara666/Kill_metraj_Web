// Simple integration test: ensure today background calc and sync work end-to-end
// This script seeds a DashboardCache row for today, obtains a JWT, triggers a priority calc,
// and reports results to console. It is best-effort and will skip if DB is not available.
const http = require('http');
const https = require('https');
const { sequelize, DashboardCache } = require('../src/models');
const jwt = require('jsonwebtoken');

async function main() {
  const PORT = process.env.PORT || 5001;
  const SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
  const today = new Date().toISOString().split('T')[0];
  // Create a test user token with divisionId
  const token = jwt.sign({ id: 9999, divisionId: '100000052', username: 'tester', role: 'user' }, SECRET, { expiresIn: '1h' });

  // Seed DashboardCache for today
  try {
    await sequelize.authenticate();
    console.log('[Test] DB connected');
    const payload = {
      orders: [{ id: 't1', orderNumber: 'T-1', courier: 'TEST', status: 'NEW', deliveryStatus: 'NEW' }]
    };
    await DashboardCache.upsert({
      division_id: '100000052',
      target_date: today,
      payload,
      data_hash: 'testhash',
      created_at: new Date(),
      updated_at: new Date()
    });
    console.log('[Test] Seeded DashboardCache for today:', today);
  } catch (err) {
    console.error('[Test] DB seed failed (server may be unavailable):', err.message);
    return;
  }

  // Trigger priority calc for today
  const postData = JSON.stringify({ divisionId: '100000052', date: today });
  const options = {
    hostname: 'localhost',
    port: PORT,
    path: '/api/turbo/priority',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData),
      'Authorization': `Bearer ${token}`
    }
  };

  const req = http.request(options, (res) => {
    console.log('[Test] /api/turbo/priority status', res.statusCode);
    res.setEncoding('utf8');
    res.on('data', (chunk) => {
      console.log('[Test] Response:', chunk);
    });
  });

  req.on('error', (e) => {
    console.error('[Test] Request error:', e.message);
  });
  req.write(postData);
  req.end();

  // Cleanup: optional (not performed here to keep data for manual inspection)
}

main().catch(err => {
  console.error('[Test] Unexpected error:', err);
});
