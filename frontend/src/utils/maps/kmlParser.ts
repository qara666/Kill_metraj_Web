/**
 * Utility to parse KML files exported from Google My Maps
 */

export interface KMLPolygon {
    name: string
    path: Array<{ lat: number; lng: number }>
    folderName: string
    color?: string
}

export interface KMLMarker {
    name: string
    lat: number
    lng: number
    folderName: string
}

export interface KMLData {
    polygons: KMLPolygon[]
    markers: KMLMarker[]
}

export const parseKML = (xmlString: string): KMLData => {
    const parser = new DOMParser()
    const xmlDoc = parser.parseFromString(xmlString, 'text/xml')

    const polygons: KMLPolygon[] = []
    const markers: KMLMarker[] = []

    const folders = xmlDoc.getElementsByTagName('Folder')

    // If no folders, check Document or top level Placemarks
    const processPlacemarks = (element: Element, folderName: string) => {
        const placemarks = element.getElementsByTagName('Placemark')
        for (let i = 0; i < placemarks.length; i++) {
            const pm = placemarks[i]
            const name = pm.getElementsByTagName('name')[0]?.textContent || 'Unnamed'

            // Check for Polygon
            const polygonNode = pm.getElementsByTagName('Polygon')[0]
            if (polygonNode) {
                const coordsStr = polygonNode.getElementsByTagName('coordinates')[0]?.textContent || ''
                const path = parseCoordinates(coordsStr)
                if (path.length > 0) {
                    polygons.push({ name, path, folderName })
                }
                continue
            }

            // Check for Point
            const pointNode = pm.getElementsByTagName('Point')[0]
            if (pointNode) {
                const coordsStr = pointNode.getElementsByTagName('coordinates')[0]?.textContent || ''
                const coords = parseCoordinates(coordsStr)
                if (coords.length > 0) {
                    markers.push({ name, lat: coords[0].lat, lng: coords[0].lng, folderName })
                }
            }
        }
    }

    if (folders.length > 0) {
        for (let i = 0; i < folders.length; i++) {
            const folder = folders[i]
            const folderName = folder.getElementsByTagName('name')[0]?.textContent || 'General'
            processPlacemarks(folder, folderName)
        }
    } else {
        processPlacemarks(xmlDoc.documentElement, 'General')
    }

    return { polygons, markers }
}

const parseCoordinates = (str: string): Array<{ lat: number; lng: number }> => {
    const result: Array<{ lat: number; lng: number }> = []
    const pairs = str.trim().split(/\s+/)

    for (const pair of pairs) {
        const parts = pair.split(',')
        if (parts.length >= 2) {
            const lng = parseFloat(parts[0])
            const lat = parseFloat(parts[1])
            if (!isNaN(lat) && !isNaN(lng)) {
                result.push({ lat, lng })
            }
        }
    }

    return result
}
