async function run(){
  try {
    const cfg = require('../backend/workers/turboGroupingHelpers')._TTL_CONFIG
    if (!cfg) throw new Error('TTL_CONFIG missing')
    if (typeof cfg.WINDOW_MS_PATCH !== 'number' || typeof cfg.TTL_MS_PATCH !== 'number') throw new Error('Invalid TTL config types')
    console.log('[OK] TTL config present', cfg.WINDOW_MS_PATCH, cfg.TTL_MS_PATCH)
  } catch (e) {
    console.error('[ERR] TTL config test2', e)
    process.exit(1)
  }
  return true
}
module.exports = run
