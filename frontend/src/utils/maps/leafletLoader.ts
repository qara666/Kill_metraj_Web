/**
 * Dynamic loader for Leaflet.js
 */

let leafletPromise: Promise<any> | null = null
let styleLoaded = false

const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'

const ensureCssLoaded = () => {
  if (styleLoaded || typeof document === 'undefined') return
  const existingLink = document.head.querySelector(`link[href="${LEAFLET_CSS}"]`)
  if (!existingLink) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = LEAFLET_CSS
    document.head.appendChild(link)
  }
  styleLoaded = true
}

const loadViaCdn = (): Promise<any> => {
  ensureCssLoaded()
  return new Promise((resolve, reject) => {
    const existingScript = document.head.querySelector(`script[src="${LEAFLET_JS}"]`) as HTMLScriptElement | null
    if (existingScript) {
      if ((window as any).L) {
          resolve((window as any).L)
      } else {
          existingScript.addEventListener('load', () => resolve((window as any).L))
          existingScript.addEventListener('error', reject)
      }
      return
    }

    const script = document.createElement('script')
    script.src = LEAFLET_JS
    script.async = true
    script.onload = () => resolve((window as any).L)
    script.onerror = reject
    document.head.appendChild(script)
  })
}

export async function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined') {
    throw new Error('Leaflet доступен только в браузере')
  }

  if ((window as any).L) {
    return (window as any).L
  }

  if (!leafletPromise) {
    leafletPromise = loadViaCdn()
  }

  return leafletPromise
}
