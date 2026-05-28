/**
 * Геометрические утилиты для работы с координатами и полигонами
 */

export interface Coordinates {
    lat: number;
    lng: number;
}

export interface Polygon {
    points: Coordinates[];
}

export interface DeliveryZone {
    id: string;
    name: string;
    polygon: Coordinates[];
    hub?: Coordinates;
    divisionId?: string;
}

/**
 * Проверяет, находится ли точка внутри полигона (Ray Casting Algorithm)
 */
export function isPointInPolygon(point: Coordinates, polygon: Coordinates[]): boolean {
    let inside = false;
    const x = point.lng;
    const y = point.lat;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lng;
        const yi = polygon[i].lat;
        const xj = polygon[j].lng;
        const yj = polygon[j].lat;

        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }

    return inside;
}

/**
 * Вычисляет расстояние между двумя точками (Haversine formula)
 * @returns расстояние в метрах
 */
export function calculateDistance(point1: Coordinates, point2: Coordinates): number {
    const R = 6371e3; // Радиус Земли в метрах
    const φ1 = (point1.lat * Math.PI) / 180;
    const φ2 = (point2.lat * Math.PI) / 180;
    const Δφ = ((point2.lat - point1.lat) * Math.PI) / 180;
    const Δλ = ((point2.lng - point1.lng) * Math.PI) / 180;

    const a =
        Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
}

/**
 * Находит ближайшую точку на границе полигона к заданной точке
 */
export function findNearestPointOnPolygon(point: Coordinates, polygon: Coordinates[]): Coordinates {
    let nearestPoint: Coordinates = polygon[0];
    let minDistance = Infinity;

    for (let i = 0; i < polygon.length; i++) {
        const j = (i + 1) % polygon.length;
        const closestPoint = closestPointOnSegment(point, polygon[i], polygon[j]);
        const distance = calculateDistance(point, closestPoint);

        if (distance < minDistance) {
            minDistance = distance;
            nearestPoint = closestPoint;
        }
    }

    return nearestPoint;
}

/**
 * Находит ближайшую точку на отрезке к заданной точке
 */
function closestPointOnSegment(
    point: Coordinates,
    segmentStart: Coordinates,
    segmentEnd: Coordinates
): Coordinates {
    const dx = segmentEnd.lng - segmentStart.lng;
    const dy = segmentEnd.lat - segmentStart.lat;

    if (dx === 0 && dy === 0) {
        return segmentStart;
    }

    const t = Math.max(
        0,
        Math.min(
            1,
            ((point.lng - segmentStart.lng) * dx + (point.lat - segmentStart.lat) * dy) / (dx * dx + dy * dy)
        )
    );

    return {
        lat: segmentStart.lat + t * dy,
        lng: segmentStart.lng + t * dx,
    };
}

/**
 * Вычисляет центр полигона (центроид)
 */
export function calculatePolygonCenter(polygon: Coordinates[]): Coordinates {
    let latSum = 0;
    let lngSum = 0;

    polygon.forEach((point) => {
        latSum += point.lat;
        lngSum += point.lng;
    });

    return {
        lat: latSum / polygon.length,
        lng: lngSum / polygon.length,
    };
}

/**
 * Проверяет валидность координат
 */
export function isValidCoordinates(coords: Coordinates | null | undefined): coords is Coordinates {
    return (
        coords !== null &&
        coords !== undefined &&
        typeof coords.lat === 'number' &&
        typeof coords.lng === 'number' &&
        !isNaN(coords.lat) &&
        !isNaN(coords.lng) &&
        coords.lat >= -90 &&
        coords.lat <= 90 &&
        coords.lng >= -180 &&
        coords.lng <= 180
    );
}

/**
 * Форматирует расстояние для отображения
 */
export function formatDistance(meters: number): string {
    if (meters < 1000) {
        return `${Math.round(meters)}м`;
    }
    return `${(meters / 1000).toFixed(1)}км`;
}
