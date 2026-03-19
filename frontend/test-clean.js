function cleanAddressForSearch(address) {
    if (!address) return '';
    let cleaned = address.trim();

    // Step 0: Ensure space after comma if it precedes a number
    cleaned = cleaned.replace(/,(\d)/g, ', $1');

    // Step 1: Remove leading city prefix
    cleaned = cleaned.replace(/^(?:місто\s+|город\s+|м\.?\s*|г\.?\s*)?(?:київ|киев|kyiv|kiev|харків|харьков|дніпро|ужгород|одеса|одесса|львів|львов|бровари|бровары|бориспіль|борисполь|ірпінь|ирпень|буча|вишневе|вишневое|полтава)\s*,\s*/i, '');

    // Step 2: Strip ALL parentheticals for search (they confuse OSM providers)
    cleaned = cleaned.replace(/\s*\([^)]*\)/g, '').trim();

    // Step 3: Identify the primary address part (up to house number) and discard the rest
    const complexHouse = /\d+[а-яієґa-z]*(?:[\/\-]\d*[а-яієґa-z]*)?/i;
    // Look for house number followed by a clear separator (comma, space + technical word, or end)
    const houseMatch = cleaned.match(new RegExp(`^(.*?(?:,|\\s)\\s*(?:(?:дом|д)\\.?\\s*)?(${complexHouse.source}))(?:\\s+|$|,|\\b(?:под|этаж|кв|д\\/ф|моб|корп|секция|сектор|подъезд|вход|литера|літера)\\b)`, 'iu'));
    
    if (houseMatch && houseMatch[1]) {
        // v5.66: Double check it didn't strip too much
        const res = houseMatch[1].trim();
        if (res.length > 5) {
            cleaned = res;
        }
    }

    // Step 4: Recursive suffix stripping (Final Cleanup)
    const TechnicalLabels = 'корп|корпус|під|под|підʼїзд|подъезд|эт|этаж|кв|квартира|оф|офіс|офис|вход|вхід|секція|секция|літера|літ|литера|д/ф|д\\s*[\\/-]\\s*ф|моб';
    
    // Pattern 1: Standard spaced suffix (e.g., ", под.2")
    const spacedSuffix = new RegExp(`(?:,|\\s)\\s*(?:${TechnicalLabels}).*$`, 'iu');
    // Pattern 2: Stuck suffix (e.g., "6под.2")
    const stuckSuffix = new RegExp(`(\\d)(?:${TechnicalLabels}).*$`, 'iu');
    // Pattern 3: Postal codes
    const postalRegex = /(?:,|\\s)\\s*\\d{4,5}\\b.*$/;

    let last;
    do {
        last = cleaned;
        cleaned = cleaned.replace(spacedSuffix, '')
                         .replace(stuckSuffix, '$1')
                         .replace(postalRegex, '');
    } while (cleaned !== last);

    // Final cleanup: remove trailing commas/spaces, dashes, etc.
    return cleaned.replace(/[, \-]+$/, '').replace(/\s{2,}/g, ' ').trim();
}

const addresses = [
  'Київ, просп. Володимира Івасюка (Героїв Сталінграда), 7, под.2, д/ф моб, эт.1, кв.18',
  'Київ, просп. Володимира Івасюка (Героїв Сталінграда), 4 корп. 1, под.1, д/ф моб, эт.1, кв.1',
  'г. КИЇВ, Вулиця Зої Гайдай, д.9/8, д/ф моб, Украина',
  'Київ, вул. Північна, 16, под.2, д/ф моб, эт.5, кв.53'
];
console.log(addresses.map(a => cleanAddressForSearch(a)));
