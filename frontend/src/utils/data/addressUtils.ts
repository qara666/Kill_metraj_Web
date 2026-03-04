/**
 * Извлекает подсказку района/массива из скобок в адресе.
 * Пример: "вул. Нарбута (Петропавлівська Борщагівка), 8" → "Петропавлівська Борщагівка"
 * Используется ТОЛЬКО для post-scoring (приоритизации кандидатов), а НЕ для поиска —
 * чтобы не вызвать геокод в Київській ОБЛАСТІ вместо МІСТА Київ.
 */
export const extractDistrictHint = (address: string): string | null => {
    if (!address) return null;
    const matches = address.match(/\(([^)]+)\)/g);
    if (!matches) return null;

    for (const match of matches) {
        const inner = match.slice(1, -1).trim();
        // Пропускаем технические пометки (д/ф, моб, кв, под и т.п.)
        if (/^(д\/ф|моб|кв|квартира|під|под|эт|этаж|корп|літера|літ|литера|офис|оф|вход|\d+)[\s,]*/i.test(inner)) continue;
        // Пропускаем очень короткие (< 5 символов) — не районы
        if (inner.length < 5) continue;
        // Пропускаем числа
        if (/^\d+$/.test(inner)) continue;
        return inner;
    }
    return null;
};

/**
 * v5.63: Robust Normalization for Street Comparisons.
 * Strips street types, parentheses, quotes, and extra spaces.
 * Useful for checking if "пл. Оболонська" matches "Оболонська площа".
 */
export const normalizeStreetForCompare = (street: string): string => {
    if (!street) return '';
    return street
        .toLowerCase()
        // Strip everything in parentheses
        .replace(/\(.*?\)/g, ' ')
        // v5.64: More aggressive quote and punctuation stripping
        .replace(/["'«»‘’“”""]/g, '')
        // Replace punctuation with spaces
        .replace(/[.,:;!\?]/g, ' ')
        // Strip common prefixes/suffixes (types)
        .replace(/\b(вул|ул|вулиця|улица|пр|просп|проспект|пр-т|пров|пер|пер-к|провулок|переулок|блв|бульвар|шосе|шоссе|набережна|набережная|пл|площа|площадь|тупик|узвіз|спуск)\b\.?/gi, ' ')
        // Remove "Київ/Киев" if stuck in there
        .replace(/\b(київ|киев|украина|україна|ua)\b/gi, ' ')
        // Collapse spaces and trim
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * v5.65: Extracts the core street name without house numbers or prefixes.
 * This is used for robust matching between raw address and geocode results.
 */
export const extractStreetRoot = (address: string): string => {
    if (!address) return '';
    const cleaned = cleanAddress(address);
    // Remove common house number patterns (e.g., "19а", "27", "14ж")
    // We look for digits followed by optional cyrillic letter at the end or followed by comma/space
    const withoutHouse = cleaned.replace(/(?:^|\s|,)\d+[а-яієґ]?\b/gi, ' ');
    return normalizeStreetForCompare(withoutHouse);
};

export const cleanAddress = (address: string) => {
    if (!address) return address;
    return address
        // v5.62: Aggressive Suffix Stripping (Everything after the house number)
        // We look for patterns like ", корп.", " под.", " кв." and strip everything after them
        .replace(/(?:,|\s)\s*(?:корп\.?|корпус|под\.?|подъезд|п\.?|к\.?|эт\.?|этаж|кв\.?|квартира|оф\.?|офис|вход|дом|секция|літера|літ\.?|литера|д\/ф|моб|под|эт|кв|оф|літ)\s*\.?\d+.*$/i, '')
        // v5.62: Second pass for naked room/floor numbers at the end
        .replace(/(?:,|\s)\s*(?:эт\.?|этаж|эт|кв\.?|квартира|кв|оф\.?|офис|оф|под\.?|подъезд|под|корп\.?|корпус|корп)\s*\.?\s*\d+.*$/i, '')
        // Remove leading city prefix (Kyiv, etc.) often found in CRM exports
        .replace(/^(Київ|Киев|Kyiv|Kiev)\s*,\s*/i, '')
        .trim();
};

export const STREET_RENAMES: Array<[RegExp, string]> = [
    // 2022-2024 Deryussification & Historical
    [/\bБерестейський проспект\b/iu, 'проспект Перемоги'],
    [/\bБерестейский проспект\b/iu, 'проспект Победы'],
    [/\bпроспект Перемоги\b/iu, 'Берестейський проспект'],
    [/\bпроспект Победы\b/iu, 'Берестейский проспект'],
    [/\bСім'ї Хохлових\b/iu, 'Гарета Джонса'],
    [/\bСемьи Хохловых\b/iu, 'Гарета Джонса'],
    [/\bМосковський проспект\b/iu, 'проспект Степана Бандери'],
    [/\bМосковский проспект\b/iu, 'проспект Степана Бандеры'],
    [/\bпроспект Повітрофлотський\b/iu, 'проспект Повітряних Сил'],
    [/\bВоздухофлотский проспект\b/iu, 'проспект Воздушных Сил'],
    [/\bвулиця Фрунзе\b/iu, 'вулиця Кирилівська'],
    [/\bулица Фрунзе\b/iu, 'улица Кирилловская'],
    [/\bвулиця Артема\b/iu, 'вулиця Січових Стрільців'],
    [/\bулица Артема\b/iu, 'улица Сечевых Стрельцов'],
    [/\bвулиця Горького\b/iu, 'вулиця Антоновича'],
    [/\bулица Горького\b/iu, 'улица Антоновича'],
    [/\bвулиця Червоноармійська\b/iu, 'вулиця Велика Васильківська'],
    [/\bулица Красноармейская\b/iu, 'улица Большая Васильковская'],
    [/\bвулиця Димитрова\b/iu, 'вулиця Ділова'],
    [/\bулица Димитрова\b/iu, 'улица Деловая'],
    [/\bвулиця Кутузова\b/iu, 'вулиця Генерала Алмазова'],
    [/\bулица Кутузова\b/iu, 'улица Генерала Алмазова'],
    [/\bвулиця Суворова\b/iu, 'вулиця Михайла Омеляновича-Павленка'],
    [/\bулица Суворова\b/iu, 'улица Михаила Емельяновича-Павленко'],
    [/\bвулиця Урицького\b/iu, 'вулиця Василя Липківського'],
    [/\bулица Урицкого\b/iu, 'улица Василия Липковского'],
    [/\bвулиця Воровського\b/iu, 'вулиця Бульварно-Кудрявська'],
    [/\bулица Воровского\b/iu, 'улица Бульварно-Кудрявская'],
    [/\bвулиця Чкалова\b/iu, 'вулиця Олеся Гончара'],
    [/\bулица Чкалова\b/iu, 'улица Олеся Гончара'],
    [/\bвулиця Кіквідзе\b/iu, 'вулиця Михайла Бойчука'],
    [/\bулица Киквидзе\b/iu, 'улица Михаила Бойчука'],
    [/\bПр-т Бажана\b/iu, 'проспект Миколи Бажана'],
    [/\bвулиця маршала Рокоссовського\b/iu, 'проспект Дмитра Павличка'],
    [/\bвулиця Ватутіна\b/iu, 'проспект Романа Шухевича'],
    [/\bулица Ватутина\b/iu, 'проспект Романа Шухевича'],
    [/\bвулиця Волго-Донська\b/iu, 'вулиця Павла Петриченка'],
    [/\bвулиця Левітана\b/iu, 'вулиця Лукрецька'],
    [/\bвулиця Адмірала Ушакова\b/iu, 'вулиця Багринова'],
    [/\bвулиця Академіка Вільямса\b/iu, 'вулиця Степана Рудницького'],
    [/\bвулиця Байкальська\b/iu, 'вулиця Мелітопольська'],
    [/\bвулиця Салтикова-Щедріна\b/iu, 'вулиця Сергія Миронова'],

    // Narbuta / Volkova cases (Kyiv/Suburbs)
    [/\bвулиця Георгія Нарбута\b/iu, 'вулиця Волкова'],
    [/\bулица Георгия Нарбута\b/iu, 'улица Волкова'],
    [/\bвулиця Волкова\b/iu, 'вулиця Георгія Нарбута'],
    [/\bулица Волкова\b/iu, 'улица Георгия Нарбута'],

    // Kyiv - Common 2022-2024 Renames
    [/\bГероїв Сталінграда\b/iu, 'Володимира Івасюка'],
    [/\bГероев Сталинграда\b/iu, 'Владимира Ивасюка'],
    [/\bВолодимира Івасюка\b/iu, 'Героїв Сталінграда'],
    [/\bпроспект Маяковського\b/iu, 'проспект Червоної Калини'],
    [/\bпроспект Маяковского\b/iu, 'проспект Красной Калины'],
    [/\bпроспект Червоної Калини\b/iu, 'проспект Маяковського'],
    [/\bбульвар Перова\b/iu, 'проспект Воскресенський'],
    [/\bпроспект Воскресенський\b/iu, 'бульвар Перова'],
    [/\bпроспект Дружби Народів\b/iu, 'бульвар Миколи Міхновського'],
    [/\bбульвар Миколи Міхновського\b/iu, 'проспект Дружби Народів'],
    [/\bвулиця Московська\b/iu, 'вулиця Князів Острозьких'],
    [/\bулица Московская\b/iu, 'улица Князей Острожских'],
    [/\bвулиця Князів Острозьких\b/iu, 'вулиця Московська'],
    [/\bпроспект Юрія Гагаріна\b/iu, 'проспект Леоніда Каденюка'],
    [/\bпроспект Юрия Гагарина\b/iu, 'проспект Леонида Каденюка'],
    [/\bпроспект Леоніда Каденюка\b/iu, 'проспект Юрія Гагаріна'],
    [/\bвулиця Маршала Тимошенка\b/iu, 'вулиця Левка Лук\'яненка'],
    [/\bулица Маршала Тимошенко\b/iu, 'улица Левка Лукьяненко'],
    [/\bвулиця Олександра Рокоссовського\b/iu, 'проспект Дмитра Павличка'],
    [/\bвулиця Марини Цвєтаєвої\b/iu, 'вулиця Олександри Екстер'],
    [/\bулица Марины Цветаевой\b/iu, 'улица Александры Экстер'],

    // Kharkiv - Common Renames
    [/\bМосковський проспект\b/iu, 'проспект Героїв Харкова'],
    [/\bМосковский проспект\b/iu, 'проспект Героев Харькова'],
    [/\bпроспект Героїв Харкова\b/iu, 'Московський проспект'],
    [/\bвулиця Пушкінська\b/iu, 'вулиця Григорія Сковороди'],
    [/\bулица Пушкинская\b/iu, 'улица Григория Сковороды'],
    [/\bвулиця Григорія Сковороди\b/iu, 'вулиця Пушкінська'],
    [/\bвулиця Плеханівська\b/iu, 'вулиця Георгія Тарасенка'],
    [/\bулица Плехановская\b/iu, 'улица Георгия Тарасенка'],
    [/\bпроспект Гагаріна\b/iu, 'проспект Аерокосмічний'],
    [/\bпроспект Гагарина\b/iu, 'проспект Аэрокосмический'],

    // Poltava - Common Renames
    [/\bвулиця Маршала Бірюзова\b/iu, 'вулиця Решетилівська'],
    [/\bулица Маршала Бирюзова\b/iu, 'улица Решетиловская'],
    [/\bвулиця Решетилівська\b/iu, 'вулиця Маршала Бірюзова'],
    [/\bвулиця Пушкіна\b/iu, 'вулиця Юлія Оксмана'],
    [/\bулица Пушкина\b/iu, 'улица Юлия Оксмана'],
    [/\bвулиця Кондратенка\b/iu, 'вулиця Віталія Грицаєнка'],
    [/\bулица Кондратенко\b/iu, 'улица Виталия Грицаенко']
];

export const normalizeAddr = (addr: string, city: string | null) => {
    const cityAppend = city ? `, ${city}, Украина` : ', Украина';
    const base = cleanAddress(addr).trim();
    if (!base) return base;
    const lower = base.toLowerCase();
    const hasCity = city && lower.includes(city.toLowerCase());
    const hasCountry = lower.includes('украина') || lower.includes('україна') || lower.includes('ukraine');
    if (!hasCity && !hasCountry) return `${base}${cityAppend}`;
    if (!hasCountry) return `${base}, Украина`;
    return base;
};

/**
 * Generates search query variants for a raw address.
 *
 * v5.60: SAFE use of District Hints.
 * Prepending the district hint (e.g. "Петропавлівська Борщагівка") to the variant
 * helps Google find specific streets in suburban villages that might have twins in the city.
 */
export const generateStreetVariants = (raw: string, city: string | null): string[] => {
    const districtHint = extractDistrictHint(raw);
    const variants = new Set<string>();

    // v5.62: Extract parenthetical name (Old Name) for high-priority search
    const parentheticalMatch = raw.match(/\(([^)]+)\)/);
    const parentheticalContent = parentheticalMatch ? parentheticalMatch[1].trim() : null;

    const base = normalizeAddr(raw, city);
    variants.add(base);

    // v5.62: If we have an old name in parentheses, use it with the house number
    if (parentheticalContent && parentheticalContent.length > 3 && !/^\d+$/.test(parentheticalContent)) {
        // Only use if it looks like a street name (not a technical note already handled by cleanAddress)
        const isNotTech = !/^(д\/ф|моб|кв|под|эт|літ|корп|оф)/i.test(parentheticalContent);
        if (isNotTech) {
            // Keep the house number from the base but swap the street name
            const house = base.match(/\d+[а-яієґ]*$/i)?.[0] || '';
            const variantWithOldName = `${parentheticalContent}${house ? ', ' + house : ''}${city ? ', ' + city : ''}, Украина`;
            variants.add(variantWithOldName);
        }
    }

    STREET_RENAMES.forEach(([oldName, newName]) => {
        if (oldName.test(base)) {
            variants.add(base.replace(oldName, newName));
        }
        const newNameRegex = new RegExp(`\\b${newName}\\b`, 'iu');
        if (newNameRegex.test(base)) {
            variants.add(base.replace(newNameRegex, (raw.match(newNameRegex)?.[0] || newName).replace(/./, (m) => m === m.toUpperCase() ? oldName.source : oldName.source.toLowerCase())));
        }
    });

    const tokenPairs: Array<[RegExp, string]> = [
        [/\bвулиця\b/iu, 'вул.'],
        [/\bвул\.?\b/iu, 'вулиця'],
        [/\bулица\b/iu, 'ул.'],
        [/\bул\.?\b/iu, 'улица'],
        [/\bпровулок\b/iu, 'пров.'],
        [/\bпров\.?\b/iu, 'провулок'],
        [/\bпроспект\b/iu, 'просп.'],
        [/\bпросп\.?\b/iu, 'проспект'],
        [/\bлиния\b/iu, 'лінія'],
        [/\bлінія\b/iu, 'лін.'],
        [/\bлін\.?\b/iu, 'лінія']
    ];

    tokenPairs.forEach(([from, to]) => {
        try {
            variants.add(base.replace(from, to));
        } catch { }
    });

    const lineForms = [
        base.replace(/\b(\d+)-(а|я)\b/iu, '$1$2'),
        base.replace(/\b(\d+)\s*(а|я)\b/iu, '$1-$2'),
        base.replace(/\b(\d+)-?(а|я)\b/iu, '$1'),
        base.replace(/\bперша\b/iu, '1-а'),
        base.replace(/\bпервая\b/iu, '1-я')
    ];
    lineForms.forEach(v => variants.add(v));

    if (/\b(лінія|линия)\b/iu.test(base) && !/\b(вулиця|вул\.|улица|ул\.)\b/iu.test(base)) {
        variants.add(`вулиця ${base}`);
        variants.add(`вул. ${base}`);
        variants.add(`улица ${base}`);
        variants.add(`ул. ${base}`);
    }

    // ★ COST OPTIMIZATION v2: District hint variants go LAST (tier 3 — exhaustive fallback).
    // They are only appended AFTER tier 1+2 variants, so early-exit stops before reaching them.
    if (districtHint && districtHint.length > 5) {
        const tier1and2 = Array.from(variants);
        tier1and2.forEach(v => {
            variants.add(`${districtHint} ${v}`);
        });
    }

    return Array.from(variants).filter(Boolean);
};
