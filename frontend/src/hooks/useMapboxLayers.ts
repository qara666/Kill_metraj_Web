import { useCallback } from 'react'
import { getTrafficSeverity } from '../utils/maps/mapboxTrafficAPI'

const SOURCE_ID = 'km-traffic-source'
const HEATMAP_LAYER_ID = 'km-traffic-heatmap'
const SEGMENT_SOURCE_ID = 'km-traffic-segments'
const SEGMENT_LAYER_ID = 'km-traffic-segments-line'
const SECTOR_SOURCE_ID = 'km-traffic-sector'
const SECTOR_FILL_LAYER_ID = 'km-traffic-sector-fill'
const SECTOR_LINE_LAYER_ID = 'km-traffic-sector-line'
const OFFICIAL_TRAFFIC_SOURCE_ID = 'mapbox-traffic'
const OFFICIAL_TRAFFIC_LAYER_ID = 'km-official-traffic'

export const useMapboxLayers = (heatmapBoost: number) => {

    const updateSectorLayer = useCallback((map: any, sectorGeoJSON: any) => {
        if (!sectorGeoJSON) return
        if (!map.getSource(SECTOR_SOURCE_ID)) {
            map.addSource(SECTOR_SOURCE_ID, { type: 'geojson', data: sectorGeoJSON })
            map.addLayer({
                id: SECTOR_FILL_LAYER_ID, type: 'fill', source: SECTOR_SOURCE_ID,
                paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.08 }
            })
            map.addLayer({
                id: SECTOR_LINE_LAYER_ID, type: 'line', source: SECTOR_SOURCE_ID,
                paint: { 'line-color': '#2563eb', 'line-width': 2 }
            })
        } else {
            map.getSource(SECTOR_SOURCE_ID).setData(sectorGeoJSON)
        }
    }, [])

    const toggleOfficialTraffic = useCallback((map: any, visible: boolean) => {
        if (!map) return
        if (!map.getSource(OFFICIAL_TRAFFIC_SOURCE_ID)) {
            map.addSource(OFFICIAL_TRAFFIC_SOURCE_ID, {
                type: 'vector',
                url: 'mapbox://mapbox.mapbox-traffic-v1'
            })
            map.addLayer({
                id: OFFICIAL_TRAFFIC_LAYER_ID,
                type: 'line',
                source: OFFICIAL_TRAFFIC_SOURCE_ID,
                'source-layer': 'traffic',
                paint: {
                    'line-width': [
                        'interpolate', ['linear'], ['zoom'],
                        12, 1,
                        16, 4
                    ],
                    'line-color': [
                        'match', ['get', 'congestion'],
                        'low', '#4ade80',
                        'moderate', '#f5c518',
                        'heavy', '#ff7b00',
                        'severe', '#ff0000',
                        '#94a3b8'
                    ]
                }
            })
        }
        if (map.getLayer(OFFICIAL_TRAFFIC_LAYER_ID)) {
            map.setLayoutProperty(OFFICIAL_TRAFFIC_LAYER_ID, 'visibility', visible ? 'visible' : 'none')
        }
    }, [])

    const updateTrafficLayers = useCallback((map: any, points: any[], mode: string) => {
        const geojson = {
            type: 'FeatureCollection',
            features: points.map(p => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: p.coordinates },
                properties: {
                    severity: p.severity,
                    weight: p.severity === 'critical' ? 1.2 : p.severity === 'high' ? 0.8 : 0.3
                }
            }))
        }

        if (!map.getSource(SOURCE_ID)) {
            map.addSource(SOURCE_ID, { type: 'geojson', data: geojson })
            map.addLayer({
                id: HEATMAP_LAYER_ID, type: 'heatmap', source: SOURCE_ID,
                paint: {
                    'heatmap-weight': ['get', 'weight'],
                    'heatmap-intensity': 1.0 * heatmapBoost,
                    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 8 * heatmapBoost, 15, 20 * heatmapBoost],
                    'heatmap-color': [
                        'interpolate', ['linear'], ['heatmap-density'],
                        0, 'rgba(0, 255, 0, 0)',
                        0.2, 'rgba(0, 255, 0, 0.1)',
                        0.5, 'rgba(255, 166, 0, 0.7)',
                        0.8, 'rgba(255, 0, 0, 0.9)',
                        1, 'rgba(128, 0, 0, 1)'
                    ]
                }
            })
        } else {
            map.getSource(SOURCE_ID).setData(geojson)
        }

        const isHeatmapVisible = mode === 'heatmap' || mode === 'combined'
        map.setLayoutProperty(HEATMAP_LAYER_ID, 'visibility', isHeatmapVisible ? 'visible' : 'none')
    }, [heatmapBoost])

    const updateSegmentLayer = useCallback((map: any, segments: any[], filterSeverity: string[]) => {
        const features = segments.map(seg => ({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: seg.coordinates },
            properties: {
                severity: getTrafficSeverity(seg.congestion),
                congestion: seg.congestion,
                speed: seg.speed
            }
        })).filter(f => filterSeverity.includes(f.properties.severity))

        const geojson = { type: 'FeatureCollection', features }

        if (!map.getSource(SEGMENT_SOURCE_ID)) {
            map.addSource(SEGMENT_SOURCE_ID, { type: 'geojson', data: geojson })
            map.addLayer({
                id: SEGMENT_LAYER_ID, type: 'line', source: SEGMENT_SOURCE_ID,
                paint: {
                    'line-color': ['match', ['get', 'severity'], 'critical', '#ff0000', 'high', '#ff7b00', 'medium', '#f5c518', '#4ade80'],
                    'line-width': ['interpolate', ['linear'], ['zoom'], 10, 2, 15, 6],
                    'line-opacity': 0.8
                }
            })
        } else {
            map.getSource(SEGMENT_SOURCE_ID).setData(geojson)
        }
    }, [])

    return { updateSectorLayer, updateTrafficLayers, updateSegmentLayer, toggleOfficialTraffic }
}
