import { normalizeAddress, cleanAddressForSearch } from '../address/addressNormalization';

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
    return normalizeAddress(street);
};

export const extractStreetRoot = (address: string): string => {
    if (!address) return '';
    const cleaned = cleanAddress(address);
    const withoutHouse = cleaned.replace(/(?:^|\s|,)\d+[а-яієґ]?\b/gi, ' ');
    return normalizeStreetForCompare(withoutHouse);
};

export const cleanAddress = (address: string) => {
    if (!address) return '';
    // Deep Cleaning V3: Aggressive stripping of technical info before it even hits the variant generator
    let cleaned = address;
    
    // 1. Remove everything after common technical separators
    // We remove p., k., t. from the list because they clash with street initials (e.g. П. Мирного, Т. Шевченко)
    const stopWords = /\b(эт\.?|кв\.?|под\.?|пд\.?|п-д|квартира|этаж|подъезд|д\/ф|моб|д\.?ф\.?|эт|кв|под|домофон|тел\.?\b|мобільний|моб\.?)\b.*$/iu;
    cleaned = cleaned.replace(stopWords, '');

    // 2. Remove common technical patterns elsewhere (non-strip-to-end versions)
    cleaned = cleaned.replace(/\b(д\/ф|моб|под\.?\d+|эт\.?\d+|кв\.?\d+|корп\.?\d+|офис\.?\d+|оф\.?\d+)\b/iu, '');

    return cleanAddressForSearch(cleaned).trim();
};

import { ALL_STREET_RENAMES as GLOBAL_RENAMES } from './streetRenamesData';

// ... (existing code omitted for brevity but I'll make sure to replace the right section)

export const STREET_RENAMES: Array<[string, string]> = [
    ...GLOBAL_RENAMES,
    // Add any ad-hoc overrides here if needed
    ['Нижньоюрківська', 'Нижнеюрковская'],
    ['Нижня Юрківська', 'Нижньоюрківська'],
    ['Нижне-Юрковская', 'Нижнеюрковская'],
];

export const normalizeAddr = (addr: string, city: string | null) => {
    const base = cleanAddress(addr).trim();
    if (!base) return base;

    // If the address already has city or country, just return it as is.
    // Otherwise, append city but MINIMALLY.
    const lower = base.toLowerCase();
    const hasCity = city && lower.includes(city.toLowerCase());
    const hasCountry = lower.includes('украина') || lower.includes('україна') || lower.includes('ukraine');

    if (hasCity && hasCountry) return base;
    if (!hasCity && city) return `${base}, ${city}`;
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
        // UA <-> RU Cross-Language swaps (CRITICAL for Photon)
        [/\bул\.?\b/iu, 'вул.'],
        [/\bулица\b/iu, 'вулиця'],
        [/\bвул\.?\b/iu, 'ул.'],
        [/\bвулиця\b/iu, 'улица'],
        [/\bпровулок\b/iu, 'переулок'],
        [/\bпереулок\b/iu, 'провулок'],
        [/\bпров\.?\b/iu, 'пер.'],
        [/\bпер\.?\b/iu, 'пров.'],
        [/\bпроспект\b/iu, 'просп.'],
        [/\bпросп\.?\b/iu, 'проспект'],
        [/\bпр\.?\b/iu, 'просп.'],
        [/\bпросп\.?\b/iu, 'пр.'],
        // City translations
        [/\bкиїв\b/iu, 'Киев'],
        // Generic RU <-> UA Common translations (Linguistic)
        [/\bозерная\b/iu, 'озерна'],
        [/\bозерна\b/iu, 'озерная'],
        [/\bполевая\b/iu, 'польова'],
        [/\bпольова\b/iu, 'полевая'],
        [/\bцветочная\b/iu, 'квіткова'],
        [/\bквіткова\b/iu, 'цветочная'],
        [/\bлесная\b/iu, 'лісова'],
        [/\bлісова\b/iu, 'лесная'],
        [/\bсадовая\b/iu, 'садова'],
        [/\bсадова\b/iu, 'садовая'],
        [/\bабрикосовая\b/iu, 'абрикосова'],
        [/\bабрикосова\b/iu, 'абрикосовая'],
        [/\bотдыха\b/iu, 'відпочинку'],
        [/\bвідпочинку\b/iu, 'отдыха'],
        [/\bнабережная\b/iu, 'набережна'],
        [/\bнабережна\b/iu, 'набережная'],
        [/\bсоборная\b/iu, 'соборна'],
        [/\bсоборна\b/iu, 'соборная'],
        [/\bстроителей\b/iu, 'будівельників'],
        [/\bбудівельників\b/iu, 'строителей'],
        [/\bмира\b/iu, 'миру'],
        [/\bмиру\b/iu, 'мира'],
        [/\bсолнечная\b/iu, 'сонячна'],
        [/\bсонячна\b/iu, 'солнечная'],
    ];

    // Language suffix translations (e.g., -ая <-> -а)
    const langSuffixes: Array<[RegExp, string]> = [
        [/([а-яёієґ])ая\b/iu, '$1а'],
        [/([а-яёієґ])а\b/iu, '$1ая'],
        [/([а-яёієґ])ий\b/iu, '$1ый'],
        [/([а-яёієґ])ый\b/iu, '$1ий'],
    ];

    // Multi-pass expansion to combine all transformations
    let lastSize = 0;
    for (let i = 0; i < 3 && variants.size > lastSize; i++) {
        lastSize = variants.size;
        const currentVariants = Array.from(variants);

        currentVariants.forEach(v => {
            // 1. apply renames
            STREET_RENAMES.forEach(([nameA, nameB]) => {
                const fuzzyA = fuzzy(nameA).replace(/\./g, '[.\'\\s]*');
                const fuzzyB = fuzzy(nameB).replace(/\./g, '[.\'\\s]*');
                const regA = new RegExp(fuzzyA, 'iu');
                const regB = new RegExp(fuzzyB, 'iu');
                
                if (regA.test(v) && !regB.test(v)) {
                    const next = v.replace(regA, nameB);
                    if (next !== v) variants.add(next);
                }
                if (regB.test(v) && !regA.test(v)) {
                    const next = v.replace(regB, nameA);
                    if (next !== v) variants.add(next);
                }
            });

            // 2. apply token swaps
            tokenPairs.forEach(([from, to]) => {
                if (from.test(v)) {
                    const swapped = v.replace(from, to).trim();
                    // Basic prefix deduplication (e.g., 'вул. вул.' -> 'вул.')
                    const deduped = swapped.replace(/\b(вул|ул|пров|просп|пр|бул|бульвар|вулиця|улица)\.?\s+\1\.?\b/gi, '$1.');
                    variants.add(deduped);
                }
            });

            // 2.5 apply language suffixes
            langSuffixes.forEach(([from, to]) => {
                if (from.test(v)) {
                    const replaced = v.replace(from, to).trim();
                    if (replaced !== v) variants.add(replaced);
                }
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

    // Final global prefix deduplication
    const finalVariants = Array.from(variants).map(v => 
        v.replace(/\b(вул|ул|пров|просп|пр|бул|бульвар|вулиця|улица)\.?\s+\1\.?\b/gi, '$1.').trim()
    );

    // Post-process: Parenthetical Old Name (added separately)
    const parentheticalMatch = raw.match(/\(([^)]+)\)/);
    const parentheticalContent = parentheticalMatch ? parentheticalMatch[1].trim() : null;
    if (parentheticalContent && parentheticalContent.length > 3 && !/^\d+$/.test(parentheticalContent)) {
        if (!/^(д\/ф|моб|кв|под|эт|літ|корп|оф)/i.test(parentheticalContent)) {
            const house = base.match(/\d+[а-яієґ]*$/i)?.[0] || '';
            variants.add(`${parentheticalContent}${house ? ', ' + house : ''}${city ? ', ' + city : ''}, Украина`);
        }
    }

    // Post-process: Word Order Permutations for 2-word streets
    // (e.g. "Леся Курбаса" -> "Курбаса Леся")
    Array.from(variants).forEach(v => {
        const parts = v.split(/[\s,]+/);
        // Look for multi-word sequences that might be names
        // Simple logic: if we have 2-3 words > 3 letters, try reversing them
        const words = parts.filter(p => p.length > 3 && !/\d/.test(p));
        if (words.length === 2) {
            const reversed = v.replace(words[0], 'TEMP_W').replace(words[1], words[0]).replace('TEMP_W', words[1]);
            variants.add(reversed);
        }
    });

    // Post-process: District Hint (appended to everything)
    if (districtHint && districtHint.length > 5) {
        Array.from(variants).forEach(v => {
            variants.add(`${districtHint}, ${v}`);
            variants.add(`${v}, ${districtHint}`);
        });
    }

    return Array.from(new Set(finalVariants)).filter(Boolean);
};
