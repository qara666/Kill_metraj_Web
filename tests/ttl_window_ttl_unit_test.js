// Unit test for TTL window and TTL math
// Uses TTL_MS from backend turboGroupingHelpers._TTL_CONFIG when available, else defaults to 15*60_000
const assert = require('assert')
let TTL_MS = 15 * 60_000
let WINDOW_MS = 15 * 60_000

try {
  const cfg = require('../backend/workers/turboGroupingHelpers')._TTL_CONFIG
  if (cfg) {
    TTL_MS = cfg.TTL_MS_PATCH
    WINDOW_MS = cfg.WINDOW_MS_PATCH
  }
} catch (e) {
  // ignore if not available
}

function remaining(anchor, offset) {
  const now = anchor + offset
  const end = anchor + TTL_MS
  const r = end - now
  return r > 0 ? r : 0
}

try {
  // 0 offset, TTL_MS remaining
  let r = remaining(0, 0)
  assert.ok(r > 0, 'TTL should not be expired at t=0')
  // offset equals TTL_MS: remaining should be 0
  r = remaining(0, TTL_MS)
  assert.equal(r, 0, 'TTL should be expired after TTL_MS')
  // intermediate: 1/2 TTL
  r = remaining(0, Math.floor(TTL_MS / 2))
  assert.ok(r > 0, 'TTL should be positive before TTL end')
  console.log('[OK] TTL window unit tests passed')
} catch (e) {
  console.error('[ERR] TTL window unit tests failed', e)
  process.exit(1)
}
process.exit(0)
