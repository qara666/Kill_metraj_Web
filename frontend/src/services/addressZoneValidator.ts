import type { Order } from '../types';
import type { Coordinates, DeliveryZone } from '../utils/geoUtils';
import { isPointInPolygon, calculateDistance, findNearestPointOnPolygon, formatDistance } from '../utils/geoUtils';
import { GeocodingService } from './geocodingService';

export interface AddressSuggestion {
    address: string;
    coords: Coordinates;
    confidence: number; // 0-100
    reason: string;
    zone: DeliveryZone;
    distanceFromOriginal: number; // в метрах
    isHistorical?: boolean;
    metadata?: {
        source: 'nearest_point' | 'similar_address' | 'historical' | 'manual';
        googlePlaceId?: string;
    };
}

export interface ValidationResult {
    isValid: boolean;
    matchedZone?: DeliveryZone;
    distanceToNearestZone?: number;
    suggestedCorrections?: AddressSuggestion[];
    error?: string;
}

/**
 * Сервис для валидации адресов и генерации умных предложений
 */
export class AddressZoneValidator {
    private zones: DeliveryZone[] = [];
    private confidenceThreshold: number = 90;

    constructor(zones: DeliveryZone[] = []) {
        this.zones = zones;
    }

    /**
     * Обновляет список зон доставки
     */
    setZones(zones: DeliveryZone[]): void {
        this.zones = zones;
    }

    /**
     * Устанавливает порог уверенности для автоматической коррекции
     */
    setConfidenceThreshold(threshold: number): void {
        this.confidenceThreshold = Math.max(0, Math.min(100, threshold));
    }

    /**
     * Валидирует адрес и возвращает результат с предложениями
     */
    async validateAddress(
        address: string,
        coords: Coordinates | null,
        order?: Order
    ): Promise<ValidationResult> {
        // Проверка наличия координат
        if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
            return {
                isValid: false,
                error: 'Не удалось определить координаты адреса',
            };
        }

        // Проверка наличия зон
        if (this.zones.length === 0) {
            console.warn('[AddressZoneValidator] No delivery zones configured');
            return {
                isValid: true, // Если зоны не настроены, считаем адрес валидным
            };
        }

        // Проверяем, попадает ли точка в какую-либо зону
        const matchedZone = this.zones.find((zone) => isPointInPolygon(coords, zone.polygon));

        if (matchedZone) {
            return {
                isValid: true,
                matchedZone,
            };
        }

        // Адрес вне зоны - генерируем предложения
        const suggestions = await this.generateSuggestions(address, coords, order);
        const nearestZone = this.findNearestZone(coords);
        const distanceToNearestZone = nearestZone
            ? calculateDistance(coords, nearestZone.hub || nearestZone.polygon[0])
            : undefined;

        return {
            isValid: false,
            distanceToNearestZone,
            suggestedCorrections: suggestions,
        };
    }

    /**
     * Генерирует умные предложения для коррекции адреса
     */
    private async generateSuggestions(
        address: string,
        coords: Coordinates,
        order?: Order
    ): Promise<AddressSuggestion[]> {
        const suggestions: AddressSuggestion[] = [];

        // Стратегия 1: Исторические данные клиента
        if (order?.phone) {
            const historicalSuggestions = await this.getHistoricalAddresses(order.phone, coords);
            suggestions.push(...historicalSuggestions);
        }

        // Стратегия 2: Ближайшая точка в зоне
        const nearestPointSuggestions = this.getNearestPointInZone(coords, address);
        suggestions.push(...nearestPointSuggestions);

        // Стратегия 3: Похожие адреса (будет реализовано позже с Google Places API)
        // const similarAddresses = await this.findSimilarAddresses(address, coords);
        // suggestions.push(...similarAddresses);

        // Сортируем по уверенности
        return suggestions.sort((a, b) => b.confidence - a.confidence);
    }

    /**
     * Находит ближайшую зону к точке
     */
    private findNearestZone(coords: Coordinates): DeliveryZone | null {
        if (this.zones.length === 0) return null;

        let nearestZone = this.zones[0];
        let minDistance = Infinity;

        this.zones.forEach((zone) => {
            const zoneCenter = zone.hub || zone.polygon[0];
            const distance = calculateDistance(coords, zoneCenter);
            if (distance < minDistance) {
                minDistance = distance;
                nearestZone = zone;
            }
        });

        return nearestZone;
    }

    /**
     * Генерирует предложение на основе ближайшей точки в зоне
     */
    private getNearestPointInZone(originalCoords: Coordinates, originalAddress: string): AddressSuggestion[] {
        const suggestions: AddressSuggestion[] = [];

        this.zones.forEach((zone) => {
            const nearestPoint = findNearestPointOnPolygon(originalCoords, zone.polygon);
            const distance = calculateDistance(originalCoords, nearestPoint);

            // Генерируем адрес для ближайшей точки (упрощенно)
            const suggestedAddress = this.generateAddressForPoint(nearestPoint, originalAddress);

            // Уверенность зависит от расстояния: чем ближе, тем выше
            // 100% если <100м, 50% если 1км, 0% если >5км
            const confidence = Math.max(0, Math.min(100, 100 - (distance / 50)));

            if (confidence > 20) {
                // Показываем только разумные варианты
                suggestions.push({
                    address: suggestedAddress,
                    coords: nearestPoint,
                    confidence: Math.round(confidence),
                    reason: `Ближайшая точка в зоне "${zone.name}"`,
                    zone,
                    distanceFromOriginal: Math.round(distance),
                    metadata: {
                        source: 'nearest_point',
                    },
                });
            }
        });

        return suggestions;
    }

    /**
     * Получает исторические адреса клиента (заглушка, будет реализовано с бэкендом)
     */
    private async getHistoricalAddresses(
        _phone: string,
        _currentCoords: Coordinates
    ): Promise<AddressSuggestion[]> {
        // TODO: Реализовать запрос к бэкенду
        // const response = await fetch(`/api/customers/${phone}/addresses`);
        // const historicalAddresses = await response.json();

        // Пока возвращаем пустой массив
        return [];
    }

    /**
     * Генерирует адрес для точки (упрощенная версия)
     */
    private generateAddressForPoint(coords: Coordinates, originalAddress: string): string {
        // Пытаемся сохранить структуру оригинального адреса
        // В реальности здесь будет reverse geocoding через Google Maps API
        const parts = originalAddress.split(',');
        if (parts.length > 0) {
            return `${parts[0]} (скорректировано)`;
        }
        return `Координаты: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
    }

    /**
     * Проверяет, можно ли применить коррекцию автоматически
     */
    canAutoCorrect(suggestion: AddressSuggestion): boolean {
        return suggestion.confidence >= this.confidenceThreshold;
    }

    /**
     * Форматирует расстояние для отображения
     */
    formatDistance(meters: number): string {
        return formatDistance(meters);
    }

    /**
     * Пытается найти лучший вариант адреса среди зон (Disambiguation)
     * SOTA 4.3: Улучшенная система скоринга с экспоненциальным штрафом за расстояние
     * и жёстким блокировщиком технических зон.
     */
    async findBestMatchInZones(
        address: string,
        preferredZones: DeliveryZone[],
        options: { contextCoords?: Coordinates[]; primaryCity?: string } = {}
    ): Promise<{ bestMatch: AddressSuggestion | null; alternatives: AddressSuggestion[] }> {
        if (!preferredZones || preferredZones.length === 0) return { bestMatch: null, alternatives: [] };

        const allCandidates: { result: any; score: number; zone: DeliveryZone | null; debugInfo: string }[] = [];
        const routePoints = options.contextCoords || [];

        // Helper: nearest distance from a point to any of the route's existing coords
        const nearestRouteDistance = (coords: Coordinates): number => {
            if (routePoints.length === 0) return 0;
            let minDist = Infinity;
            for (const pt of routePoints) {
                const d = calculateDistance(coords, pt);
                if (d < minDist) minDist = d;
            }
            return minDist; // in meters
        };

        // Helper: is this zone a technical/auto-unloading zone?
        const isTechnicalZone = (zone: DeliveryZone | null): boolean => {
            if (!zone) return false;
            const name = zone.name.toLowerCase();
            return name.includes('авторозвантаження') ||
                name.includes('авторазгрузка') ||
                name.includes('разгрузка') ||
                name.includes('склад') ||
                name.includes('depot');
        };

        // 1. Собираем кандидатов из разных вариантов поиска
        const searchVariants = [address];
        const cityNames = new Set<string>();
        preferredZones.forEach(z => {
            if (z.name.toLowerCase().includes('киев') || z.name.toLowerCase().includes('київ')) cityNames.add('Киев');
            if (z.name.toLowerCase().includes('харьков') || z.name.toLowerCase().includes('харків')) cityNames.add('Харьков');
        });
        cityNames.forEach(city => {
            if (!address.toLowerCase().includes(city.toLowerCase())) {
                searchVariants.push(`${address}, ${city}, Украина`);
            }
        });

        // Use the centroid only for biasing the geocoding API bounds request
        const centroid = routePoints.length > 0 ? this.calculateCentroid(routePoints) : null;

        for (const variant of searchVariants) {
            const geocodingOptions = centroid ? { bounds: this.createBoundsAroundPoint(centroid, 30000) } : {};
            const results = await GeocodingService.geocodeAddressMulti(variant, geocodingOptions);

            for (const result of results) {
                if (!result.success || !result.latitude || !result.longitude) continue;

                const coords = { lat: result.latitude, lng: result.longitude };
                const matchedZone = this.zones.find(z => isPointInPolygon(coords, z.polygon));

                let score = 0;
                const debugParts: string[] = [];

                // ── Zone scoring ──────────────────────────────────────────────

                if (matchedZone) {
                    score += 80;
                    debugParts.push('zone:+80');

                    // Preferred zone bonus
                    const isPreferred = preferredZones.some(pz => pz.id === matchedZone.id || pz.name === matchedZone.name);
                    if (isPreferred) {
                        score += 60;
                        debugParts.push('preferred:+60');
                    }

                    // HARD BLOCKER for technical/auto-unloading zones
                    // Penalty is so large that a technical zone can NEVER beat a proper zone
                    if (isTechnicalZone(matchedZone)) {
                        score -= 200;
                        debugParts.push('technical:-200');
                    }
                }

                // ── Geocoding accuracy bonus ──────────────────────────────────
                if (result.locationType === 'ROOFTOP') {
                    score += 40;
                    debugParts.push('rooftop:+40');
                } else if (result.locationType === 'RANGE_INTERPOLATED') {
                    score += 20;
                    debugParts.push('interpolated:+20');
                }

                // ── Proximity to route: exponential penalty ──────────────────
                // Uses nearest neighbor (not centroid) so even spread-out routes work correctly.
                if (routePoints.length > 0) {
                    const distMeters = nearestRouteDistance(coords);
                    const distKm = distMeters / 1000;

                    if (distKm > 15) {
                        // Hard outlier: >15km from the nearest point on the route
                        score -= 150;
                        debugParts.push(`outlier(${distKm.toFixed(1)}km):-150`);
                    } else if (distKm > 3) {
                        // Exponential penalty: grows fast once we're more than 3km away
                        // At 5km: -22, at 8km: -58, at 12km: -108
                        const penalty = Math.round(distKm * distKm * 1.5);
                        score -= penalty;
                        debugParts.push(`dist(${distKm.toFixed(1)}km):-${penalty}`);
                    } else {
                        // Within 3km: small linear deduction, irrelevant
                        const penalty = Math.round(distKm * 2);
                        score -= penalty;
                        debugParts.push(`near(${distKm.toFixed(1)}km):-${penalty}`);
                    }
                }

                // ── City match bonus ──────────────────────────────────────────
                if (options.primaryCity && result.formattedAddress.toLowerCase().includes(options.primaryCity.toLowerCase())) {
                    score += 30;
                    debugParts.push('city:+30');
                }

                const debugInfo = `[${debugParts.join('|')}] = ${score}`;
                console.debug(`[AddressZoneValidator] "${result.formattedAddress}" | Zone: ${matchedZone?.name || 'none'} | Score: ${debugInfo}`);

                allCandidates.push({ result, score, zone: matchedZone || null, debugInfo });
            }
        }

        if (allCandidates.length === 0) return { bestMatch: null, alternatives: [] };

        // Sort by score descending
        allCandidates.sort((a, b) => b.score - a.score);

        // Convert to AddressSuggestion array, filtering out very low quality results
        const suggestions: AddressSuggestion[] = allCandidates
            .filter(c => c.score > -50) // allow even slightly negative if it's the only option
            .map(c => ({
                address: c.result.formattedAddress,
                coords: { lat: c.result.latitude!, lng: c.result.longitude! },
                confidence: Math.min(100, Math.max(0, c.score)),
                reason: c.debugInfo,
                zone: c.zone!,
                distanceFromOriginal: 0,
                metadata: { source: 'similar_address' as const }
            }));

        if (suggestions.length === 0) return { bestMatch: null, alternatives: [] };

        const topCandidate = suggestions[0];
        const isTopTechnical = isTechnicalZone(topCandidate.zone);

        // If top is a technical zone AND there are non-technical alternatives → force disambiguation
        if (isTopTechnical) {
            return { bestMatch: null, alternatives: suggestions };
        }

        // If top and second are within 30 points of each other → show disambiguation to user
        const runnerUp = suggestions[1];
        if (runnerUp && Math.abs(topCandidate.confidence - runnerUp.confidence) <= 30) {
            return { bestMatch: null, alternatives: suggestions };
        }

        // Clear winner
        return { bestMatch: topCandidate, alternatives: suggestions };
    }

    private calculateCentroid(coords: Coordinates[]): Coordinates {
        let sumLat = 0;
        let sumLng = 0;
        coords.forEach(c => {
            sumLat += c.lat;
            sumLng += c.lng;
        });
        return { lat: sumLat / coords.length, lng: sumLng / coords.length };
    }

    private createBoundsAroundPoint(center: Coordinates, radiusMeters: number): any {
        // Упрощенный расчет bounds (примерно 0.01 градуса ~ 1.1км)
        const offset = radiusMeters / 111320;
        return {
            north: center.lat + offset,
            south: center.lat - offset,
            east: center.lng + offset / Math.cos(center.lat * (Math.PI / 180)),
            west: center.lng - offset / Math.cos(center.lat * (Math.PI / 180))
        };
    }
}

// Singleton instance
let validatorInstance: AddressZoneValidator | null = null;

export function getAddressZoneValidator(): AddressZoneValidator {
    if (!validatorInstance) {
        validatorInstance = new AddressZoneValidator();
    }
    return validatorInstance;
}
