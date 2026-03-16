import { useState, useEffect, useCallback } from 'react'
import { localStorageUtils } from '../utils/ui/localStorage'

export interface KmlPolygon {
    key: string
    name: string
    folderName: string
    googlePoly?: any
    bounds?: any
    path?: Array<{ lat: number; lng: number }>
}

export const useKmlData = () => {
    const [settings, setSettings] = useState(() => localStorageUtils.getAllSettings())
    const [selectedHubs, setSelectedHubs] = useState<string[]>(() => settings.selectedHubs || [])
    const [selectedZones, setSelectedZones] = useState<string[]>(() => settings.selectedZones || [])

    const [cachedAllKmlPolygons, setCachedAllKmlPolygons] = useState<KmlPolygon[]>([])
    const [cachedHubPolygons, setCachedHubPolygons] = useState<KmlPolygon[]>([])

    const buildBounds = useCallback((path: any[]) => {
        if (!path || path.length === 0) return null
        
        let south = 90, north = -90, west = 180, east = -180
        path.forEach(pt => {
            const lat = typeof pt.lat === 'function' ? pt.lat() : pt.lat
            const lng = typeof pt.lng === 'function' ? pt.lng() : pt.lng
            if (lat < south) south = lat
            if (lat > north) north = lat
            if (lng < west) west = lng
            if (lng > east) east = lng
        })
        
        // Return a shape compatible with both Google (getCenter) and our manual Ray-Casting
        return { 
            south, north, west, east,
            getCenter: () => ({ lat: (south + north) / 2, lng: (west + east) / 2 }),
            contains: (loc: any) => {
                const lat = typeof loc.lat === 'function' ? loc.lat() : loc.lat
                const lng = typeof loc.lng === 'function' ? loc.lng() : loc.lng
                return lat >= south && lat <= north && lng >= west && lng <= east
            }
        }
    }, [])

    const syncFromServer = useCallback(async () => {
        try {
            const { API_URL } = await import('../config/apiConfig')
            const baseUrl = API_URL.replace(/\/api$/, '')
            
            const hResponse = await fetch(`${baseUrl}/api/geocache/hubs`)
            const hData = await hResponse.json()
            if (!hData.success) return

            const activeHubs = hData.hubs.filter((h: any) => h.isActive)
            
            const allZonesPromises = activeHubs.map(async (hub: any) => {
                const zResponse = await fetch(`${baseUrl}/api/geocache/hubs/${hub.id}/zones`)
                const zData = await zResponse.json()
                return zData.success ? zData.zones.map((z: any) => ({
                    ...z,
                    hubName: hub.name
                })) : []
            })

            const zonesByHub = await Promise.all(allZonesPromises)
            const flatZones = zonesByHub.flat()

            if (flatZones.length > 0) {
                const gmaps = (window as any).google?.maps
                const serverPolys: KmlPolygon[] = flatZones.map((z: any) => {
                    // SOTA: Handle various naming conventions from backend (rvk sectors)
                    const zoneName = z.sectorName || z.sector_name || z.name || ''
                    const hubName = (z.hubName || z.hub_name || '').trim()
                    
                    const poly: KmlPolygon = {
                        key: `${hubName}:${zoneName}`.trim(),
                        name: zoneName,
                        folderName: hubName,
                        path: z.boundary.coordinates[0].map((coord: any) => ({ lat: coord[1], lng: coord[0] })),
                    }
                    poly.bounds = buildBounds(poly.path!)
                    if (gmaps?.Polygon) {
                        try {
                           poly.googlePoly = new gmaps.Polygon({ paths: poly.path })
                        } catch (e) { console.debug('Google Polygon init failed', e) }
                    }
                    return poly
                })

                setCachedAllKmlPolygons(prev => {
                    const existingKeys = new Set(prev.map(p => p.key))
                    const newPolys = serverPolys.filter(p => !existingKeys.has(p.key))
                    const combined = [...prev, ...newPolys]
                    
                    // Save to localStorage so RobustGeocodingService (v2) picks them up
                    try {
                        const current = localStorageUtils.getAllSettings()
                        const existingLocalPolys = (current.kmlData?.polygons || [])
                        const existingLocalKeys = new Set(existingLocalPolys.map((p: any) => `${p.folderName}:${p.name}`))
                        
                        const mergedPolys = [...existingLocalPolys]
                        serverPolys.forEach(sp => {
                            if (!existingLocalKeys.has(`${sp.folderName}:${sp.name}`)) {
                                mergedPolys.push({
                                    name: sp.name,
                                    folderName: sp.folderName,
                                    path: sp.path,
                                    isServerSide: true
                                })
                            }
                        })
                        
                        localStorageUtils.setAllSettings({ 
                            kmlData: { polygons: mergedPolys }
                        })
                    } catch (err) {
                        console.error('[useKmlData] Failed to persist server zones to localStorage', err)
                    }

                    return combined
                })

                console.log(`[useKmlData] Synced ${serverPolys.length} zones from server`)
            }

        } catch (e) {
            console.debug('[useKmlData] Server sync skipped:', e)
        }
    }, [buildBounds])

    // Sync settings and trigger server fetch
    useEffect(() => {
        const handleSettingsUpdate = () => {
            const newSettings = localStorageUtils.getAllSettings()
            setSettings(newSettings)
            setSelectedHubs(newSettings.selectedHubs || [])
            setSelectedZones(newSettings.selectedZones || [])
        }
        window.addEventListener('km-settings-updated', handleSettingsUpdate)
        
        syncFromServer()
        
        return () => window.removeEventListener('km-settings-updated', handleSettingsUpdate)
    }, [syncFromServer])

    // Process polygons whenever kmlData or selectedHubs changes
    useEffect(() => {
        const gmaps = (window as any).google?.maps
        const newLocalPolys: KmlPolygon[] = []

        if (settings.kmlData?.polygons) {
            settings.kmlData.polygons.forEach((p: any) => {
                const poly: KmlPolygon = {
                    key: `${(p.folderName || '').trim()}:${(p.name || '').trim()}`,
                    name: p.name || '',
                    folderName: p.folderName || '',
                    path: p.path,
                }
                poly.bounds = buildBounds(p.path)
                if (gmaps?.Polygon) {
                    try {
                        poly.googlePoly = new gmaps.Polygon({ paths: p.path })
                    } catch (e) { console.debug('Google Polygon init failed', e) }
                }
                newLocalPolys.push(poly)
            })
        }

        setCachedAllKmlPolygons(prev => {
            const existingKeys = new Set(prev.map(p => p.key))
            const added = newLocalPolys.filter(p => !existingKeys.has(p.key))
            return [...prev, ...added]
        })
    }, [settings.kmlData, buildBounds])

    // Update hub-specific polygons
    useEffect(() => {
        if (selectedHubs.length > 0) {
            const hubPolys = cachedAllKmlPolygons.filter((p: any) => selectedHubs.includes(p.folderName))
            setCachedHubPolygons(hubPolys)
        } else {
            setCachedHubPolygons([])
        }
    }, [selectedHubs, cachedAllKmlPolygons])

    return {
        settings,
        selectedHubs,
        selectedZones,
        cachedAllKmlPolygons,
        cachedHubPolygons,
        refreshFromServer: syncFromServer
    }
}
