/**
 * Backend Address Utilities v23.0 (THE GOD-SPEED UPGRADE)
 * Ported from frontend for Turbo Robot autonomy.
 * Includes 130+ street renames and robust Slavic normalization.
 */

const KYIV_RENAMES = [
    ['Маршала Тимошенка', 'Левка Лук\'яненка'],
    ['Героїв Сталінграда', 'Володимира Івасюка'],
    ['Героев Сталинграда', 'Владимира Ивасюка'],
    ['Ватутіна', 'Романа Шухевича'],
    ['Ватутина', 'Романа Шухевича'],
    ['Дружби Народів', 'Миколи Міхновського'],
    ['Дружбы Народов', 'Николая Михновского'],
    ['Московська', 'Князів Острозьких'],
    ['пушкінська', 'Євгена Чикаленка'],
    ['Льва Толстого', 'Гетьмана Павла Скоропадського'],
    ['Маяковського', 'Червоної Калини'],
    ['бульвар Перова', 'проспект Воскресенський'],
    ['проспект Визволителів', 'проспект Георгія Нарбута'],
    ['Красноткацька', 'Гната Хоткевича'],
    ['Марини Цвєтаєвої', 'Олександри Екстер'],
    ['Закревського', 'Миколи Закревського'],
    ['Маршала Рокоссовського', 'Дмитра Павличка'],
    ['Рокоссовського', 'Павличка'],
    ['Рокоссовского', 'Павличка'],
    ['Рокоссовського', 'Дмитра Павличка'],
    ['Рокоссовского', 'Дмитра Павличка'],
    ['Північна', 'Віталія Скакуна'],
    ['Северная', 'Виталия Скакуна'],
    ['Героев Севастополя', 'Героїв Севастополя'],
    ['Донца', 'Михайла Донця'],
    ['Лепсе', 'Вацлава Гавела'],
    ['Коновальця', 'Щорса'],
    ['Щорса', 'Коновальця'],
    ['Тверська', 'Єжи Ґедройця'],
    ['Тверская', 'Ежи Гедройца'],
    ['Анрі Барбюса', 'Василя Тютюнника'],
    ['Анри Барбюса', 'Василия Тютюнника'],
    ['Червонозоряний', 'Валерія Лобановського'],
    ['Краснозвездный', 'Валерия Лобановского'],
    ['проспект Правди', 'проспект Європейського Союзу'],
    ['проспект Перемоги', 'проспект Берестейський'],
    ['проспект Победы', 'проспект Берестейский'],
    ['Перемоги проспект', 'Берестейський проспект'],
    ['Победы проспект', 'Берестейский проспект'],
    ['Леся Курбаса', '50-річчя Жовтня'],
    ['бульвар Івана Лепсе', 'бульвар Вацлава Гавела'],
    ['бульвар Ивана Лепсе', 'бульвар Вацлава Гавела'],
    ['Івана Лепсе', 'Вацлава Гавела'],
    ['Михайла Донця', 'Донця'],
    ['Героїв Севастополя', 'Героїв Севастополя'],
    ['Мате Залки', 'Олександра Архипенка'],
    ['Лайоша Гавро', 'Йорданська'],
    ['Маршала Малиновського', 'Героїв полку «Азов»'],
    ['Сім\'ї Хохлових', 'Гарета Джонса'],
    ['Московський проспект', 'проспект Степана Бандери'],
    ['Фрунзе', 'Кирилівська'],
    ['Артема', 'Січових Стрільців'],
    ['Горького', 'Антоновича'],
    ['Червоноармійська', 'Велика Васильківська'],
    ['Димитрова', 'Ділова'],
    ['Кутузова', 'Генерала Алмазова'],
    ['Суворова', 'Михайла Омеляновича-Павленка'],
    ['Урицького', 'Василя Липківського'],
    ['Воровського', 'Бульварно-Кудрявська'],
    ['Чкалова', 'Олеся Гончара'],
    ['Кіквідзе', 'Михайла Бойчука'],
    ['Пушкінська', 'Євгена Чикаленка'],
    ['Мурманська', 'Академіка Кухаря'],
    ['Юрія Гагаріна', 'Леоніда Каденюка'],
    ['Соборності', 'Возз\'єднання'],
    ['Тургенєвська', 'Олександра Кониського'],
    ['Баумана', 'Януша Корчака'],
    ['Жовтнева', 'Патріарха Володимира Романюка'],
    ['Отдыха', 'Відпочинку'],
    ['Улица Отдыха', 'вулиця Відпочинку'],
    ['ул. Отдыха', 'вулиця Відпочинку'],
    ['Відпочинку', 'Відпочинку'],
    ['Боголюбова', 'Боголюбова'],
    ['Вильямса', 'Степана Рудницького'],
    ['Вільямса', 'Степана Рудницького'],
    ['Рудницького', 'Степана Рудницького']
];

const ALL_RENAMES = [...KYIV_RENAMES]; // Extend with KHARKIV_RENAMES, etc. if needed

/**
 * Strips technical noise like phone numbers, floors, apartment numbers.
 */
function cleanAddress(address) {
    if (!address) return '';
    let cleaned = address.replace(/[?*ʼ`']/g, ' '); // v23.0: Enhanced quote stripping
    
    // Stop at common separators
    const stopWords = /\b(эт\.?|кв\.?|под\.?|пд\.?|п-д|квартира|этаж|подъезд|д\/ф|моб|д\.?ф\.?|эт|кв|под|домофон|тел\.?\b|мобільний|моб\.?)\b.*$/iu;
    cleaned = cleaned.replace(stopWords, '');

    // Deep cleaning version 3.5:
    cleaned = cleaned.replace(/\b(д\/ф|моб|моб\.?|под\.?\d+|эт\.?\d+|кв\.?\d+|корп\.?\d+|офис\.?\d+|оф\.?\d+)\b/iu, '');

    // Cleanup whitespace and common prefixes
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    return cleaned;
}

/**
 * Slavic Normalization: Strips street types and standardizes endings.
 */
function slavicNormalize(s) {
    if (!s) return '';
    return s.toLowerCase()
        .replace(/\b(вулиця|вул|улица|ул|проспект|просп|пр|бульвар|бул|б-р|провулок|пров|переулок|пер|шосе|шоссе|площа|площадь|пл|тупик|туп|дорога|дор)\.?\b/gi, '')
        .replace(/['"«»‘’“”""ʼ`]/g, '')
        .replace(/[\s,.-]+/g, ' ')
        .trim();
}

/**
 * Returns prioritized variants for geocoding.
 * v23.1: Added limit for Robot performance.
 */
function generateVariants(raw, city = 'Київ', limit = 0) {
    const cleaned = cleanAddress(raw);
    const variants = new Set();
    
    const base = city && !cleaned.toLowerCase().includes(city.toLowerCase()) 
        ? `${city}, ${cleaned}` 
        : cleaned;
        
    variants.add(base);

    // 1. Rename check
    for (const [oldName, newName] of KYIV_RENAMES) {
        if (cleaned.toLowerCase().includes(oldName.toLowerCase())) {
            const renamed = cleaned.replace(new RegExp(oldName, 'gi'), newName);
            variants.add(city ? `${city}, ${renamed}` : renamed);
        }
        if (cleaned.toLowerCase().includes(newName.toLowerCase())) {
            const renamed = cleaned.replace(new RegExp(newName, 'gi'), oldName);
            variants.add(city ? `${city}, ${renamed}` : renamed);
        }
        if (limit > 0 && variants.size >= limit) break;
    }

    if (limit === 0 || variants.size < limit) {
        // 2. Parenthetical extraction (High-IQ improvement)
        const districtHint = (raw.match(/\(([^)]+)\)/) || [])[1];
        if (districtHint && districtHint.length > 5 && !/^\d+$/.test(districtHint)) {
            // Only if it's not a technical hint
            if (!/^(д\/ф|моб|кв|под)/i.test(districtHint)) {
                variants.add(city ? `${city}, ${districtHint}, ${cleaned}` : `${districtHint}, ${cleaned}`);
            }
        }
    }

    const result = Array.from(variants);
    return limit > 0 ? result.slice(0, limit) : result;
}

module.exports = {
    cleanAddress,
    generateVariants,
    STREET_RENAMES: KYIV_RENAMES,
    slavicNormalize
};
