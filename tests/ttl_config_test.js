const assert = require('assert')
try {
  const cfg = require('../backend/workers/turboGroupingHelpers')._TTL_CONFIG
  console.log('TTL_CONFIG:', cfg)
  assert.ok(cfg, 'TTL_CONFIG must exist')
  assert.ok(typeof cfg.WINDOW_MS_PATCH === 'number', 'WINDOW_MS_PATCH must be number')
  assert.ok(typeof cfg.TTL_MS_PATCH === 'number', 'TTL_MS_PATCH must be number')
  // Basic sanity: 15 minutes default
  assert.equal(cfg.WINDOW_MS_PATCH, 15 * 60_000 / 1 * 1, 'WINDOW_MS_PATCH default');
  assert.equal(cfg.TTL_MS_PATCH, 15 * 60_000 / 1 * 1, 'TTL_MS_PATCH default');
  console.log('TTL config test passed')
} catch (e) {
  console.error('TTL config test failed', e)
  process.exit(1)
}
process.exit(0)
