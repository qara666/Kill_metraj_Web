/**
 * Утилита нормализации адресов — Продакшн-класс для украинских адресов
 *
 * Обрабатывает сложные форматы адресов, такие как:
 *   "Київ, вул. Левка Лук'яненка (Маршала Тимошенка), 15г, під.2, д/ф моб, эт.16, кв.0"
 */

const ADDR_REPLACEMENTS: [RegExp, string][] = [
    // 0. Частые опечатки и ошибки OCR (добавить ДО других замен)
    [/\bЛевка\s+Лук.?яненка\b/gi, 'Левка Лук\'яненка'],
    [/\bЛевка\s+Лук\.?яненка\b/gi, 'Левка Лук\'яненка'],
    [/\bЛевка\s+Лук\'?яненка\b/gi, 'Левка Лук\'яненка'],
    [/\bЛевка\s+Лук[^\w]?яненка\b/gi, 'Левка Лук\'яненка'],
    [/\bМаршала\s+Тимошенка\b/gi, 'Маршала Тимошенка'],
    [/\bпросп\.?\s+Визволителів\b/gi, 'проспект Визволителів'],
    [/\bпросп\.?\s+Победы\b/gi, 'проспект Победы'],
    [/\bпросп\.?\s+Перемоги\b/gi, 'проспект Перемоги'],
    [/\bпр-т\.?\s+Визволителів\b/gi, 'проспект Визволителів'],
    [/\bпр-т\.?\s+Победы\b/gi, 'проспект Победы'],
    [/\bпр-т\.?\s+Перемоги\b/gi, 'проспект Перемоги'],
    
    // 1. Пунктуация и спецсимволы (апострофы оставляем для последующего удаления без пробела)
    [/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' '],
    
    // 2. Унификация апострофов и очистка других кавычек
    // Удаляем апострофы БЕЗ добавления пробелов (лук'яненка -> лукяненка)
    [/[’'ʼ`]/g, ''],
    [/[«»"]/g, ''],
    
    // 3. Удаление технических разделителей (підʼїзд, этаж, квартира и т.д.)
    // Примечание: 'дом' и 'д' НЕ удаляются здесь, так как они часто предшествуют номеру дома.
    [/(?:^|\s)(корп|корпус|pod|підʼїзд|підʼїзд|подъезд|эт|этаж|кв|квартира|оф|офис|офіс|вход|вхід|секция|літера|літ|литера|д\s*ф|моб|під|под|кв|эт)(?:\s*\d*)(?=\s|$)/gi, ' '],
    
    // 4. Удаление префиксов типа улицы (добавлены английские 'street', 'st', 'avenue', 'ave')
    [/(?:^|\s)(вул|ул|вулиця|улица|пр|просп|проспект|пр-т|пров|пер|пер-к|провулок|переулок|блв|бульвар|шосе|шоссе|набережна|набережная|пл|площа|площадь|тупик|узвіз|спуск|street|st|avenue|ave|жк|б-р|пл|м-н|майдан|дорога|ст|стр|строение)(?=\s|$)/gi, ' '],
    
    // 5. Удаление города/страны и сокращений
    [/(?:^|\s)(київ|киев|украина|україна|ua|ukraine|г\.?|м\.?|смт|пгт|село|с\.)(?=\s|$)/gi, ' '],
    
    // 6. Схлопывание множественных пробелов
    [/\s{2,}/g, ' '],
];


/**
 * Карта транслитерации украинских/русских имен в латиницу.
 */
const TRANS_MAP: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'h', 'ґ': 'g', 'д': 'd', 'е': 'e', 'є': 'ye', 'ж': 'zh', 'з': 'z',
    'и': 'y', 'і': 'i', 'ї': 'yi', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p',
    'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
    'ь': '', 'ы': 'y', 'ё': 'yo', 'э': 'e', 'ю': 'yu', 'я': 'ya', 'ʼ': "'", '`': "'"
};

/**
 * Базовая транслитерация из кириллицы в латиницу.
 */
export function transliterate(text: string): string {
    return text.toLowerCase().split('').map(char => TRANS_MAP[char] || char).join('');
}

/**
 * Славянская/Универсальная нормализация.
 * 
 * 1. Транслитерирует всё в латиницу.
 * 2. Схлопывает похожие гласные (y/i/e/u).
 * 3. Удаляет шумовые символы.
 * 
 * Цель: "Стуса" (ua) и "Stusa" (en) -> "stusa"
 *       "Берестейський" (ua) и "Beresteiskyi" (en) -> "beresteisky"
 */
export function slavicNormalize(text: string): string {
    if (!text) return '';
    
    // Шаг 1: Ручные исправления частых вариаций двойных гласных
    let n = text.toLowerCase()
        .replace(/йии/g, 'i')
        .replace(/иий/g, 'i')
        .replace(/ійй/g, 'i')
        .replace(/йи/g, 'i')
        .replace(/ий/g, 'i')
        .replace(/ій/g, 'i')
        .replace(/[иыіі]/g, 'i')
        .replace(/[єёэ]/g, 'e')
        .replace(/й/g, 'i')
        .replace(/ю/g, 'yu')
        .replace(/я/g, 'ya');

    // Шаг 2: Транслитерация в латиницу
    n = transliterate(n);

    // Шаг 3: Нормализация латинских гласных для устранения расхождений "y" vs "i"
    n = n.replace(/[yi]+/g, 'i')
         .replace(/[gh]/g, 'h') // v35.9.4: bridge g vs h (bogoliubova -> boholiubova)
         .replace(/e+/g, 'e')
         .replace(/shch/g, 'sh') // simplified comparison
         .replace(/kh/g, 'h')
         .replace(/ks/g, 'x')
         .replace(/ja/g, 'ya')
         .replace(/j/g, 'i') // catch all J
         .replace(/yu/g, 'u') // bridge yu vs u (bogoliubova -> boholiubova match)
         .replace(/ya/g, 'a');

    // Шаг 4: Финальная очистка
    return n.replace(/[^a-z0-9]/g, '');
}

/**
 * Normalizes an address string for caching purposes (L1/L2 keys).
 * Goal: "вул. Ленина, 5, під. 1, эт. 2" -> "ленина 5"
 */
export function normalizeAddress(address: string): string {
    if (!address) return '';

    let normalized = address.toLowerCase();
    for (const [regex, replacement] of ADDR_REPLACEMENTS) {
        normalized = normalized.replace(regex, replacement);
    }

    return normalized.trim();
}

/**
 * Detect if a parenthetical string is a street/area name (as opposed to an apartment note).
 * Returns true for things like "(Гавро)", "(Маршала Тимошенка)" but not "(д/ф моб)" or "(кв.14)".
 */
function isStreetParenthetical(inner: string): boolean {
    if (!inner || inner.length < 3) return false;
    // Reject pure numbers
    if (/^\d+$/.test(inner)) return false;
    // Отклоняем, если начинается с известной технической аббревиатуры (с границей слова)
    if (/^(д\/ф|моб|кв|квартира|під|под|эт|этаж|корп|літера|літ|литера|офис|оф|вход|дверь|\d)\b/i.test(inner)) return false;
    // Должен содержать кириллический текст (названия улиц — на кириллице)
    return /[а-яёіїєґА-ЯІЇЄҐ]/.test(inner);
}

/**
 * Extract alternative/old street name from parenthetical in Ukrainian addresses.
 * e.g. "вул. Йорданська (Гавро), 24б" → "Гавро"
 * e.g. "просп. Європейського Союзу (Правди), 78" → "Правди"
 */
export function extractParentheticalStreetName(address: string): string | null {
    if (!address) return null;
    const matches = address.match(/\(([^)]+)\)/g);
    if (!matches) return null;
    for (const match of matches) {
        const inner = match.slice(1, -1).trim();
        if (isStreetParenthetical(inner)) return inner;
    }
    return null;
}

/**
 * Extract the meaningful part of a Ukrainian address for geocoder queries.
 *
 * Input:  "Київ, вул. Левка Лук'яненка (Маршала Тимошенка), 15г, під.2, д/ф моб, эт.16, кв.0"
 * Output: "вул. Левка Лук'яненка, 15г"
 *
 * Algorithm:
 *   1. Strip leading city name "Київ, "
 *   2. Strip technical parentheticals (кв, д/ф, под) but KEEP street-name parentheticals for variant generation
 *   3. Detect house number (digits + optional letters)
 *   4. Drop EVERYTHING after the house number
 */
export function cleanAddressForSearch(address: string): string {
    if (!address) return '';
    let cleaned = address.trim();

    // Step 0: Ensure space after comma if it precedes a number
    cleaned = cleaned.replace(/,(\d)/g, ', $1');

    // Step 1: Remove leading city prefix (extended with просп., наб., вул. variants)
    cleaned = cleaned.replace(/^(?:місто\s+|город\s+|м\.?\s*|г\.?\s*)?(?:київ|киев|kyiv|kiev|харків|харьков|дніпро|ужгород|одеса|одесса|львів|львов|бровари|бровары|бориспіль|борисполь|ірпінь|ирпень|буча|вишневе|вишневое|полтава|суми|суми|хмельницький|миколаїв|просп|наб)\s*,\s*/i, '');

    // Шаг 2: Умное удаление скобок:
    // - Удаляем ТЕХНИЧЕСКИЕ скобки (квартира, подъезд и т.д.)
    // - ЗАМЕНЯЕМ ВСТРОЕННЫЕ скобки с названием улицы (старое название) на пробел,
    //   чтобы основное имя использовалось для основного запроса. Альтернативное имя извлекается
    //   отдельно через extractParentheticalStreetName() для генерации вариантов.
    cleaned = cleaned.replace(/\s*\([^)]*\)/g, '').trim();

    // Step 3: Identify the house number and cut EVERYTHING after it.
    // House number can be like "15", "15а", "15/3", "15-Б", "15 Б"
    const houseRegex = /(\d+[а-яієґa-z]*(?:\s?[\/\-]\s?\d*[а-яієґa-z]*)?)/i;
    const parts = cleaned.split(/,\s*/);
    
    let result = '';
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i].trim();
        const match = part.match(houseRegex);
        if (match) {
            const houseStr = match[0];
            const houseEndIndex = part.indexOf(houseStr) + houseStr.length;
            const cleanPart = part.substring(0, houseEndIndex).trim();
            
            result = [...parts.slice(0, i), cleanPart].join(', ');
            break;
        }
    }

    // Шаг 4: Рекурсивное удаление суффиксов (Финальная очистка)
    const TechnicalLabels = 'корп|корпус|під|под|підʼїзд|подъезд|эт|этаж|кв|квартира|оф|офіс|офис|вход|вхід|секція|секция|літера|літ|литера|д[\\s.\\/\\-]*ф|дф|моб|подзвони|звони|дзвони|call';
    
    const spacedSuffix = new RegExp(`(?:,|\\s)\\s*(?:${TechnicalLabels}).*$`, 'iu');
    const stuckSuffix = new RegExp(`(\\d)(?:${TechnicalLabels}).*$`, 'iu');
    const postalRegex = /(?:,|\s)\s*\d{4,5}\b.*$/;
    // Also strip phone numbers (10+ digits)
    const phoneRegex = /[\s,]+[\d\-+()\s]{10,}.*$/;

    let last: string;
    do {
        last = cleaned;
        cleaned = cleaned.replace(spacedSuffix, '')
                         .replace(stuckSuffix, '$1')
                         .replace(postalRegex, '')
                         .replace(phoneRegex, '');
    } while (cleaned !== last);

    // Финальная очистка: удаляем хвостовые запятые/пробелы, тире и т.д.
    return cleaned.replace(/[, \-]+$/, '').replace(/\s{2,}/g, ' ').trim();
}
