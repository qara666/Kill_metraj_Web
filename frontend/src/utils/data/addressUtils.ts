import { normalizeAddress, cleanAddressForSearch } from '../address/addressNormalization';
import { ALL_STREET_RENAMES as GLOBAL_RENAMES } from './streetRenamesData';

/**
 * Извлекает подсказку района/массива из скобок в адресе.
 */
export const extractDistrictHint = (address: string): string | null => {
    if (!address) return null;
    const matches = address.match(/\(([^)]+)\)/g);
    if (!matches) return null;

    for (const match of matches) {
        const inner = match.slice(1, -1).trim();
        if (/^(д\/ф|моб|кв|квартира|під|под|эт|этаж|корп|літера|літ|литера|офис|оф|вход|\d+)[\s,]*/i.test(inner)) continue;
        if (inner.length < 5) continue;
        if (/^\d+$/.test(inner)) continue;
        return inner;
    }
    return null;
};

/**
 * v5.63: Надежная нормализация для сравнения улиц.
 * Удаляет типы улиц, скобки, кавычки и лишние пробелы.
 */
export const normalizeStreetForCompare = (street: string): string => {
    return normalizeAddress(street);
};

export const cleanAddress = (address: string) => {
    if (!address) return '';
    // Глубокая очистка V3.5: сначала удаляем неоднозначные символы
    let cleaned = address.replace(/[?*]/g, ' ');
    
    // 1. Удаляем всё после общих технических разделителей
    const stopWords = /\b(эт\.?|кв\.?|под\.?|пд\.?|п-д|квартира|этаж|подъезд|д\/ф|моб|д\.?ф\.?|эт|кв|под|домофон|тел\.?\b|мобільний|моб\.?)\b.*$/iu;
    cleaned = cleaned.replace(stopWords, '');

    // 2. Удаляем общие технические шаблоны в других местах (не до конца строки)
    cleaned = cleaned.replace(/\b(д\/ф|моб|моб\.?|под\.?\d+|эт\.?\d+|кв\.?\d+|корп\.?\d+|офис\.?\d+|оф\.?\d+)\b/iu, '');
    return cleanAddressForSearch(cleaned).trim();
};

// ... (существующий код опущен для краткости)

export const STREET_RENAMES: Array<[string, string]> = [
    ...GLOBAL_RENAMES,
    // Добавьте любые переопределения здесь при необходимости
    ['Загорівська', 'Багговутівська'],
    ['Загоровская', 'Багговутовская'],
    ['Нижньоюрківська', 'Нижнеюрковская'],
    ['Нижня Юрківська', 'Нижньоюрківська'],
    ['Нижне-Юрковская', 'Нижнеюрковская'],
];

export const normalizeAddr = (addr: string, city: string | null) => {
    const base = cleanAddress(addr).trim();
    if (!base) return base;

    // Если адрес уже содержит город или страну, возвращаем как есть.
    // В противном случае добавляем город, но МИНИМАЛЬНО.
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

    // v35.9.25: Стандартизируем нечеткие кавычки и апострофы перед генерацией
    const fuzzy = (s: string) => s.replace(/['"«»‘’“”""ʼ`\s?*]/g, '.');

    const tokenPairs: Array<[RegExp, string]> = [
        [/\bвулиця\b/iu, 'вул.'],
        [/\bвул\.?\b/iu, 'вулиця'],
        [/\bулица\b/iu, 'ул.'],
        [/\bул\.?\b/iu, 'улица'],
        // UA <-> RU межъязыковые замены (КРИТИЧНО для Photon)
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
        // Переводы названий городов
        [/\bкиїв\b/iu, 'Киев'],
        // Общие RU <-> UA переводы (Лингвистические)
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

    // Перевод языковых суффиксов (например, -ая <-> -а)
    const langSuffixes: Array<[RegExp, string]> = [
        [/([а-яёієґ])ая\b/iu, '$1а'],
        [/([а-яёієґ])а\b/iu, '$1ая'],
        [/([а-яёієґ])ий\b/iu, '$1ый'],
        [/([а-яёієґ])ый\b/iu, '$1ий'],
    ];

    // Многопроходное расширение для комбинации всех трансформаций
    let lastSize = 0;
    for (let i = 0; i < 2 && variants.size > lastSize; i++) {
        lastSize = variants.size;
        const currentVariants = Array.from(variants);
        currentVariants.forEach(v => {
            // 1. применяем переименования
            STREET_RENAMES.forEach(([nameA, nameB]) => {
                const regA = new RegExp(fuzzy(nameA).replace(/\./g, '[.\'\\s]*'), 'iu');
                const regB = new RegExp(fuzzy(nameB).replace(/\./g, '[.\'\\s]*'), 'iu');
                if (regA.test(v) && !regB.test(v)) variants.add(v.replace(regA, nameB));
                if (regB.test(v) && !regA.test(v)) variants.add(v.replace(regB, nameA));
            });

            // 2. применяем замены токенов
            tokenPairs.forEach(([from, to]) => {
                if (from.test(v)) {
                    const swapped = v.replace(from, to).trim();
                    // Базовая дедупликация префиксов (например, 'вул. вул.' -> 'вул.')
                    const deduped = swapped.replace(/\b(вул|ул|пров|просп|пр|бул|бульвар|вулиця|улица)\.?\s+\1\.?\b/gi, '$1.');
                    variants.add(deduped);
                }
            });

            // 2.5 применяем языковые суффиксы
            langSuffixes.forEach(([from, to]) => {
                if (from.test(v)) {
                    const replaced = v.replace(from, to).trim();
                    if (replaced !== v) variants.add(replaced);
                }
            });

            // 3. формы линий
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

    // Финальный проход для замен и перестановок слов
    const expanded = new Set<string>();
    variants.forEach(v => {
        expanded.add(v);
        
        // Финальные перестановки порядка слов для улиц из 2 слов
        const parts = v.split(/[\s,]+/);
        const words = parts.filter(p => p.length > 3 && !/\d/.test(p));
        if (words.length === 2) {
            const reversed = v.replace(words[0], 'TEMP_W').replace(words[1], words[0]).replace('TEMP_W', words[1]);
            expanded.add(reversed);
        }
    });

    // Применяем подсказки районов последними (уровень 3, запасной вариант)
    if (districtHint && districtHint.length > 5) {
        Array.from(expanded).forEach(v => {
            expanded.add(`${districtHint}, ${v}`);
            expanded.add(`${v}, ${districtHint}`);
        });
    }

    return Array.from(expanded)
        .map(v => v.replace(/\b(вул|ул|пров|просп|пр|бул|бульвар|вулиця|улица)\.?\s+\1\.?\b/gi, '$1.').trim())
        .filter(Boolean);
};

/**
 * v5.140: Строгая логика уточнения — отмечаем только когда УВЕРЕНЫ в проблеме.
 * Снижает уровень ложных срабатываний "требуется уточнение" до почти нуля.
 * Отмечает уточнение только когда:
 *   1. Координаты не найдены (геокодирование полностью провалилось)
 *   2. Тип APPROXIMATE + поиск номера дома явно НЕ УДАЛСЯ (streetNumberMatched === false)
 */
export const needsAddressClarification = (params: {
    locationType?: string;
    streetNumberMatched?: boolean;
    hasCoords?: boolean;
    geocodeScore?: number;
}): boolean => {
    const { hasCoords } = params;

    // 1. Нет координат → всегда требует уточнения
    if (hasCoords === false || hasCoords === undefined) return true;

    // v5.141: Пользователь запросил устранение мелких блоков уточнений.
    // Если координаты найдены (даже Approximate или без номера дома),
    // считаем адрес "геокодированным" и разрешаем расчет маршрута
    // вместо жесткой ошибки "ПОМИЛКА (АДРЕСА)".
    return false;
};
