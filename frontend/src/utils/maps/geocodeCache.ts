/**
 * Постоянный кэш геокодирования с TTL 24ч.
 * Хранит результаты в localStorage для сохранения при перезагрузке страницы.
 * Дедуплицирует выполняющиеся запросы для одного и того же адреса.
 */

const STORAGE_KEY = 'geocode_cache_v1'
const TTL_MS = 24 * 60 * 60 * 1000 // 24 часа

// Ограничение: макс. одновременных вызовов Google API
const MAX_CONCURRENT = 5
// Задержка между пакетами (мс)
const BATCH_DELAY_MS = 100

export interface GeoPoint {
    lat: number
    lng: number
}

interface CacheEntry {
    lat: number
    lng: number
    expiresAt: number
}

type PersistentCache = Record<string, CacheEntry>

// Кэш в памяти для быстрых поисков и дедупликации выполняемых промисов
const memCache = new Map<string, GeoPoint>()
const inFlight = new Map<string, Promise<GeoPoint | null>>()

//  Помощники персистентности

function loadFromStorage(): PersistentCache {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        return raw ? JSON.parse(raw) : {}
    } catch {
        return {}
    }
}

function saveToStorage(cache: PersistentCache): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
    } catch {
        // localStorage переполнен? игнорируем молча
    }
}

/**
 * Удаляет записи старше 24ч из localStorage и прогревает memCache.
 * Вызывается автоматически при загрузке модуля.
 */
export function purgeExpiredGeocodeCache(): void {
    const now = Date.now()
    const stored = loadFromStorage()
    let changed = false

    for (const [key, entry] of Object.entries(stored)) {
        if (entry.expiresAt < now) {
            delete stored[key]
            changed = true
        } else {
            memCache.set(key, { lat: entry.lat, lng: entry.lng })
        }
    }

    if (changed) saveToStorage(stored)
}

function normKey(address: string): string {
    return address.trim().toLowerCase().replace(/\s+/g, ' ')
}

function writeEntry(key: string, point: GeoPoint): void {
    memCache.set(key, point)
    const stored = loadFromStorage()
    stored[key] = { ...point, expiresAt: Date.now() + TTL_MS }
    saveToStorage(stored)
}

import { API_URL } from '../../config/apiConfig'

async function rateLimitedFetch(url: string, init?: RequestInit): Promise<Response> {
    const proxyUrl = `${API_URL}/api/proxy/geocoding?url=${encodeURIComponent(url)}`;
    return fetch(proxyUrl, init);
}

async function geocodeViaFreeProvider(address: string): Promise<GeoPoint | null> {
    try {
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=1`
        const response = await rateLimitedFetch(url)
        const data = await response.json()
        
        if (data.features && data.features.length > 0) {
            const [lng, lat] = data.features[0].geometry.coordinates
            return { lat, lng }
        }
        
        // Финальный фолбэк на Nominatim
        const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`
        const nomRes = await rateLimitedFetch(nomUrl, { headers: { 'User-Agent': 'KillMetrajWeb/1.0' } })
        const nomData = await nomRes.json()
        
        if (nomData && nomData.length > 0) {
            return { 
                lat: parseFloat(nomData[0].lat), 
                lng: parseFloat(nomData[0].lon) 
            }
        }
    } catch (e) {
        console.warn('[geocodeCache] Free provider failed:', e)
    }
    return null
}

/**
 * Геокодирует один адрес.
 * Возвращает кэшированный результат при наличии (в памяти или localStorage),
 * иначе вызывает API геокодирования один раз.
 */
export async function getCachedGeocode(address: string): Promise<GeoPoint | null> {
    const key = normKey(address)

    // 1. Попадание в кэш памяти
    if (memCache.has(key)) return memCache.get(key)!

    // 2. Дедупликация выполняющегося запроса
    if (inFlight.has(key)) return inFlight.get(key)!

    // 3. Промах → вызываем API
    const promise = geocodeViaFreeProvider(address).then((point) => {
        inFlight.delete(key)
        if (point) writeEntry(key, point)
        return point
    })

    inFlight.set(key, promise)
    return promise
}

/**
 * Пакетное геокодирование нескольких адресов.
 * - Дедуплицирует одинаковые адреса
 * - Пропускает уже закэшированные
 * - Ограничивает MAX_CONCURRENT одновременных вызовов API с BATCH_DELAY между пакетами
 * - Возвращает Map<адрес, GeoPoint> для всех успешно геокодированных адресов
 */
export async function batchGeocode(
    addresses: string[]
): Promise<Map<string, GeoPoint>> {
    const result = new Map<string, GeoPoint>()
    const unique = [...new Set(addresses.map(normKey))]
    const missing: string[] = []

    // Сначала прогреваем из кэша
    for (const key of unique) {
        if (memCache.has(key)) {
            result.set(key, memCache.get(key)!)
        } else {
            missing.push(key)
        }
    }

    // Разбиваем на пакеты и геокодируем отсутствующие адреса с ограничением частоты
    for (let i = 0; i < missing.length; i += MAX_CONCURRENT) {
        const chunk = missing.slice(i, i + MAX_CONCURRENT)

        const points = await Promise.all(chunk.map(getCachedGeocode))

        chunk.forEach((key, idx) => {
            const point = points[idx]
            if (point) result.set(key, point)
        })

        // Небольшая задержка между пакетами для избежания rate-limiting
        if (i + MAX_CONCURRENT < missing.length) {
            await new Promise((r) => setTimeout(r, BATCH_DELAY_MS))
        }
    }

    return result
}

// Автоочистка при загрузке модуля
purgeExpiredGeocodeCache()
