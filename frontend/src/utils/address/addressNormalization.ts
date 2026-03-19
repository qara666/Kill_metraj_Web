/**
 * Address Normalization Utility - Production Grade for Ukrainian Addresses
 *
 * Handles complex address formats like:
 *   "Київ, вул. Левка Лук'яненка (Маршала Тимошенка), 15г, під.2, д/ф моб, эт.16, кв.0"
 */

const ADDR_REPLACEMENTS: [RegExp, string][] = [
    // 1. Punctuation and special chars (unifies d/f, Luk'yanenka, etc.)
    // v35.9.25: Excluded apostrophe (') from punctuation stripping to keep names like Luk'yanenka together
    [/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, ' '],

    // 2. Unify apostrophes and cleanup other quotes
    [/[ʼ`]/g, "'"], 
    [/[«»"]/g, ''],

    // 3. Remove technical separators (підʼїзд, этаж, квартира, etc.)
    // Note: 'дом' and 'д' are NOT removed here because they often prefix the house number.
    [/(?:^|\s)(корп|корпус|pod|підʼїзд|підʼїзд|подъезд|эт|этаж|кв|квартира|оф|офис|офіс|вход|вхід|секция|літера|літ|литера|д\s*ф|моб)(?:\s*\d*)(?=\s|$)/gi, ' '],

    // 4. Remove street type prefixes (added English 'street', 'st', 'avenue', 'ave')
    [/(?:^|\s)(вул|ул|вулиця|улица|пр|просп|проспект|пр-т|пров|пер|пер-к|провулок|переулок|блв|бульвар|шосе|шоссе|набережна|набережная|пл|площа|площадь|тупик|узвіз|спуск|street|st|avenue|ave)(?=\s|$)/gi, ' '],

    // 5. Remove city/country and abbreviations
    [/(?:^|\s)(київ|киев|украина|україна|ua|ukraine|г\.?|м\.?)(?=\s|$)/gi, ' '],

    // 6. Collapse multiple spaces
    [/\s{2,}/g, ' '],
];


/**
 * Transliteration map for Ukrainian/Russian names to Latin.
 */
const TRANS_MAP: Record<string, string> = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'h', 'ґ': 'g', 'д': 'd', 'е': 'e', 'є': 'ye', 'ж': 'zh', 'з': 'z',
    'и': 'y', 'і': 'i', 'ї': 'yi', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p',
    'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch',
    'ь': '', 'ы': 'y', 'ё': 'yo', 'э': 'e', 'ю': 'yu', 'я': 'ya', 'ʼ': "'", '`': "'"
};

/**
 * Basic transliteration from Cyrillic to Latin.
 */
export function transliterate(text: string): string {
    return text.toLowerCase().split('').map(char => TRANS_MAP[char] || char).join('');
}

/**
 * Slavic/Universal Normalization.
 * 
 * 1. Transliterates everything to Latin.
 * 2. Collapses similar vowels (y/i/e/u).
 * 3. Removes noisy characters.
 * 
 * Goal: "Стуса" (ua) and "Stusa" (en) -> "stusa"
 *       "Берестейський" (ua) and "Beresteiskyi" (en) -> "beresteisky"
 */
export function slavicNormalize(text: string): string {
    if (!text) return '';
    
    // Step 1: Manual fixes for common double-vowel variations
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

    // Step 2: Transliterate to Latin
    n = transliterate(n);

    // Step 3: Normalize Latin vowels to bridge "y" vs "i" gaps
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

    // Step 4: Final cleanup
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
 * Extract the meaningful part of a Ukrainian address for geocoder queries.
 *
 * Input:  "Київ, вул. Левка Лук'яненка (Маршала Тимошенка), 15г, під.2, д/ф моб, эт.16, кв.0"
 * Output: "вул. Левка Лук'яненка, 15г"
 *
 * Algorithm:
 *   1. Strip leading city name "Київ, " 
 *   2. Strip ALL parentheticals (old names, entrance codes, etc.)
 *   3. Detect house number (digits + optional letters)
 *   4. Drop EVERYTHING after the house number
 */
export function cleanAddressForSearch(address: string): string {
    if (!address) return '';
    let cleaned = address.trim();

    // Step 0: Ensure space after comma if it precedes a number
    cleaned = cleaned.replace(/,(\d)/g, ', $1');

    // Step 1: Remove leading city prefix
    cleaned = cleaned.replace(/^(?:місто\s+|город\s+|м\.?\s*|г\.?\s*)?(?:київ|киев|kyiv|kiev|харків|харьков|дніпро|ужгород|одеса|одесса|львів|львов|бровари|бровары|бориспіль|борисполь|ірпінь|ирпень|буча|вишневе|вишневое|полтава)\s*,\s*/i, '');

    // Step 2: Strip ALL parentheticals for search (they confuse OSM providers)
    // NOTE: The old street names inside parens (e.g. "(Героїв Сталінграда)") are handled
    // by `generateStreetVariants` in addressUtils.ts, which already reads the raw address.
    cleaned = cleaned.replace(/\s*\([^)]*\)/g, '').trim();

    // Step 3: Identify the primary address part (up to house number) and discard the rest
    const complexHouse = /\d+[а-яієґa-z]*(?:[\/\-]\d*[а-яієґa-z]*)?/i;
    // Look for house number followed by a clear separator (comma, space + technical word, or end)
    const houseMatch = cleaned.match(new RegExp(`^(.*?(?:,|\\s)\\s*(?:(?:дом|д)\.?\\s*)?(${complexHouse.source}))(?:\\s+|$|,|\\b(?:под|этаж|кв|д\/ф|моб|корп|секция|сектор|подъезд|вход|литера|літера)\\b)`, 'iu'));
    
    if (houseMatch && houseMatch[1]) {
        // v5.66: Double check it didn't strip too much
        const res = houseMatch[1].trim();
        if (res.length > 5) {
            cleaned = res;
        }
    }

    // Step 4: Recursive suffix stripping (Final Cleanup)
    // v38.4: FIXED SyntaxError and over-aggressive stripping
    const TechnicalLabels = 'корп|корпус|під|под|підʼїзд|подъезд|эт|этаж|кв|квартира|оф|офіс|офис|вход|вхід|секція|секция|літера|літ|литера|д/ф|д\\s*[\\/-]\\s*ф|моб';
    
    // Pattern 1: Standard spaced suffix (e.g., ", под.2")
    const spacedSuffix = new RegExp(`(?:,|\\s)\\s*(?:${TechnicalLabels}).*$`, 'iu');
    // Pattern 2: Stuck suffix (e.g., "6под.2")
    const stuckSuffix = new RegExp(`(\\d)(?:${TechnicalLabels}).*$`, 'iu');
    // Pattern 3: Postal codes
    const postalRegex = /(?:,|\s)\s*\d{4,5}\b.*$/;

    let last: string;
    do {
        last = cleaned;
        cleaned = cleaned.replace(spacedSuffix, '')
                         .replace(stuckSuffix, '$1')
                         .replace(postalRegex, '');
    } while (cleaned !== last);

    // Final cleanup: remove trailing commas/spaces, dashes, etc.
    return cleaned.replace(/[, \-]+$/, '').replace(/\s{2,}/g, ' ').trim();
}
