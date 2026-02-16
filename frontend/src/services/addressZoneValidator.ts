import type { Order } from '../types';
import type { Coordinates, DeliveryZone } from '../utils/geoUtils';
import { isPointInPolygon, calculateDistance, findNearestPointOnPolygon, formatDistance } from '../utils/geoUtils';

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
}

// Singleton instance
let validatorInstance: AddressZoneValidator | null = null;

export function getAddressZoneValidator(): AddressZoneValidator {
    if (!validatorInstance) {
        validatorInstance = new AddressZoneValidator();
    }
    return validatorInstance;
}
