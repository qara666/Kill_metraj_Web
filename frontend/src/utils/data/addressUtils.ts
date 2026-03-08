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
 */
export const normalizeStreetForCompare = (street: string): string => {
    if (!street) return '';
    return street
        .toLowerCase()
        .replace(/\(.*?\)/g, ' ')
        .replace(/["'«»‘’“”""]/g, '')
        .replace(/[.,:;!\?]/g, ' ')
        .replace(/\b(вул|ул|вулиця|улица|пр|просп|проспект|пр-т|пров|пер|пер-к|провулок|переулок|блв|бульвар|шосе|шоссе|набережна|набережная|пл|площа|площадь|тупик|узвіз|спуск)\b\.?/gi, ' ')
        .replace(/\b(київ|киев|украина|україна|ua)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

export const extractStreetRoot = (address: string): string => {
    if (!address) return '';
    const cleaned = cleanAddress(address);
    const withoutHouse = cleaned.replace(/(?:^|\s|,)\d+[а-яієґ]?\b/gi, ' ');
    return normalizeStreetForCompare(withoutHouse);
};

export const cleanAddress = (address: string) => {
    if (!address) return address;
    return address
        .replace(/[?*]/g, ' ')
        // Remove technical annotations with numbers
        .replace(/(?:,|\s)\s*(?:корп\.?|корпус|под\.?|подъезд|п\.?|к\.?|эт\.?|этаж|кв\.?|квартира|оф\.?|офис|вход|дом|секция|літера|літ\.?|литера|д\/ф|моб|под|эт|кв|оф|літ)\s*\.?\s*\d+.*$/i, '')
        // Remove technical annotations without numbers
        .replace(/(?:,|\s)\s*(?:д\/ф|моб|вход|секция|литера|літ\.?|літера|п\.?|к\.?)\b/gi, '')
        .replace(/^(Київ|Киев|Kyiv|Kiev)\s*,\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();
};

export const STREET_RENAMES: Array<[string, string]> = [
    ['Маршала Тимошенка', 'Левка Лук\'яненка'],
    ['Маршала Тимошенко', 'Левка Лукьяненко'],
    ['Героїв Сталінграда', 'Володимира Івасюка'],
    ['Героев Сталинграда', 'Владимира Ивасюка'],
    ['Олександра Рокоссовського', 'Дмитра Павличка'],
    ['Марини Цвєтаєвої', 'Олександри Екстер'],
    ['Мате Залки', 'Олександра Архипенка'],
    ['Лайоша Гавро', 'Йорданська'],
    ['Берестейський проспект', 'проспект Перемоги'],
    ['Берестейский проспект', 'проспект Победы'],
    ['Сім\'ї Хохлових', 'Гарета Джонса'],
    ['Семьи Хохловых', 'Гарета Джонса'],
    ['Московський проспект', 'проспект Степана Бандери'],
    ['Московский проспект', 'проспект Степана Бандеры'],
    ['Фрунзе', 'Кирилівська'],
    ['Артема', 'Січових Стрільців'],
    ['Горького', 'Антоновича'],
    ['Червоноармійська', 'Велика Васильківська'],
    ['Красноармейская', 'Большая Васильковская'],
    ['Димитрова', 'Ділова'],
    ['Кутузова', 'Генерала Алмазова'],
    ['Суворова', 'Михайла Омеляновича-Павленка'],
    ['Урицького', 'Василя Липківського'],
    ['Воровського', 'Бульварно-Кудрявська'],
    ['Чкалова', 'Олеся Гончара'],
    ['Кіквідзе', 'Михайла Бойчука'],
    ['Ватутіна', 'проспект Романа Шухевича'],
    ['Дружби Народів', 'бульвар Миколи Міхновського'],
    ['Московська', 'Князів Острозьких'],
    ['Юрія Гагаріна', 'Леоніда Каденюка'],
    ['Соборності', 'Возз\'єднання'],
    ['проспект Соборності', 'проспект Возз\'єднання'],
    ['просп. Соборності', 'просп. Возз\'єднання'],
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

export const generateStreetVariants = (raw: string, city: string | null): string[] => {
    const districtHint = extractDistrictHint(raw);
    const variants = new Set<string>();

    const base = normalizeAddr(raw, city);
    variants.add(base);

    const fuzzy = (s: string) => s.replace(/['"«»‘’“”""\s?*]/g, '.');

    const tokenPairs: Array<[RegExp, string]> = [
        [/\bвулиця\b/iu, 'вул.'],
        [/\bвул\.?\b/iu, 'вулиця'],
        [/\bулица\b/iu, 'ул.'],
        [/\bул\.?\b/iu, 'улица'],
        [/\bпровулок\b/iu, 'пров.'],
        [/\bпров\.?\b/iu, 'провулок'],
        [/\bпроспект\b/iu, 'просп.'],
        [/\bпросп\.?\b/iu, 'проспект']
    ];

    // Multi-pass expansion to combine all transformations
    let lastSize = 0;
    for (let i = 0; i < 3 && variants.size > lastSize; i++) {
        lastSize = variants.size;
        const currentVariants = Array.from(variants);
        
        currentVariants.forEach(v => {
            // 1. apply renames
            STREET_RENAMES.forEach(([nameA, nameB]) => {
                const regA = new RegExp(fuzzy(nameA).replace(/\./g, '[.\'\\s]*'), 'iu');
                const regB = new RegExp(fuzzy(nameB).replace(/\./g, '[.\'\\s]*'), 'iu');
                if (regA.test(v)) variants.add(v.replace(regA, nameB));
                if (regB.test(v)) variants.add(v.replace(regB, nameA));
            });

            // 2. apply token swaps
            tokenPairs.forEach(([from, to]) => {
                if (from.test(v)) variants.add(v.replace(from, to));
            });

            // 3. line forms
            const lineForms = [
                v.replace(/\b(\d+)-(а|я)\b/iu, '$1$2'),
                v.replace(/\b(\d+)\s*(а|я)\b/iu, '$1-$2'),
                v.replace(/\b(\d+)-?(а|я)\b/iu, '$1'),
                v.replace(/\bперша\b/iu, '1-а'),
                v.replace(/\bпервая\b/iu, '1-я')
            ];
            lineForms.forEach(lf => variants.add(lf));
        });
    }

    // Post-process: Parenthetical Old Name (added separately)
    const parentheticalMatch = raw.match(/\(([^)]+)\)/);
    const parentheticalContent = parentheticalMatch ? parentheticalMatch[1].trim() : null;
    if (parentheticalContent && parentheticalContent.length > 3 && !/^\d+$/.test(parentheticalContent)) {
        if (!/^(д\/ф|моб|кв|под|эт|літ|корп|оф)/i.test(parentheticalContent)) {
            const house = base.match(/\d+[а-яієґ]*$/i)?.[0] || '';
            variants.add(`${parentheticalContent}${house ? ', ' + house : ''}${city ? ', ' + city : ''}, Украина`);
        }
    }

    // Post-process: District Hint (appended to everything)
    if (districtHint && districtHint.length > 5) {
        Array.from(variants).forEach(v => {
            variants.add(`${districtHint} ${v}`);
        });
    }

    return Array.from(variants).filter(Boolean);
};
