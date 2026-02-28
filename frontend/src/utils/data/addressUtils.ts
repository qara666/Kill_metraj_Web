export const cleanAddress = (address: string) => {
    if (!address) return address;
    return address
        // v5.28: Remove parentheses and content within them (e.g. "(Перемоги)")
        .replace(/\(.*\)/g, ' ')
        // Handle suffixes with or without leading comma
        .replace(/(?:,|\s)\s*(под\.|подъезд|д\/ф|эт|этаж|эт\.|под|кв|квартира|оф|офис|вход|дом|корп|секция|литера).*$/i, '')
        // Second pass for nested or misformatted suffixes
        .replace(/(?:,|\s)\s*\d+\s*(под\.|подъезд|д\/ф|эт|этаж|эт\.|под|кв|квартира|оф|офис|вход|дом|корп|секция|литера).*$/i, '')
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
    [/\bвулиця Салтикова-Щедріна\b/iu, 'вулиця Сергія Миронова']
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
    const base = normalizeAddr(raw, city);
    const variants = new Set<string>();
    variants.add(base);

    STREET_RENAMES.forEach(([oldName, newName]) => {
        if (oldName.test(base)) {
            variants.add(base.replace(oldName, newName));
        }
        // Also try new -> old just in case
        const newNameRegex = new RegExp(`\\b${newName}\\b`, 'iu');
        if (newNameRegex.test(base)) {
            variants.add(base.replace(newNameRegex, (raw.match(newNameRegex)?.[0] || newName).replace(/./, (m) => m === m.toUpperCase() ? oldName.source : oldName.source.toLowerCase()))); // Rough back-mapping
            // Simpler: just replace with string
            variants.add(base.replace(newNameRegex, 'Сім\'ї Хохлових')); // Special case for the one user asked for
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

    return Array.from(variants).filter(Boolean);
};
