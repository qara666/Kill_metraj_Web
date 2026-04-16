async function loadModule(path){
  const mod = require(path)
  if (typeof mod === 'function') {
    return await mod()
  }
  if (typeof mod?.default === 'function') {
    return await mod.default()
  }
  throw new Error(`Module ${path} has no executable function`)
}

async function main(){
  const modules = [
    './ttl_config_test2',
    './pseudo_end_to_end_ttl2'
  ]
  for (const m of modules){
    try {
      const ok = await loadModule(__dirname + '/' + m)
      console.log('[TEST] ' + m + ' =>', ok ? 'OK' : 'FAILED')
    } catch (e) {
      console.error('[TEST] ' + m + ' error:', e)
      process.exit(1)
    }
  }
  console.log('[TEST] ALL OK')
}
main().catch((e)=>{ console.error('[TEST] RUN ERROR', e); process.exit(1); })
