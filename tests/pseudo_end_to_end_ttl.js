// Simple synthetic test to verify TTL semantics in isolation (no real DB)
const assert = require('assert')

// Import TTL constants from backend (needs to be exposed in _TTL_CONFIG)
const cfg = require('../backend/workers/turboGroupingHelpers')._TTL_CONFIG
const TTL_MS = cfg?.TTL_MS_PATCH ?? (15 * 60_000)

function ttlRemaining(anchorTimeMs, nowMs) {
  return Math.max(0, anchorTimeMs + TTL_MS - nowMs)
}

// Simulate a group with one order anchored now
const anchor = Date.now()
let remain = ttlRemaining(anchor, anchor + 5 * 60 * 1000)
assert.ok(remain > 0, 'TTL should be positive after 5 min')

// After TTL elapsed
remain = ttlRemaining(anchor, anchor + TTL_MS + 1000)
assert.equal(remain, 0, 'TTL should be expired after TTL_MS')

console.log('TTL end time simulation passed')
process.exit(0)
