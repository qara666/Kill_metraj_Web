/**
 * CourierIdMap — Служба для хранения соответствий ID курьеров их именам.
 * 
 * ПОЧЕМУ ЭТО НУЖНО: FastOperator API часто присылает заказы с пустым полем courier 
 * или только с ObjectId. Если мы один раз увидели имя для этого ID, мы должны 
 * его запомнить, чтобы заказ не стал "Неназначенным" при следующем обновлении.
 */

const STORAGE_KEY = 'km_courier_id_map';

export class CourierIdResolver {
    private static cache: Map<string, string> = new Map();
    private static isLoaded = false;

    private static load() {
        if (this.isLoaded) return;
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const data = JSON.parse(raw);
                Object.entries(data).forEach(([id, name]) => {
                    this.cache.set(id, String(name));
                });
            }
        } catch (e) {
            console.error('[CourierIdResolver] Failed to load cache:', e);
        }
        this.isLoaded = true;
    }

    private static save() {
        try {
            const data = Object.fromEntries(this.cache.entries());
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('[CourierIdResolver] Failed to save cache:', e);
        }
    }

    /**
     * Дает имя курьера по его ID (или возвращает null, если не найдено)
     */
    static resolve(id: string): string | null {
        if (!id) return null;
        this.load();
        const key = String(id).trim().toLowerCase();
        return this.cache.get(key) || null;
    }

    /**
     * Добавляет или обновляет соответствие ID -> Name
     */
    static register(id: string, name: string) {
        if (!id || !name) return;
        this.load();
        
        const key = String(id).trim().toLowerCase();
        // v5.132: Always store normalized name for consistent UI matching
        const normName = name.trim().replace(/\s+/g, ' ').toUpperCase();
        
        if (this.cache.get(key) !== normName) {
            this.cache.set(key, normName);
            this.save();
        }
    }

    /**
     * Пакетная регистрация из списка курьеров
     */
    static registerList(couriers: any[]) {
        if (!Array.isArray(couriers)) return;
        let changed = false;
        this.load();

        couriers.forEach(c => {
            const id = c._id || c.id;
            const name = c.name;
            if (id && name) {
                const key = String(id).toLowerCase();
                if (this.cache.get(key) !== name) {
                    this.cache.set(key, name);
                    changed = true;
                }
            }
        });

        if (changed) this.save();
    }
}
