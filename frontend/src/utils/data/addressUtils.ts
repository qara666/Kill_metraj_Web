export const cleanAddress = (address: string) => {
    if (!address) return address;
    return address
        .replace(/,\s*(под\.|подъезд|д\/ф|эт|этаж|эт\.|под|кв|квартира|оф|офис).*$/i, '')
        .replace(/,\s*\d+\s*(под\.|подъезд|д\/ф|эт|этаж|эт\.|под|кв|квартира|оф|офис).*$/i, '')
        .trim();
};

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
    const base = normalizeAddr(raw, city);
    const variants = new Set<string>();
    variants.add(base);

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

    // Нормализация номера линии
    const lineForms = [
        base.replace(/\b(\d+)-(а|я)\b/iu, '$1$2'),
        base.replace(/\b(\d+)\s*(а|я)\b/iu, '$1-$2'),
        base.replace(/\b(\d+)-?(а|я)\b/iu, '$1'),
        base.replace(/\bперша\b/iu, '1-а'),
        base.replace(/\bпервая\b/iu, '1-я')
    ];
    lineForms.forEach(v => variants.add(v));

    // Если "1 лінія" без префикса типа улицы — добавим префиксы
    if (/\b(лінія|линия)\b/iu.test(base) && !/\b(вулиця|вул\.|улица|ул\.)\b/iu.test(base)) {
        variants.add(`вулиця ${base}`);
        variants.add(`вул. ${base}`);
        variants.add(`улица ${base}`);
        variants.add(`ул. ${base}`);
    }

    return Array.from(variants).filter(v => v && v !== base);
};
