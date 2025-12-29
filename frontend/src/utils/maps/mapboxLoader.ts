type MapboxModule = typeof import('mapbox-gl')

let mapboxPromise: Promise<MapboxModule> | null = null
let styleLoaded = false

const MAPBOX_JS = 'https://api.mapbox.com/mapbox-gl-js/v2.16.1/mapbox-gl.js'
const MAPBOX_CSS = 'https://api.mapbox.com/mapbox-gl-js/v2.16.1/mapbox-gl.css'

const ensureCssLoaded = () => {
  if (styleLoaded || typeof document === 'undefined') return
  const existingLink = document.head.querySelector(`link[href="${MAPBOX_CSS}"]`)
  if (!existingLink) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = MAPBOX_CSS
    document.head.appendChild(link)
  }
  styleLoaded = true
}

const loadViaCdn = (): Promise<MapboxModule> => {
  ensureCssLoaded()
  return new Promise((resolve, reject) => {
    const existingScript = document.head.querySelector(`script[src="${MAPBOX_JS}"]`) as HTMLScriptElement | null
    if (existingScript) {
      existingScript.addEventListener('load', () => resolve((window as any).mapboxgl))
      existingScript.addEventListener('error', reject)
      return
    }

    const script = document.createElement('script')
    script.src = MAPBOX_JS
    script.async = true
    script.onload = () => resolve((window as any).mapboxgl)
    script.onerror = reject
    document.head.appendChild(script)
  })
}

export async function loadMapboxGL(): Promise<MapboxModule> {
  if (typeof window === 'undefined') {
    throw new Error('Mapbox доступен только в браузере')
  }

  if ((window as any).mapboxgl) {
    return (window as any).mapboxgl as MapboxModule
  }

  if (!mapboxPromise) {
    mapboxPromise = import('mapbox-gl')
      .then(module => {
        ensureCssLoaded()
        const mapboxgl = (module as any).default || module
        ;(window as any).mapboxgl = mapboxgl
        return mapboxgl as MapboxModule
      })
      .catch(error => {
        console.warn('⚠️ Не удалось загрузить mapbox-gl через bundler, пробую CDN...', error)
        return loadViaCdn()
      })
  }

  return mapboxPromise
}

