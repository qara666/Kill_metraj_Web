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

    // Polygons cached as Google Maps objects (or fallback paths)
    const [cachedAllKmlPolygons, setCachedAllKmlPolygons] = useState<KmlPolygon[]>([])
    const [cachedHubPolygons, setCachedHubPolygons] = useState<KmlPolygon[]>([])

    // Sync settings on global update event
    useEffect(() => {
        const handleSettingsUpdate = () => {
            const newSettings = localStorageUtils.getAllSettings()
            setSettings(newSettings)
            setSelectedHubs(newSettings.selectedHubs || [])
            setSelectedZones(newSettings.selectedZones || [])
        }
        window.addEventListener('km-settings-updated', handleSettingsUpdate)
        return () => window.removeEventListener('km-settings-updated', handleSettingsUpdate)
    }, [])

    const buildBounds = useCallback((path: any[]) => {
        if (typeof window === 'undefined' || !window.google?.maps?.LatLngBounds) return null
        const bounds = new window.google.maps.LatLngBounds()
        path.forEach(pt => bounds.extend(pt))
        return bounds
    }, [])

    // Process polygons whenever kmlData or selectedHubs changes
    useEffect(() => {
        if (!settings.kmlData?.polygons) {
            setCachedAllKmlPolygons([])
            setCachedHubPolygons([])
            return
        }

        const gmaps = (window as any).google?.maps

        // 1. All polygons (delivery + technical)
        const all: KmlPolygon[] = settings.kmlData.polygons.map((p: any) => {
            const poly: KmlPolygon = {
                key: `${(p.folderName || '').trim()}:${(p.name || '').trim()}`,
                name: p.name || '',
                folderName: p.folderName || '',
                path: p.path,
            }
            if (gmaps?.Polygon) {
                poly.googlePoly = new gmaps.Polygon({ paths: p.path })
                poly.bounds = buildBounds(p.path)
            }
            return poly
        })
        setCachedAllKmlPolygons(all)

        // 2. Filtered polygons for active hubs
        if (selectedHubs.length > 0) {
            const hubPolys = all.filter((p: any) => selectedHubs.includes(p.folderName))
            setCachedHubPolygons(hubPolys)
        } else {
            setCachedHubPolygons([])
        }
    }, [settings.kmlData, selectedHubs, buildBounds])

    return {
        settings,
        selectedHubs,
        selectedZones,
        cachedAllKmlPolygons,
        cachedHubPolygons
    }
}
