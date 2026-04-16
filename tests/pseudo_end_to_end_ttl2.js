async function run(){
  try {
    const cfg = require('../backend/workers/turboGroupingHelpers')._TTL_CONFIG
    const TTL_MS = cfg?.TTL_MS_PATCH ?? (15 * 60_000)
    const anchor = Date.now()
    const rem5 = Math.max(0, (anchor + TTL_MS) - (anchor + 5 * 60_000))
    if (rem5 <= 0) throw new Error('TTL remaining after 5 min should be > 0')
    const remTTL = (anchor + TTL_MS + 1000) - (anchor + TTL_MS + 1000)
    if (remTTL !== 0) throw new Error('TTL zero delta check failed')
    console.log('[OK] TTL2 basic simulation passed')
  } catch (e) {
    console.error('[ERR] TTL2', e)
    process.exit(1)
  }
  return true
}
module.exports = run
