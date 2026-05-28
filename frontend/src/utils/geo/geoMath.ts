export interface Coordinates {
    lat: number;
    lng: number;
}

export const toRadians = (deg: number): number => (deg * Math.PI) / 180;
export const toDegrees = (rad: number): number => (rad * 180) / Math.PI;

export const normalizeAngle = (angle: number): number => {
    const normalized = angle % 360;
    return normalized < 0 ? normalized + 360 : normalized;
};

export const bearingBetween = (from: Coordinates | null, to: Coordinates | null): number | null => {
    if (!from || !to) return null;
    const lat1 = toRadians(from.lat);
    const lat2 = toRadians(to.lat);
    const dLon = toRadians(to.lng - from.lng);
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    if (x === 0 && y === 0) return null;
    return normalizeAngle(toDegrees(Math.atan2(y, x)));
};

export const circularAverage = (bearings: number[]): number | null => {
    if (bearings.length === 0) return null;
    let sumSin = 0;
    let sumCos = 0;
    for (const bearing of bearings) {
        const rad = toRadians(bearing);
        sumSin += Math.sin(rad);
        sumCos += Math.cos(rad);
    }
    if (sumSin === 0 && sumCos === 0) return null;
    return normalizeAngle(toDegrees(Math.atan2(sumSin, sumCos)));
};

export const angularDifference = (a: number, b: number): number => {
    const diff = Math.abs(a - b) % 360;
    return diff > 180 ? 360 - diff : diff;
};

export const haversineDistance = (p1: Coordinates, p2: Coordinates): number => {
    const R = 6371; // Earth radius in km
    const dLat = toRadians(p2.lat - p1.lat);
    const dLon = toRadians(p2.lng - p1.lng);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRadians(p1.lat)) * Math.cos(toRadians(p2.lat)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

/**
 * Checks if a point is inside a polygon using the Ray-casting algorithm.
 * @param point The point to check.
 * @param polygon An array of coordinates defining the polygon.
 */
export const isPointInPolygon = (point: Coordinates, polygon: Coordinates[]): boolean => {
    let x = point.lat, y = point.lng;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        let xi = polygon[i].lat, yi = polygon[i].lng;
        let xj = polygon[j].lat, yj = polygon[j].lng;

        let intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
};
