'use strict';

/**
 * turboGeoEnhanced.js — v1.0 SOTA BACKEND GEOCODING ENGINE
 *
 * 6-level cascaded geocoding strategy:
 *
 *  L1  DB Cache + LRU cache (instant, free)
 *  L2  addressGeo from FO data (zero API calls, GPS-precise)
 *  L3  Turbo parallel: photon + komoot + nominatim (fastest, broadest)
 *  L4  Variant expansion: UA-specific address mutations (handles renames, typos, ЖК, м-н)
 *  L5  Deep fallback: street-only, district, progressive term stripping
 *  L6  Emergency forced: ignore KML zone gate, accept any valid result inside city bounds
 *
 * Zone validation improvements:
 *  - Anomalous distance detection: cross-checks geocoded point against KML zone centroid
 *  - City-boundary double-guard: rejects results clearly outside Ukraine
 *  - Zone fallback chain: if exact zone fails → neighboring zone (≤ 2km) → any zone in division
 *
 * Ukrainian address specialization:
 *  - Handles хрущовки (building names without street number)
 *  - Handles both Cyrillic/transliterated street types (вул / вулиця / ul / ulytsia)
 *  - Handles дача / котедж / приватний сектор patterns
 *  - Handles renamed streets (both old and new name in parallel)
 *  - Handles apartment/entrance/door noise: "под.1 д/ф моб эт.5 кв.28" → stripped cleanly
 *  - Handles section markers: №55, корп.2, буд.3-А
 */

const axios = require('axios');
const logger = require('../src/utils/logger');
const selfHostRoutingHealth = require('../src/services/selfHostRoutingHealth');
const KmlService = require('../src/services/KmlService');
const { cleanAddress, generateVariants } = require('../src/utils/addressUtils');

// ============================================================
// PROVIDER CIRCUIT BREAKER (free public APIs are rate-limited)
// ============================================================
const GEO_FAIL_THRESHOLD = 3;
const GEO_BLOCK_MS = 30 * 1000;       // 30s short cooldown on hard network errors
const GEO_BLOCK_MS_429 = 60 * 1000;   // v7.9: 1 minute on rate-limit (was 5min — too long)
const geoProviderFailures = new Map();     // provider -> { failures, blockedUntil, lastError }
const providerNextAllowedAt = new Map();   // provider -> next epoch ms
const providerQueue = new Map();           // provider -> promise chain

// v7.2: Adaptive intervals (ms) per provider
const PROVIDER_INTERVALS = {
    'nominatim': 2500,        // Very strict public API
    'nominatim-mirror': 2000,
    'default': 1200
};


const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isProviderBlocked(provider) {
    const s = geoProviderFailures.get(provider);
    return !!(s && s.blockedUntil && Date.now() < s.blockedUntil);
}

function markProviderSuccess(provider) {
    geoProviderFailures.delete(provider);
}

function markProviderFailure(provider, err) {
    const prev = geoProviderFailures.get(provider) || { failures: 0, blockedUntil: 0, lastError: null };
    const failures = (prev.failures || 0) + 1;
    const status = Number(err?.response?.status || 0);
    const code = err?.code || err?.message || 'ERR';

    let blockedUntil = prev.blockedUntil || 0;
    const shouldBlock =
        status === 429 ||
        status === 401 ||
        status === 403 ||
        status === 404 ||
        code === 'ECONNREFUSED' ||
        code === 'ENOTFOUND' ||
        failures >= GEO_FAIL_THRESHOLD;

    if (shouldBlock) {
        blockedUntil = Date.now() + (status === 429 ? GEO_BLOCK_MS_429 : GEO_BLOCK_MS);
    }

    geoProviderFailures.set(provider, { failures, blockedUntil, lastError: status ? `HTTP_${status}` : String(code) });
}

// v7.9: Emergency unblock — clears all circuit breakers so geocoding can retry immediately
function resetAllGeoProviders() {
    geoProviderFailures.clear();
    providerNextAllowedAt.clear();
    logger.info('[GeoEnhanced] 🔄 All geo provider circuit breakers reset');
}

async function scheduleProviderCall(provider, fn) {
    const prev = providerQueue.get(provider) || Promise.resolve();
    const next = prev
        .catch(() => {})
        .then(async () => {
            const now = Date.now();
            const nextAllowed = providerNextAllowedAt.get(provider) || 0;
            const waitMs = Math.max(0, nextAllowed - now);
            if (waitMs > 0) await sleep(waitMs);
            
            const startedAt = Date.now();
            // v7.2: Use adaptive interval + jitter (±15%)
            const baseInterval = PROVIDER_INTERVALS[provider] || PROVIDER_INTERVALS.default;
            const jitter = baseInterval * 0.15 * (Math.random() * 2 - 1);
            providerNextAllowedAt.set(provider, startedAt + baseInterval + jitter);
            
            return fn();
        });
    providerQueue.set(provider, next);
    return next;
}


// ============================================================
// CITY BOUNDING BOXES — guard against wild geocode results
// ============================================================
const CITY_BOUNDS = {
    'Харків': { minLat: 49.88, maxLat: 50.08, minLng: 36.07, maxLng: 36.47 },
    'Харьков': { minLat: 49.88, maxLat: 50.08, minLng: 36.07, maxLng: 36.47 },
    'Kharkiv': { minLat: 49.88, maxLat: 50.08, minLng: 36.07, maxLng: 36.47 },
    'Київ': { minLat: 50.21, maxLat: 50.59, minLng: 30.24, maxLng: 30.82 },
    'Киев': { minLat: 50.21, maxLat: 50.59, minLng: 30.24, maxLng: 30.82 },
    'Kyiv': { minLat: 50.21, maxLat: 50.59, minLng: 30.24, maxLng: 30.82 },
    'Дніпро': { minLat: 48.30, maxLat: 48.55, minLng: 34.90, maxLng: 35.20 },
    'Днепр': { minLat: 48.30, maxLat: 48.55, minLng: 34.90, maxLng: 35.20 },
    'Dnipro': { minLat: 48.30, maxLat: 48.55, minLng: 34.90, maxLng: 35.20 },
    'Одеса': { minLat: 46.25, maxLat: 46.60, minLng: 30.55, maxLng: 30.90 },
    'Одесса': { minLat: 46.25, maxLat: 46.60, minLng: 30.55, maxLng: 30.90 },
    'Odesa': { minLat: 46.25, maxLat: 46.60, minLng: 30.55, maxLng: 30.90 },
    'Львів': { minLat: 49.77, maxLat: 49.93, minLng: 23.90, maxLng: 24.15 },
    'Львов': { minLat: 49.77, maxLat: 49.93, minLng: 23.90, maxLng: 24.15 },
    'Lviv': { minLat: 49.77, maxLat: 49.93, minLng: 23.90, maxLng: 24.15 },
    'Полтава': { minLat: 49.53, maxLat: 49.65, minLng: 34.46, maxLng: 34.65 },
    'Poltava': { minLat: 49.53, maxLat: 49.65, minLng: 34.46, maxLng: 34.65 },
};

// Suburb extension: if city has suburbs, extend bounding box by this km
const SUBURB_EXTENSION_DEG = 0.15; // ~17km at 50° latitude

// ============================================================
// STREET RENAME DICTIONARIES — old→new mapping for geocoding
// Covers: Kyiv, Kharkiv, Odesa, Poltava (+ bonus Дніпро, Львів)
// ============================================================

const KYIV_STREET_RENAMES = {
    'Московський': 'Степана Бандери',
    'Московский': 'Степана Бандери',
    'Академіка Туполєва': 'Мрії',
    'Академика Туполева': 'Мрії',
    'Маршала Тимошенка': 'Левка Лук\'яненка',
    'Героїв Сталінграда': 'Володимира Івасюка',
    'Героев Сталинграда': 'Владимира Ивасюка',
    'Ватутіна': 'Романа Шухевича',
    'Ватутина': 'Романа Шухевича',
    'Північна': 'Віталія Скакуна',
    'Северная': 'Виталия Скакуна',
    'Лепсе': 'Вацлава Гавела',
    'Перова': 'Воскресенський',
    'Красноткацька': 'Гната Хоткевича',
    'Пушкінська': 'Євгена Чикаленка',
    'Пушкинская': 'Євгена Чикаленка',
    'Маяковського': 'Червоної Калини',
    'Фрунзе': 'Кирилівська',
    'Артема': 'Січових Стрільців',
    'Горького': 'Антоновича',
    'Червоноармійська': 'Велика Васильківська',
    'Красноармейская': 'Велика Васильківська',
    'Димитрова': 'Ділова',
    'Кутузова': 'Генерала Алмазова',
    'Суворова': 'Михайла Омеляновича-Павленка',
    'Урицького': 'Василя Липківського',
    'Урицкого': 'Василя Липківського',
    'Воровського': 'Бульварно-Кудрявська',
    'Воровского': 'Бульварно-Кудрявська',
    'Чкалова': 'Олеся Гончара',
    'Юрія Гагаріна': 'Леоніда Каденюка',
    'Гагаріна': 'Леоніда Каденюка',
    'Гагарина': 'Леоніда Каденюка',
    'Баумана': 'Януша Корчака',
    'Жовтнева': 'Патріарха Володимира Романюка',
    'Октябрьская': 'Патріарха Володимира Романюка',
    'Тургенєвська': 'Олександра Кониського',
    'Тургеневская': 'Олександра Кониського',
    'Кіквідзе': 'Михайла Бойчука',
    'Киквидзе': 'Михайла Бойчука',
    'Мурманська': 'Академіка Кухаря',
    'Мурманская': 'Академіка Кухаря',
    'Дружби Народів': 'Миколи Міхновського',
    'Дружбы Народов': 'Миколи Міхновського',
    'Московська': 'Князів Острозьких',
    'Московская': 'Князів Острозьких',
    'Льва Толстого': 'Гетьмана Павла Скоропадського',
    'проспект Визволителів': 'проспект Георгія Нарбута',
    'проспект Освободителей': 'проспект Георгія Нарбута',
    'Марини Цвєтаєвої': 'Олександри Екстер',
    'Закревського': 'Миколи Закревського',
    'Закревского': 'Миколи Закревського',
    'Маршала Рокоссовського': 'Дмитра Павличка',
    'Маршала Рокоссовского': 'Дмитра Павличка',
    'Рокоссовського': 'Дмитра Павличка',
    'Рокоссовского': 'Дмитра Павличка',
    'Героїв Сталінграда': 'Володимира Івасюка',
    'Донця': 'Михайла Донця',
    'Донца': 'Михайла Донця',
    'Коновальця': 'Євгена Коновальця',
    'Щорса': 'Коновальця',
    'Тверська': 'Єжи Ґедройця',
    'Тверская': 'Ежи Гедройца',
    'Анрі Барбюса': 'Василя Тютюнника',
    'Анри Барбюса': 'Василя Тютюнника',
    'Червонозоряний': 'Валерія Лобановського',
    'Краснозвездный': 'Валерия Лобановского',
    'проспект Правди': 'проспект Європейського Союзу',
    'проспект Правды': 'проспект Європейського Союзу',
    'проспект Перемоги': 'проспект Берестейський',
    'проспект Победы': 'проспект Берестейский',
    'Мате Залки': 'Олександра Архипенка',
    'Лайоша Гавро': 'Йорданська',
    'Маршала Малиновського': 'Героїв полку «Азов»',
    'Маршала Малиновского': 'Героїв полку «Азов»',
    'Сім\'ї Хохлових': 'Гарета Джонса',
    'Семьи Хохловых': 'Гарета Джонса',
    'Вильямса': 'Степана Рудницького',
    'Вільямса': 'Степана Рудницького',
    'Красноказачья': 'Олени Теліги',
    'Соборності проспект': 'проспект Соборності',
    'Возз\'єднання': 'Соборності',
    'Воссоединения': 'Соборності',
    '50-річчя Жовтня': 'Леся Курбаса',
    '50-летия Октября': 'Леся Курбаса',
    'Щусєва': 'Михайла Красуського',
    'Щусева': 'Михайла Красуського',
    'Пирогова': 'Володимира Винниченка',
    'Коцюбинського': 'Михайла Коцюбинського',
    'Коцюбинского': 'Михайла Коцюбинського',
    'Кірова': 'Миколи Амосова',
    'Кирова': 'Миколи Амосова',
    'Комінтерну': 'Симона Петлюри',
    'Коминтерна': 'Симона Петлюри',
    'Леніна': 'Бориса Гмирі',
    'Линевича': 'Олени Пчілки',
    'Пестеля': 'Івана Mazepy',
    'Гулак-Артемовського': 'Гулака-Артемовського',
    'Декабристів': 'Василя Симоненка',
    'Декабристов': 'Василя Симоненка',
};

const KHARKIV_STREET_RENAMES = {
    'Московський проспект': 'Героїв Харкова',
    'Московский проспект': 'Героев Харькова',
    'Московська': 'Героїв Харкова',
    'Московская': 'Героїв Харкова',
    'Мурманська': 'Академіка Кухаря',
    'Мурманская': 'Академіка Кухаря',
    'Гагаріна проспект': 'Аерокосмічний проспект',
    'Гагарина проспект': 'Аэрокосмический проспект',
    'Гагаріна': 'Аерокосмічний',
    'Гагарина': 'Аэрокосмический',
    'Пушкінська': 'Григорія Сковороди',
    'Пушкинская': 'Григория Сковороды',
    'Плеханівська': 'Георгія Тарасенко',
    'Плехановская': 'Георгия Тарасенко',
    'Героїв Сталінграда': 'Байрона',
    'Героев Сталинграда': 'Байрона',
    'Маршала Бажанова': 'Чорноглазівська',
    'Маршала Бажанова': 'Чорноглазівська',
    'Маршала Конева': 'Гончарівська',
    'Маршала Конева': 'Гончарівська',
    'Конєва': 'Гончарівська',
    'Кирова': 'Григорія Сковороди',
    'Кірова': 'Григорія Сковороди',
    'Дзержинського': 'Олександра Яроша',
    'Дзержинского': 'Олександра Яроша',
    'Комзінська': 'Марії Башкирцевої',
    'Комзинская': 'Марії Башкирцевої',
    'Краснодонська': 'Авіаційна',
    'Краснодонская': 'Авіаційная',
    'Орджонікідзе': 'Сергія Колачевського',
    'Орджоникидзе': 'Сергія Колачевського',
    'Рози Люксембург': 'Валентини Серова',
    'Клари Цеткін': 'Захариї Ханана',
    'Клары Цеткин': 'Захариї Ханана',
    'Карла Лібкнехта': 'Олександра Невського',
    'Карла Либкнехта': 'Олександра Невського',
    'Фрунзе': 'Петра Болбочана',
    'Артема': 'Івана Труша',
    'Чапаєва': 'Володимира Касіяна',
    'Чапаева': 'Володимира Касіяна',
    'Ломоносова': 'Вадима Меллера',
    'Байрона': 'Героїв Сталінграда',
    'Свердлова': 'Миколи Міхновського',
    'Свердлова': 'Миколи Міхновського',
    'Кропоткіна': 'Михайла Драгоманова',
    'Кропоткина': 'Михайла Драгоманова',
    'Калініна': 'Генерала Момота',
    'Калинина': 'Генерала Момота',
    'Толстого': 'Валентина Чорновола',
    'Перемоги': 'Героїв Харькова',
    'Победы': 'Героїв Харькова',
    'Леніна': 'Європейська',
    'Пролетарська': 'Григорія Сковороди',
    'Пролетарская': 'Григорія Сковороди',
    'Красногвардійська': 'Богдана Хмельницького',
    'Красногвардейская': 'Богдана Хмельницького',
    'Карла Маркса': 'Академіка Павлова',
    'Раднаркомівська': 'Семена Кузнеця',
    'Раднаркомовская': 'Семена Кузнеця',
    'Блюхера': 'Каштальського',
    'Бондаренка': 'Героїв Харькова',
};

const ODESSA_STREET_RENAMES = {
    'Котовського': 'Гетьмана Сагайдачного',
    'Котовского': 'Гетьмана Сагайдачного',
    'Жукова': 'Олександра Івахненка',
    'Жукова проспект': 'Тамаші Axметелої',
    'Корольова': 'Анатолія Солов\'яненка',
    'Королева': 'Анатолія Солов\'яненка',
    'Маршала Говорова': 'Генерала Петрова',
    'Говорова': 'Генерала Петрова',
    'Гагаріна': 'Січових Стрільців',
    'Гагарина': 'Січових Стрільців',
    'Пирогова': 'Михайла Грушевського',
    'Горького': 'Софії Перовської',
    'Гастелло': 'Остапа Вишні',
    'Лесі Українки': 'Лесі Українки',
    'Совєтської Армії': 'Героїв Оборони Одеси',
    'Советской Армии': 'Героїв Обороны Одесы',
    'Генерала Петрова': 'Генерала Бетсмена',
    'Свердлова': 'Гетьмана Петра Дорошенка',
    'Свердлова': 'Гетьмана Петра Дорошенка',
    'Кірова': 'Героїв Крут',
    'Кирова': 'Героїв Крут',
    'Чапаєва': 'Сергія Ядова',
    'Чапаева': 'Сергія Ядова',
    'Фрунзе': 'Дніпровська',
    'Дзержинського': 'Юрія Олеші',
    'Дзержинского': 'Юрія Олеші',
    'Комсомольська': 'Дерибасівська',
    'Комсомольская': 'Дерибасівська',
    'Красногвардійська': 'Преображенська',
    'Красногвардейская': 'Преображенська',
    'Калініна': 'Академіка Воронцова',
    'Калинина': 'Академіка Воронцова',
    'Леніна': 'Дмитра Кантеміра',
    'Леніна проспект': 'Олександра Прохорова',
    'Красноармійська': 'Гоголя',
    'Красноармейская': 'Гоголя',
    'Маяковського': 'Пантелеймонівська',
    'Маяковского': 'Пантелеймонівська',
    'Карла Маркса': 'Івана та Юрія Лип',
    'Толстого': 'Пирогівська',
    'Воровського': 'Князя Гагаріна',
    'Воровского': 'Князя Гагаріна',
    'Урицького': 'Генерала Зотова',
    'Урицкого': 'Генерала Зотова',
    'Щорса': 'Михайла Грушевського',
    'Щорса': 'Михайла Грушевського',
    'Бебеля': 'Катерининська',
    'Плеханова': 'Віцинська',
    'Клари Цеткін': 'Паньківська',
    'Клары Цеткин': 'Паньківська',
    'Рози Люксембург': 'Єврейська',
    'Орджонікідзе': 'Макаренка',
    'Орджоникидзе': 'Макаренка',
    'Постишева': 'Генерала Цигикова',
    'Постишева': 'Генерала Цигикова',
    'Косіора': 'Коблевська',
    'Косиора': 'Коблевська',
    'Червоноармійська': 'Гоголя',
    'Червоногвардійська': 'Преображенська',
    'Жовтневої Революції': 'Генерала Лавриненка',
    'Октябрьской Революции': 'Генерала Лавриненка',
    '50-річчя СРСР': 'Генерала Акименка',
    '50-летия СССР': 'Генерала Акименка',
    'Мічуріна': 'Мечникова',
    'Мичурина': 'Мечникова',
    'Суворова': 'Артилерійська',
    'Адмірала Лазарєва': 'Адмірала Лазарєва',
    'Адмирала Лазарева': 'Адмирала Лазарева',
};

const POLTAVA_STREET_RENAMES = {
    'Фрунзе': 'Симона Петлюри',
    'Кірова': 'Юрія Руда',
    'Кирова': 'Юрія Руда',
    'Карла Маркса': 'Василя Стуса',
    'Леніна': 'Героїв України',
    'Леніна проспект': 'Незалежності',
    'Дзержинського': 'Олени Пчілки',
    'Дзержинского': 'Олени Пчілки',
    'Красноармійська': 'Соборності',
    'Красноармейская': 'Соборності',
    'Рози Люксембург': 'Михайла Грушевського',
    'Клари Цеткін': 'Михайла Грушевського',
    'Котовського': 'Гетьмана Мазепи',
    'Котовского': 'Гетьмана Мазепи',
    'Гагаріна': 'Леоніда Каденюка',
    'Гагарина': 'Леоніда Каденюка',
    'Горького': 'Василя Симоненка',
    'Комсомольська': 'Івана Мазепи',
    'Комсомольская': 'Івана Мазепи',
    'Свердлова': 'Василя Кука',
    'Свердлова': 'Василя Кука',
    'Орджонікідзе': 'Петра Калнишевського',
    'Орджоникидзе': 'Петра Калнишевського',
    'Комінтерну': 'Гетьмана Сагайдачного',
    'Коминтерна': 'Гетьмана Сагайдачного',
    'Чапаєва': 'Січових Стрільців',
    'Чапаева': 'Січових Стрільців',
    'Калініна': 'Артема Веделя',
    'Калинина': 'Артема Веделя',
    'Пирогова': 'Соломії Крушельницької',
    'Совєтська': 'Воскресенська',
    'Советская': 'Воскресенская',
    'Пушкіна': 'Миколи Гоголя',
    'Пушкинская': 'Миколи Гоголя',
    '50-річчя Жовтня': 'Патріотична',
    '50-летия Октября': 'Патріотична',
    'Жовтнева': 'Героїв Небесної Сотні',
    'Октябрьская': 'Героїв Небесної Сотні',
    'Артема': 'Олени Telігі',
    'Постішева': 'Олени Теліги',
    'Постышева': 'Олени Теліги',
    'Щорса': 'Григорія Сковороди',
    'Толстого': 'Анатолія Солов\'яненка',
    'Крупської': 'Марії Башкирцевої',
    'Крупской': 'Марії Башкирцевої',
    'Луначарського': 'Віктора Андрусіва',
    'Луначарского': 'Віктора Андрусіва',
    'Карла Лібкнехта': 'Академіка Вернадського',
    'Карла Либкнехта': 'Академіка Вернадського',
};

const DNIPRO_STREET_RENAMES = {
    'Карла Маркса проспект': 'Ярослава Мудрого проспект',
    'Карла Маркса': 'Ярослава Мудрого',
    'Кірова': 'Генерала Пушкіна',
    'Кирова': 'Генерала Пушкіна',
    'Гагаріна': 'Леоніда Каденюка',
    'Гагарина': 'Леоніда Каденюка',
    'Дзержинського': 'Володимира Мономаха',
    'Дзержинского': 'Володимира Мономаха',
    'Калініна': 'Дмитра Яворницького',
    'Калинина': 'Дмитра Яворницького',
    'Фрунзе': 'Михайла Грушевського',
    'Чапаєва': 'Івана Богуна',
    'Чапаева': 'Івана Богуна',
    'Комсомольська': 'Володимирська',
    'Комсомольская': 'Володимирська',
    'Свердлова': 'Олени Степанівни',
    'Артема': 'Олени Теліги',
    'Леніна': 'Григорія Сковороди',
    'Горького': 'Василя Симоненка',
    'Котовського': 'Гетьмана Сагайдачного',
    'Котовского': 'Гетьмана Сагайдачного',
    'Орджонікідзе': 'Евгена Коновальця',
    'Орджоникидзе': 'Евгена Коновальця',
    'Красноармійська': 'Володимира Винниченка',
    'Красноармейская': 'Володимира Винниченка',
    'Пирогова': 'Миколи Амосова',
    'Щорса': 'Коновальця',
    'Мічуріна': 'Мечникова',
    'Мичурина': 'Мечникова',
    'Московська': 'Князів Острозьких',
    'Московская': 'Князів Острозьких',
};

const LVIV_STREET_RENAMES = {
    'Фрунзе': 'Володимира Винниченка',
    'Дзержинського': 'Вітовського',
    'Дзержинского': 'Вітовського',
    'Кірова': 'Тараса Бобича',
    'Кирова': 'Тараса Бобича',
    'Чапаєва': 'Тараса Бобича',
    'Чапаева': 'Тараса Бобича',
    'Свердлова': 'Петра Дорошенка',
    'Артема': 'Володимира Винниченка',
    'Гагаріна': 'Андрія Шептицького',
    'Гагарина': 'Андрія Шептицького',
    'Комінтерну': 'Андрія Шептицького',
    'Коминтерна': 'Андрія Шептицького',
    'Леніна': 'Вулиця Гнатюка',
    'Калініна': 'Михайла Грушевського',
    'Калинина': 'Михайла Грушевського',
    'Орджонікідзе': 'Орлика',
    'Орджоникидзе': 'Орлика',
    'Пирогова': 'Соломії Крушельницької',
};

const ALL_CITY_RENAMES = {
    'Київ': KYIV_STREET_RENAMES,
    'Киев': KYIV_STREET_RENAMES,
    'Kyiv': KYIV_STREET_RENAMES,
    'Харків': KHARKIV_STREET_RENAMES,
    'Харьков': KHARKIV_STREET_RENAMES,
    'Kharkiv': KHARKIV_STREET_RENAMES,
    'Одеса': ODESSA_STREET_RENAMES,
    'Одесса': ODESSA_STREET_RENAMES,
    'Odesa': ODESSA_STREET_RENAMES,
    'Полтава': POLTAVA_STREET_RENAMES,
    'Poltava': POLTAVA_STREET_RENAMES,
    'Дніпро': DNIPRO_STREET_RENAMES,
    'Днепр': DNIPRO_STREET_RENAMES,
    'Dnipro': DNIPRO_STREET_RENAMES,
    'Львів': LVIV_STREET_RENAMES,
    'Львов': LVIV_STREET_RENAMES,
    'Lviv': LVIV_STREET_RENAMES,
};

// ============================================================
// UKRAINIAN ADDRESS NOISE REMOVAL
// ============================================================

/**
 * Deep cleaning of Ukrainian/Russian delivery addresses.
 * Removes apartment info, entrance, floor, dialer codes, notes.
 * v2: Fixed regex bugs, improved parentheses handling, added "г." prefix removal.
 */
function deepCleanAddress(raw) {
    if (!raw) return '';
    let s = raw;

    // Remove "Украина", "Україна" country name
    s = s.replace(/Україн[аи]/gi, '');
    s = s.replace(/Украин[аы]/gi, '');

    // Remove "г." / "г " city prefix: "г. КИЇВ" → "КИЇВ"
    // NOTE: \b does NOT work with Cyrillic in JS regex, use (^|[\s,]) instead
    s = s.replace(/(^|[\s,])г\.\s*/gi, '$1');
    s = s.replace(/(^|[\s,])м\.\s*/gi, '$1');

    // Remove GPS coordinates if accidentally left in address string
    s = s.replace(/Lat\s*=\s*"?[\d.]+"\s*/gi, '');
    s = s.replace(/Long\s*=\s*"?[\d.]+"\s*/gi, '');
    s = s.replace(/AddressStr\s*=\s*"?[^"]+"\s*/gi, '');

    // Remove phone numbers FIRST (before other noise removal): (093) 123-45-67 | +380...
    s = s.replace(/(\+?380|\(?0\d{2}\)?)\s?[\d\s\-]{7,}/g, '');

    // Remove door codes + everything after until comma/semicolon/end
    // д/ф моб, д/ф 123, код 456, домофон, дф
    s = s.replace(/[, ]?\s*(д\/ф|д\.ф\.|домофон|дф|код\s*\d+)[^,;]*/gi, '');

    // Remove mobile/intercom markers + everything after until comma/semicolon/end
    s = s.replace(/[, ]?\s*моб(?:ільний|ильный)?\.?\s*\d*[^,;]*/gi, '');

    // Remove apartment/suite noise: кв. 28, квартира 5, оф. 3
    s = s.replace(/(^|[\s,])(кв|квартира|апарт|оф|офис|офіс)\s*\.?\s*\d+[а-яіє]*\b/gi, '$1');

    // Remove entrance / подъезд / під'їзд: под.1 | п-д 2 | под 3
    s = s.replace(/(^|[\s,])(под\.?|підʼїзд|подъезд|п-д)\s*\.?\s*\d+\b/gi, '$1');

    // Remove floor / этаж: эт.5 | этаж 3 | поверх 2
    s = s.replace(/(^|[\s,])(эт\.?|этаж|поверх|пов\.?)\s*\.?\s*\d+\b/gi, '$1');

    // Remove "д." house prefix but KEEP the number: "д.16е" → "16е"
    s = s.replace(/(^|[\s,])д\.\s*(?=\d)/gi, '$1');

    // Remove "буд." prefix but KEEP the number: "буд.3-А" → "3-А"
    s = s.replace(/(^|[\s,])буд\.?\s*(?=\d)/gi, '$1');

    // Remove "корп." suffix: "корп.2" → removed (building section noise)
    s = s.replace(/,?\s*корп\.?\s*\d+[а-яіє]?\s*/gi, '');

    // Remove remaining "№" markers: "№55" 
    s = s.replace(/,?\s*№\s*\d+\s*/gi, '');

    // Remove parenthetical content that is clearly tech noise (apt/floor/intercom)
    // Keep parentheses that look like street names (Cyrillic words, no digits-only)
    s = s.replace(/\((?:под\.?\s*\d+|кв\.?\s*\d+|эт\.?\s*\d+|пов\.?\s*\d+|д\/ф[^)]*|моб[^)]*|оф\.?\s*\d+|літ\.?\s*\w+|лит\.?\s*\w+|корп\.?\s*\d+|буд\.?\s*\d+)\)/gi, '');

    // Remove "под." without number at end of string
    s = s.replace(/,?\s*под\.?\s*$/gi, '');

    // Remove trailing/leading noise: commas, spaces
    s = s.replace(/,\s*$/g, '');
    s = s.replace(/^[, ]+/, '');
    s = s.replace(/,\s*,/g, ','); // double commas
    s = s.replace(/\s+/g, ' ').trim();

    return s;
}

/**
 * Normalize Ukrainian address abbreviations to full words.
 * "просп." → "проспект", "вул." → "вулиця", etc.
 * Returns the normalized address string.
 */
function normalizeUkrainianAddress(address) {
    if (!address) return '';
    let s = address;

    // Normalize street type abbreviations
    s = s.replace(/\bпросп\.?\s*/gi, 'проспект ');
    s = s.replace(/\bпр-т\.?\s*/gi, 'проспект ');
    s = s.replace(/\bвул\.?\s*/gi, 'вулиця ');
    s = s.replace(/\bул\.?\s*/gi, 'вулиця ');
    s = s.replace(/\bпров\.?\s*/gi, 'провулок ');
    s = s.replace(/\bпер\.?\s*/gi, 'провулок ');
    s = s.replace(/\bбул\.?\s*/gi, 'бульвар ');
    s = s.replace(/\bб-р\.?\s*/gi, 'бульвар ');
    s = s.replace(/\bпл\.?\s*/gi, 'площа ');
    s = s.replace(/\bшосе\.?\s*/gi, 'шосе ');
    s = s.replace(/\bнаб\.?\s*/gi, 'набережна ');

    // Normalize "г. КИЇВ" → "Київ" (city name casing)
    s = s.replace(/\bКиїв\b/gi, 'Київ');
    s = s.replace(/\bКИЇВ\b/g, 'Київ');
    s = s.replace(/\bКиев\b/g, 'Київ');
    s = s.replace(/\bХарків\b/gi, 'Харків');
    s = s.replace(/\bХарьков\b/g, 'Харків');

    // Clean up double spaces
    s = s.replace(/\s+/g, ' ').trim();

    return s;
}

/**
 * Apply city-specific street renames to generate geocoding variants.
 * "проспект Степана Бандери (Московський)" → also generates variant with "Московський"
 * Returns array of address strings with old/new names substituted.
 */
function applyCityRenames(address, city) {
    const results = [address];
    const renames = ALL_CITY_RENAMES[city] || KYIV_STREET_RENAMES;

    const parenMatch = address.match(/\(([^)]+)\)/);
    if (parenMatch) {
        const oldName = parenMatch[1].trim();
        if (oldName.length > 2 && !/^\d+$/.test(oldName)) {
            const newName = renames[oldName];
            if (newName) {
                const withoutParen = address.replace(/\s*\([^)]+\)/, '').trim();
                const mainPart = withoutParen.replace(newName, oldName);
                results.push(mainPart);
            }
        }
    }

    for (const [oldName, newName] of Object.entries(renames)) {
        if (address.toLowerCase().includes(oldName.toLowerCase())) {
            const swapped = address.replace(new RegExp(oldName, 'gi'), newName);
            if (swapped !== address) results.push(swapped);
        }
        if (address.toLowerCase().includes(newName.toLowerCase())) {
            const swapped = address.replace(new RegExp(newName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), oldName);
            if (swapped !== address) results.push(swapped);
        }
    }

    return [...new Set(results)];
}

/**
 * Extract just "street name + house number" from a cleaned address.
 * "вулиця Полярна, 3, Київ" → "Полярна 3"
 */
function extractStreetAndHouse(address) {
    if (!address) return null;
    let s = address;

    // Remove city name
    s = s.replace(/\bКиїв\b/gi, '').replace(/\bХарків\b/gi, '');
    // Remove street type prefix
    s = s.replace(/\b(вулиця|вул|улиця|ул|проспект|просп|пр-т|бульвар|бул|провулок|пров|площа|пл|набережна|наб)\.?\s*/gi, '');
    // Clean up
    s = s.replace(/^[, ]+/, '').replace(/[, ]+$/, '').replace(/\s+/g, ' ').trim();

    // Try to extract "Name, Number" or "Name Number"
    const match = s.match(/^([А-ЯІЄҐа-яієґ\'\s]+?)[, ]\s*(\d+[а-яієА-ЯІЄҐ]*)\s*$/);
    if (match) {
        return `${match[1].trim()} ${match[2].trim()}`;
    }

    return s.length > 3 ? s : null;
}

/**
 * Generate Ukrainian-specialized address variants for geocoding.
 * v2: Uses normalizeUkrainianAddress, applyCityRenames, extractStreetAndHouse.
 * Returns ordered array best→worst.
 */
function generateUAVariants(raw, city) {
    const cleaned = deepCleanAddress(raw);
    const normalized = normalizeUkrainianAddress(cleaned);
    const baseVariants = generateVariants(cleaned, city, 8) || [];

    const variants = new Set(baseVariants);

    // 1. Add normalized version (expanded abbreviations)
    if (normalized !== cleaned) {
        variants.add(normalized);
        if (city) variants.add(`${city}, ${normalized}`);
    }

    // 2. Add city-prefixed version of each existing variant
    for (const v of [...variants]) {
        if (city && !v.toLowerCase().includes(city.toLowerCase())) {
            variants.add(`${city}, ${v}`);
        }
    }

    // 3. Street type normalization: all possible combos
    const streetTypeMap = [
        [/\bвул\.\s*/gi, 'вулиця '],
        [/\bвулиця\s+/gi, 'вул. '],
        [/\bпров\.\s*/gi, 'провулок '],
        [/\bпросп\.\s*/gi, 'проспект '],
        [/\bбул\.\s*/gi, 'бульвар '],
        [/\bпр\.\s*/gi, 'проспект '],
        [/\bул\.\s*/gi, 'вулиця '],
    ];
    const baseClean = cleaned;
    for (const [from, to] of streetTypeMap) {
        const replaced = baseClean.replace(from, to).trim();
        if (replaced !== baseClean) {
            variants.add(replaced);
            if (city) variants.add(`${city}, ${replaced}`);
        }
    }

    // 4. Apply city rename variants (old↔new street names)
    const renamedVariants = applyCityRenames(normalized, city);
    for (const rv of renamedVariants) {
        if (rv !== normalized && rv.length > 4) {
            variants.add(rv);
            if (city) variants.add(`${city}, ${rv}`);
        }
    }

    // 5. Remove house number → street-only fallback
    const noHouse = normalized.replace(/[,\s]+\d+[а-яіє/a-z-]*\s*$/i, '').trim();
    if (noHouse && noHouse !== normalized && noHouse.length > 5) {
        variants.add(noHouse);
        if (city) variants.add(`${city}, ${noHouse}`);
    }

    // 6. Extract parenthetical content as alt street name (old street names)
    const parenMatch = raw.match(/\(([^)]+)\)/);
    if (parenMatch) {
        const inner = parenMatch[1].trim();
        if (inner.length > 3 && !/^\d+$/.test(inner) && !/кв|эт|под|моб|д\/ф|літ|лит/i.test(inner)) {
            const houseMatch = cleaned.match(/,?\s*(\d+[а-яіє]*)$/i);
            const house = houseMatch ? houseMatch[1] : '';

            // Add "OldName house, City" variant
            variants.add(`${inner}${house ? ' ' + house : ''}, ${city || 'Київ'}`.trim());
            variants.add(`${city || 'Київ'}, ${inner}${house ? ' ' + house : ''}`.trim());

            // Also try with street type prefix
            const prefix = cleaned.match(/^(вулиця|вул\.?|проспект|просп\.?|провулок|пров\.?|бульвар|бул\.?)\s*/i);
            const prefixStr = prefix ? prefix[1] + ' ' : '';
            variants.add(`${city || 'Київ'}, ${prefixStr}${inner}${house ? ' ' + house : ''}`.trim());
        }
    }

    // 7. Extract just "street + house" without any prefix
    const streetHouse = extractStreetAndHouse(normalized);
    if (streetHouse && streetHouse.length > 3) {
        variants.add(`${city || 'Київ'}, ${streetHouse}`);
    }

    // 8. Common Ukrainian suburb/village patterns
    if (/\b(дача|дачне|ДНТ|СТ|садов)\b/i.test(raw)) {
        const districtMatch = raw.match(/([А-ЯІЄҐ][а-яієґ]+(?:\s+[А-ЯІЄҐ][а-яієґ]+)?)\s+район/i);
        if (districtMatch) {
            variants.add(`${districtMatch[1]} район, ${city || ''}`);
        }
    }

    // 9. Remove "корп." or "буд." suffixes that confuse geocoders
    const noBuilding = cleaned.replace(/,?\s*(корп\.?|буд\.?|корпус|будинок)\s*\d+[а-яіє]?/gi, '').trim();
    if (noBuilding !== cleaned) {
        variants.add(noBuilding);
        if (city) variants.add(`${city}, ${noBuilding}`);
    }

    // 10. Transliteration fallback for key Ukrainian letters
    const transliterated = normalized
        .replace(/ї/gi, 'i').replace(/є/gi, 'ye').replace(/і/gi, 'i')
        .replace(/ґ/gi, 'g').replace(/'/g, '');
    if (transliterated !== normalized && transliterated.length > 4) {
        variants.add(transliterated);
    }

    // Filter empty, dedupe, return ordered
    return [...new Set([...variants])].filter(v => v && v.length > 4);
}

// ============================================================
// PROVIDER IMPLEMENTATIONS
// ============================================================

async function queryPhoton(query, photonUrl, timeout = 6000) {
    const url = `${photonUrl}/api?q=${encodeURIComponent(query)}&limit=5`;
    const res = await axios.get(url, { timeout, proxy: false });
    if (!res.data?.features?.length) return [];
    return res.data.features.map(f => ({
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        display: f.properties?.name || query,
        provider: 'photon',
        confidence: f.properties?.score || 0.5
    }));
}

async function queryKomoot(query, timeout = 8000) {
    const url = `https://photon.komoot.io/api?q=${encodeURIComponent(query)}&limit=5`;
    const res = await axios.get(url, { timeout, proxy: false, headers: { 'User-Agent': 'KillMetraj/2.0' } });
    if (!res.data?.features?.length) return [];
    return res.data.features.map(f => ({
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        display: f.properties?.name || query,
        provider: 'komoot',
        confidence: 0.6
    }));
}

async function queryNominatim(query, timeout = 8000) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1&accept-language=uk`;
    const res = await axios.get(url, { timeout, proxy: false, headers: { 'User-Agent': 'KillMetraj/2.0' } });
    if (!Array.isArray(res.data) || !res.data.length) return [];
    return res.data.map(r => ({
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        display: r.display_name,
        provider: 'nominatim',
        type: r.type,
        importance: r.importance || 0,
        confidence: Math.min(1, (r.importance || 0) * 2)
    }));
}

async function queryNominatimLocal(query, timeout = 3000) {
    const localBase = (process.env.NOMINATIM_URL || 'http://127.0.0.1:8080').trim().replace(/\/+$/, '');
    const url = `${localBase}/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1&accept-language=uk`;
    const res = await axios.get(url, { timeout, proxy: false, headers: { 'User-Agent': 'KillMetraj/2.0' } });
    if (!Array.isArray(res.data) || !res.data.length) return [];
    return res.data.map(r => ({
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        display: r.display_name,
        provider: 'nominatim-local',
        type: r.type,
        importance: r.importance || 0,
        confidence: Math.min(1, (r.importance || 0) * 2)
    }));
}

async function queryNominatimMirror(query, timeout = 8000) {
    const url = `https://nominatim.geocoding.ai/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1&accept-language=uk`;
    const res = await axios.get(url, { timeout, proxy: false, headers: { 'User-Agent': 'KillMetraj/2.0' } });
    if (!Array.isArray(res.data) || !res.data.length) return [];
    return res.data.map(r => ({
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        display: r.display_name,
        provider: 'nominatim-mirror',
        type: r.type,
        importance: r.importance || 0,
        confidence: Math.min(1, (r.importance || 0) * 2)
    }));
}

async function queryMapsCo(query, timeout = 8000) {
    const url = `https://geocode.maps.co/search?q=${encodeURIComponent(query)}`;
    const res = await axios.get(url, { timeout, proxy: false, headers: { 'User-Agent': 'KillMetraj/2.0' } });
    if (!Array.isArray(res.data) || !res.data.length) return [];
    return res.data.slice(0, 5).map(r => ({
        lat: parseFloat(r.lat),
        lng: parseFloat(r.lon),
        display: r.display_name || query,
        provider: 'maps-co',
        type: r.type,
        importance: r.importance || 0,
        confidence: Math.min(1, (r.importance || 0) * 2)
    }));
}

// Safe query wrapper — returns [] on any error
async function safeQuery(fn, ...args) {
    try {
        return await fn(...args) || [];
    } catch {
        return [];
    }
}

function errCode(err) {
    const status = err?.response?.status;
    if (status) return `HTTP_${status}`;
    return err?.code || 'ERR';
}

function mkSafeQueryTracked(onProviderEvent) {
    return async (provider, fn, ...args) => {
        if (isProviderBlocked(provider)) {
            if (typeof onProviderEvent === 'function') {
                const s = geoProviderFailures.get(provider);
                onProviderEvent({
                    provider,
                    ok: false,
                    ms: 0,
                    error: `BLOCKED${s?.lastError ? `(${s.lastError})` : ''}`,
                });
            }
            return [];
        }

        const t0 = Date.now();
        try {
            const res = await scheduleProviderCall(provider, () => fn(...args));
            const arr = res || [];
            // Consider "success" as getting any candidates back.
            if (Array.isArray(arr) && arr.length > 0) {
                markProviderSuccess(provider);
            }
            if (typeof onProviderEvent === 'function') {
                onProviderEvent({
                    provider,
                    ok: Array.isArray(arr) && arr.length > 0,
                    ms: Date.now() - t0,
                });
            }
            return arr;
        } catch (e) {
            markProviderFailure(provider, e);
            if (typeof onProviderEvent === 'function') {
                onProviderEvent({
                    provider,
                    ok: false,
                    ms: Date.now() - t0,
                    error: errCode(e),
                });
            }
            return [];
        }
    };
}

// ============================================================
// CANDIDATE SCORING
// ============================================================

/**
 * Score a geocoding candidate.
 * Higher = better.
 */
function scoreCandidate(candidate, { city, expectedZoneName, kmlZones, anomalyRadiusKm }) {
    let score = candidate.confidence || 0.5;

    // Boost for city match in display name
    if (city && candidate.display && candidate.display.toLowerCase().includes(city.toLowerCase())) {
        score += 1.0;
    }

    // Boost for nominatim by importance
    if (candidate.importance) score += candidate.importance;

    // Boost for house number type results
    if (['house', 'building', 'residential'].includes(candidate.type)) score += 0.5;

    // Penalty: out of city bounds
    const bounds = getCityBounds(city);
    if (bounds) {
        if (!isInBounds(candidate.lat, candidate.lng, bounds)) {
            score -= 10; // Hard penalty — outside city
        }
    }

    // v7.7: STRICT POINT-IN-POLYGON VALIDATION (CRITICAL PRIORITY)
    // If we have specific active KML zones, the point MUST be inside one of them
    if (kmlZones && kmlZones.length > 0) {
        let isInsideAnyActiveZone = false;
        let bestZoneMatch = null;

        for (const zone of kmlZones) {
            // Support both DB model (boundary) and Preset format (path/coordinates)
            const polygon = zone.boundary?.coordinates?.[0] || zone.coordinates;
            if (polygon) {
                if (KmlService._isPointInPolygon(candidate.lat, candidate.lng, polygon)) {
                    isInsideAnyActiveZone = true;
                    bestZoneMatch = zone;
                    break; 
                }
            }
        }

        if (isInsideAnyActiveZone) {
            score += 5.0; // MASSIVE bonus for being inside an active sector
            candidate.kmlZone = bestZoneMatch.name;
        } else {
            // v7.7: If we have active zones but point is outside ALL of them, apply extreme penalty
            // This prevents "wrong street" issues when same name exists in different zones/cities
            score -= 15.0; 
            logger.debug(`[GeoEnhanced] Candidate (${candidate.lat}, ${candidate.lng}) rejected: outside all ${kmlZones.length} active zones`);
        }
    }

    // Penalty: anomalous position vs zone centroid (fallback logic)
    if (expectedZoneName && kmlZones?.length) {
        const zoneMatch = kmlZones.find(z =>
            z.name && z.name.toLowerCase().includes(expectedZoneName.toLowerCase())
        );
        if (zoneMatch?.centroid) {
            const dist = haversine(candidate.lat, candidate.lng, zoneMatch.centroid.lat, zoneMatch.centroid.lng);
            if (dist > anomalyRadiusKm) {
                score -= 5 * (dist / anomalyRadiusKm); // Proportional penalty
            } else {
                score += 0.5; // Small bonus for being close to expected zone
            }
        }
    }

    return { ...candidate, _score: score };
}

function getCityBounds(city) {
    if (!city) return null;
    const cityNorm = city.trim();
    return CITY_BOUNDS[cityNorm] || null;
}

function isInBounds(lat, lng, bounds) {
    const minLat = bounds.minLat - SUBURB_EXTENSION_DEG;
    const maxLat = bounds.maxLat + SUBURB_EXTENSION_DEG;
    const minLng = bounds.minLng - SUBURB_EXTENSION_DEG;
    const maxLng = bounds.maxLng + SUBURB_EXTENSION_DEG;
    return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
}

function haversine(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pickBest(candidates) {
    if (!candidates.length) return null;
    return candidates.reduce((best, c) => (c._score > (best?._score || -Infinity) ? c : best), null);
}

// ============================================================
// ANOMALY DISTANCE CHECK
// ============================================================

/**
 * Given a set of already-geocoded order coords for this courier/division,
 * check if a new candidate is anomalously far from the centroid.
 * Returns { anomaly: bool, distKm: number }
 */
function checkAnomalyDistance(candidateLat, candidateLng, existingCoords, maxAnomalyKm = 30) {
    if (!existingCoords || existingCoords.length < 2) return { anomaly: false };

    // Compute centroid of existing points
    const centLat = existingCoords.reduce((s, c) => s + c.lat, 0) / existingCoords.length;
    const centLng = existingCoords.reduce((s, c) => s + c.lng, 0) / existingCoords.length;

    const dist = haversine(candidateLat, candidateLng, centLat, centLng);
    return { anomaly: dist > maxAnomalyKm, distKm: dist, centLat, centLng };
}

// ============================================================
// MAIN EXPORT: enhancedGeocode
// ============================================================

/**
 * 6-level enhanced geocoding with Ukrainian address specialization, zone validation,
 * and anomaly distance detection.
 *
 * @param {string}   address         - Raw address string from FO
 * @param {string}   city            - City name for bias (e.g. 'Харків')
 * @param {string}   expectedZone    - Expected KML zone name (from FO data)
 * @param {object[]} kmlZones        - All loaded KML zones (with centroid if available)
 * @param {object[]} divisionCoords  - Already-geocoded coords for this division (for anomaly check)
 * @param {object}   options         - { photonUrl, geoCacheDb, gcacheLRU }
 * @returns {{ latitude, longitude, provider, locationType, anomaly } | null}
 */
async function enhancedGeocode(address, city = 'Харків', expectedZone = null, kmlZones = [], divisionCoords = [], options = {}) {
    if (!address || !address.trim()) return null;

    const { photonUrl = 'http://localhost:2322', geoCacheDb = null, gcacheLRU = null, onProviderEvent, hubAnchor = null } = options;
    const safeQueryTracked = mkSafeQueryTracked(onProviderEvent);

    const CITY_BOUNDS_OBJ = getCityBounds(city);

    // v39.1: Hub-anchor max distance — when KML zones absent, reject points too far from hub.
    // 15km straight-line covers all typical urban delivery zones (Obolon, Podil, Osokorky, etc.)
    const HUB_MAX_KM = 15;
    const hasHub = hubAnchor && hubAnchor.lat && hubAnchor.lng;
    const hasKml = kmlZones && kmlZones.length > 0;

    // v39.1: Hub-anchor guard — rejects a coordinate if it is farther than HUB_MAX_KM from hub
    // ONLY applied when no KML zones are configured (if KML exists, zones handle spatial validation)
    const isOutsideHubRadius = (lat, lng) => {
        if (!hasHub || hasKml) return false; // Not applicable
        const d = haversine(lat, lng, hubAnchor.lat, hubAnchor.lng);
        return d > HUB_MAX_KM;
    };

    // -------------------------------
    // L1: LRU memory cache
    // -------------------------------
    const cacheKey = deepCleanAddress(address).toLowerCase();
    if (gcacheLRU) {
        const lruHit = gcacheLRU.get(cacheKey);
        if (lruHit && lruHit.latitude) {
            // v39.1: Even LRU cached results must pass hub-anchor check
            if (isOutsideHubRadius(lruHit.latitude, lruHit.longitude)) {
                logger.warn(`[GeoEnhanced] L1 LRU EVICTED: ${address} — cached coord (${lruHit.latitude.toFixed(4)},${lruHit.longitude.toFixed(4)}) is >${HUB_MAX_KM}km from hub`);
                gcacheLRU.delete(cacheKey);
                // Fall through to re-geocode
            } else {
                logger.debug(`[GeoEnhanced] L1 LRU hit: ${address}`);
                return lruHit;
            }
        }
    }

    // -------------------------------
    // L2: DB GeoCache
    // -------------------------------
    if (geoCacheDb) {
        try {
            const cached = await geoCacheDb.findOne({ where: { address_key: cacheKey, is_success: true } });
            if (cached && cached.lat && cached.lng) {
                // v39.1: Validate DB-cached coord against hub anchor — evict stale bad geocodes
                if (isOutsideHubRadius(cached.lat, cached.lng)) {
                    logger.warn(`[GeoEnhanced] L2 DB cache EVICTED: ${address} — cached coord (${cached.lat.toFixed(4)},${cached.lng.toFixed(4)}) is >${HUB_MAX_KM}km from hub. Will re-geocode.`);
                    try { await geoCacheDb.destroy({ where: { address_key: cacheKey } }); } catch (_) {}
                    if (gcacheLRU) gcacheLRU.delete(cacheKey);
                    // Fall through to fresh geocoding
                } else {
                    const result = { latitude: cached.lat, longitude: cached.lng, locationType: 'CACHED_DB', provider: cached.provider || 'cache' };
                    if (gcacheLRU) gcacheLRU.set(cacheKey, result);
                    logger.debug(`[GeoEnhanced] L2 DB cache hit: ${address}`);
                    return result;
                }
            }
        } catch (e) { /* ignore */ }
    }

    // Helper: validate + score a batch of candidates
    const scoreBatch = (candidates) => candidates
        .filter(c => c && !isNaN(c.lat) && !isNaN(c.lng))
        .map(c => scoreCandidate(c, {
            city,
            expectedZoneName: expectedZone,
            kmlZones,
            anomalyRadiusKm: 25 // 25km from zone centroid is anomalous
        }))
        .filter(c => c._score > -5); // Hard rejection threshold

    const tryAccept = (candidates, label) => {
        if (!candidates.length) return null;
        const best = pickBest(candidates);
        if (!best) return null;

        // City bounds check
        if (CITY_BOUNDS_OBJ && !isInBounds(best.lat, best.lng, CITY_BOUNDS_OBJ)) {
            logger.warn(`[GeoEnhanced] ${label}: Best candidate (${best.lat.toFixed(4)},${best.lng.toFixed(4)}) is OUTSIDE ${city} bounds — rejected`);
            return null;
        }

        // v39.1: Hub-anchor check — reject if too far from hub (only when no KML zones configured)
        if (isOutsideHubRadius(best.lat, best.lng)) {
            const dHub = haversine(best.lat, best.lng, hubAnchor.lat, hubAnchor.lng);
            logger.warn(`[GeoEnhanced] ${label}: Candidate (${best.lat.toFixed(4)},${best.lng.toFixed(4)}) is ${dHub.toFixed(1)}km from hub — exceeds ${HUB_MAX_KM}km limit. REJECTED. (addr: ${address})`);
            return null;
        }

        // v39.1: Anomaly check threshold reduced 30km→8km for tighter validation
        if (divisionCoords.length >= 3) {
            const { anomaly, distKm } = checkAnomalyDistance(best.lat, best.lng, divisionCoords, 8);
            if (anomaly) {
                logger.warn(`[GeoEnhanced] ${label}: Anomalous distance ${distKm?.toFixed(1)}km from division centroid (threshold: 8km) — rejected (addr: ${address})`);
                return null;
            }
        }

        // v39.1: Multi-provider consensus check when NO KML zones.
        // If only 1 provider returned a result and it's the best, require it agrees with others within 5km.
        // This prevents accepting a single outlier geocoder result as ground truth.
        if (!hasKml && candidates.length > 1) {
            const otherCandidates = candidates.filter(c => c !== best && c._score > -3);
            if (otherCandidates.length >= 2) {
                // Compute consensus centroid of other providers
                const consensusLat = otherCandidates.reduce((s, c) => s + c.lat, 0) / otherCandidates.length;
                const consensusLng = otherCandidates.reduce((s, c) => s + c.lng, 0) / otherCandidates.length;
                const distFromConsensus = haversine(best.lat, best.lng, consensusLat, consensusLng);
                if (distFromConsensus > 5) {
                    logger.warn(`[GeoEnhanced] ${label}: Best candidate disagrees with ${otherCandidates.length} other providers by ${distFromConsensus.toFixed(1)}km — flagged as unreliable (addr: ${address})`);
                    // Try the consensus centroid candidate instead
                    const consensusCandidate = pickBest(otherCandidates);
                    if (consensusCandidate) {
                        logger.info(`[GeoEnhanced] ${label}: Using consensus candidate instead: (${consensusCandidate.lat.toFixed(5)},${consensusCandidate.lng.toFixed(5)}) via ${consensusCandidate.provider}`);
                        return { latitude: consensusCandidate.lat, longitude: consensusCandidate.lng, locationType: consensusCandidate.type || 'CONSENSUS', provider: consensusCandidate.provider, _score: consensusCandidate._score };
                    }
                }
            }
        }

        logger.info(`[GeoEnhanced] ✅ ${label}: Accepted (${best.lat.toFixed(5)},${best.lng.toFixed(5)}) score=${best._score.toFixed(2)} via ${best.provider}`);
        return { latitude: best.lat, longitude: best.lng, locationType: best.type || best.provider?.toUpperCase() || 'GEOCODED', provider: best.provider, _score: best._score };
    };

    const saveToCache = async (result, provider) => {
        if (!result) return;
        if (gcacheLRU) gcacheLRU.set(cacheKey, result);
        if (geoCacheDb) {
            try {
                await geoCacheDb.upsert({
                    address_key: cacheKey,
                    lat: result.latitude,
                    lng: result.longitude,
                    is_success: true,
                    provider: provider || result.provider || 'enhanced'
                });
            } catch (e) { /* ignore */ }
        }
    };

    // ----------------------------------------
    // L3: Turbo parallel — primary clean query
    // ----------------------------------------
    const cleanQuery = deepCleanAddress(address);
    const normalizedQuery = normalizeUkrainianAddress(cleanQuery);
    // Use normalized query for L3 (expands abbreviations, normalizes city name)
    const cityQuery = city ? `${normalizedQuery}, ${city}` : normalizedQuery;

    {
        const includeNl = selfHostRoutingHealth.shouldQueryNominatimLocal();
        const [nl, p, k, n, nm, mc] = await Promise.all([
            includeNl ? safeQueryTracked('nominatim-local', queryNominatimLocal, cityQuery, 3000) : Promise.resolve([]),
            safeQueryTracked('photon', queryPhoton, cityQuery, photonUrl, 3500),
            safeQueryTracked('komoot', queryKomoot, cityQuery, 4500),
            safeQueryTracked('nominatim', queryNominatim, cityQuery, 4500),
            safeQueryTracked('nominatim-mirror', queryNominatimMirror, cityQuery, 4500),
            safeQueryTracked('maps-co', queryMapsCo, cityQuery, 4500),
        ]);
        const all = scoreBatch([...nl, ...p, ...k, ...n, ...nm, ...mc]);
        const result = tryAccept(all, 'L3-Turbo');
        if (result) { await saveToCache(result, result.provider); return result; }
    }

    // L3.5: Also try with cleaned (non-normalized) query if different
    if (cleanQuery !== normalizedQuery) {
        const rawCityQuery = city ? `${cleanQuery}, ${city}` : cleanQuery;
        const includeNl35 = selfHostRoutingHealth.shouldQueryNominatimLocal();
        const [nl, p, k, n, nm, mc] = await Promise.all([
            includeNl35 ? safeQueryTracked('nominatim-local', queryNominatimLocal, rawCityQuery, 3000) : Promise.resolve([]),
            safeQueryTracked('photon', queryPhoton, rawCityQuery, photonUrl, 3500),
            safeQueryTracked('komoot', queryKomoot, rawCityQuery, 4500),
            safeQueryTracked('nominatim', queryNominatim, rawCityQuery, 4500),
            safeQueryTracked('nominatim-mirror', queryNominatimMirror, rawCityQuery, 4500),
            safeQueryTracked('maps-co', queryMapsCo, rawCityQuery, 4500),
        ]);
        const all = scoreBatch([...nl, ...p, ...k, ...n, ...nm, ...mc]);
        const result = tryAccept(all, 'L3.5-Raw');
        if (result) { await saveToCache(result, result.provider); return result; }
    }

    // ----------------------------------------
    // L4: Variant expansion — UA-specific
    // ----------------------------------------
    const variants = generateUAVariants(address, city);

    // Try each variant independently (prioritized order)
    for (let i = 0; i < Math.min(variants.length, 10); i++) {
        const v = variants[i];
        if (v.toLowerCase() === cityQuery.toLowerCase()) continue; // Already tried

        const includeNlV = selfHostRoutingHealth.shouldQueryNominatimLocal();
        const [nl, p, n, nm, mc] = await Promise.all([
            includeNlV ? safeQueryTracked('nominatim-local', queryNominatimLocal, v, 3000) : Promise.resolve([]),
            safeQueryTracked('photon', queryPhoton, v, photonUrl, 3500),
            safeQueryTracked('nominatim', queryNominatim, v, 4500),
            safeQueryTracked('nominatim-mirror', queryNominatimMirror, v, 4500),
            safeQueryTracked('maps-co', queryMapsCo, v, 4500),
        ]);
        const all = scoreBatch([...nl, ...p, ...n, ...nm, ...mc]);
        const result = tryAccept(all, `L4-Variant[${i}]`);
        if (result) { await saveToCache(result, result.provider); return result; }
    }

    // ----------------------------------------
    // L5: Deep fallback — progressive stripping
    // ----------------------------------------
    const deepStrategies = buildDeepStrategies(cleanQuery, city);
    for (const { query, label } of deepStrategies) {
        const includeNlD = selfHostRoutingHealth.shouldQueryNominatimLocal();
        const [nl, p, k, n, nm, mc] = await Promise.all([
            includeNlD ? safeQueryTracked('nominatim-local', queryNominatimLocal, query, 3000) : Promise.resolve([]),
            safeQueryTracked('photon', queryPhoton, query, photonUrl, 3500),
            safeQueryTracked('komoot', queryKomoot, query, 4500),
            safeQueryTracked('nominatim', queryNominatim, query, 4500),
            safeQueryTracked('nominatim-mirror', queryNominatimMirror, query, 4500),
            safeQueryTracked('maps-co', queryMapsCo, query, 4500),
        ]);
        const all = scoreBatch([...nl, ...p, ...k, ...n, ...nm, ...mc]);
        const result = tryAccept(all, `L5-Deep[${label}]`);
        if (result) {
            logger.info(`[GeoEnhanced] L5 deep fallback success (${label}) for: ${address}`);
            await saveToCache(result, result.provider);
            return result;
        }
    }

    // ----------------------------------------
    // L6: Emergency — accept any result inside city, ignore zone
    // Try with full cleaned address first, then progressively simpler
    // ----------------------------------------
    logger.warn(`[GeoEnhanced] L6 Emergency: loosening zone constraint for: ${address}`);

    const emergencyQueries = [];
    // 6a. Full normalized query
    const fullNormalized = normalizeUkrainianAddress(cleanQuery);
    if (fullNormalized !== cleanQuery) {
        emergencyQueries.push(`${city}, ${fullNormalized}`);
    }
    // 6b. Street + house only
    const shQuery = extractStreetAndHouse(fullNormalized);
    if (shQuery) {
        emergencyQueries.push(`${city}, ${shQuery}`);
    }
    // 6c. Original first-comma token (might have house number)
    const firstPart = cleanQuery.split(',')[0].trim();
    if (firstPart && firstPart.length > 3) {
        emergencyQueries.push(`${city}, ${firstPart}`);
    }
    // 6d. Apply renames and try
    const renamed6 = applyCityRenames(fullNormalized, city);
    for (const rv of renamed6) {
        if (rv !== fullNormalized) {
            emergencyQueries.push(`${city}, ${rv}`);
        }
    }

    let emergencyBest = null;
    const includeNlE = selfHostRoutingHealth.shouldQueryNominatimLocal();

    for (const eq of emergencyQueries) {
        const [enl, ep, ek, en, enm, emc] = await Promise.all([
            includeNlE ? safeQueryTracked('nominatim-local', queryNominatimLocal, eq, 3000) : Promise.resolve([]),
            safeQueryTracked('photon', queryPhoton, eq, photonUrl, 3500),
            safeQueryTracked('komoot', queryKomoot, eq, 4500),
            safeQueryTracked('nominatim', queryNominatim, eq, 4500),
            safeQueryTracked('nominatim-mirror', queryNominatimMirror, eq, 4500),
            safeQueryTracked('maps-co', queryMapsCo, eq, 4500),
        ]);

        const emergencyCandidates = [...enl, ...ep, ...ek, ...en, ...enm, ...emc]
            .filter(c => c && !isNaN(c.lat) && !isNaN(c.lng))
            .map(c => scoreCandidate(c, { city, kmlZones: [], anomalyRadiusKm: 9999 }))
            .filter(c => {
                if (!CITY_BOUNDS_OBJ) return true;
                return isInBounds(c.lat, c.lng, CITY_BOUNDS_OBJ);
            });

        const candidate = pickBest(emergencyCandidates);
        if (candidate && (!emergencyBest || candidate._score > emergencyBest._score)) {
            emergencyBest = candidate;
        }

        if (emergencyBest) break;
    }
    if (emergencyBest) {
        logger.info(`[GeoEnhanced] L6 Emergency accepted (${emergencyBest.lat.toFixed(5)},${emergencyBest.lng.toFixed(5)}) for: ${address}`);
        const result = { latitude: emergencyBest.lat, longitude: emergencyBest.lng, locationType: 'EMERGENCY', provider: emergencyBest.provider, _score: emergencyBest._score };
        await saveToCache(result, result.provider);
        return result;
    }

    // ============================================================
    // L7: TOTAL FAILURE — return null to mark as geo error
    // ============================================================
    // Instead of using a centroid fallback (which creates "бредовые km"),
    // return null so the caller can exclude this order from routing.
    // This is better than creating a route with 31km for 1 order at wrong coords.
    logger.warn(`[GeoEnhanced] ❌ ALL LEVELS FAILED for: ${address}. Marking as geo error (no fallback coords).`);
    return null;
}

// ============================================================
// DEEP FALLBACK STRATEGY BUILDER
// ============================================================

function buildDeepStrategies(cleaned, city) {
    const strategies = [];
    const cp = city ? `${city}, ` : '';
    const normalized = normalizeUkrainianAddress(cleaned);

    // 1. Normalized version (if different from cleaned)
    if (normalized !== cleaned && normalized.length > 4) {
        strategies.push({ query: `${cp}${normalized}`, label: 'normalized' });
    }

    // 2. Remove house number
    const noHouse = normalized.replace(/[,\s]+\d+[а-яіє/a-z-]*\s*$/i, '').trim();
    if (noHouse && noHouse !== normalized && noHouse.length > 5) {
        strategies.push({ query: `${cp}${noHouse}`, label: 'no-house' });
    }

    // 3. First token before comma
    const beforeComma = normalized.split(',')[0].trim();
    if (beforeComma && beforeComma !== normalized && beforeComma.length > 4) {
        strategies.push({ query: `${cp}${beforeComma}`, label: 'before-comma' });
    }

    // 4. Remove street type prefix completely
    const noPrefix = normalized
        .replace(/\b(вул\.?|вулиця|ул\.?|улица|пров\.?|просп\.?|пр-т\.?|пр\.?|бул\.?|бульвар|пл\.?|наб\.?|набережна)\s*/gi, '')
        .trim();
    if (noPrefix && noPrefix !== normalized) {
        strategies.push({ query: `${cp}${noPrefix}`, label: 'no-prefix' });
    }

    // 5. Extract just street name + house number (most aggressive clean)
    const streetHouse = extractStreetAndHouse(normalized);
    if (streetHouse && streetHouse.length > 3) {
        strategies.push({ query: `${cp}${streetHouse}`, label: 'street+house' });
    }

    // 6. Apply city renames for each strategy
    const renamedVariants = applyCityRenames(normalized, city);
    for (const rv of renamedVariants) {
        if (rv !== normalized && rv.length > 4) {
            strategies.push({ query: `${cp}${rv}`, label: 'renamed' });
            // Also without house number
            const rvNoHouse = rv.replace(/[,\s]+\d+[а-яіє/a-z-]*\s*$/i, '').trim();
            if (rvNoHouse && rvNoHouse !== rv && rvNoHouse.length > 4) {
                strategies.push({ query: `${cp}${rvNoHouse}`, label: 'renamed-no-house' });
            }
        }
    }

    // 7. Reverse: city only with minimal address clue
    const firstWord = normalized.split(/[\s,]/)[0];
    if (firstWord && firstWord.length > 3 && /[а-яієґ]/i.test(firstWord)) {
        strategies.push({ query: `${cp}${firstWord}`, label: 'first-word-only' });
    }

    // 8. City + district (if address has district info)
    const districtMatch = normalized.match(/([А-ЯІЄҐ][а-яієґ]+(?:\s+[А-ЯІЄҐ][а-яієґ]+)?)\s*(?:район|р-н)/i);
    if (districtMatch) {
        strategies.push({ query: `${districtMatch[1]} район, ${city}`, label: 'district' });
    }

    // 9. Parenthetical old street name (from raw)
    const parenMatch = cleaned.match(/\(([^)]+)\)/);
    if (parenMatch) {
        const inner = parenMatch[1].trim();
        if (inner.length > 3 && !/^\d+$/.test(inner) && !/кв|эт|под|моб|д\/ф/i.test(inner)) {
            const houseMatch = normalized.match(/(\d+[а-яіє]*)\s*$/i);
            const house = houseMatch ? ` ${houseMatch[1]}` : '';
            strategies.push({ query: `${cp}${inner}${house}`, label: 'paren-alt-name' });
            // With street type prefix
            strategies.push({ query: `${cp}вулиця ${inner}${house}`, label: 'paren-alt-vucl' });
        }
    }

    // Deduplicate strategies by query
    const seen = new Set();
    return strategies.filter(s => {
        if (s.query.length <= 6 || seen.has(s.query)) return false;
        seen.add(s.query);
        return true;
    });
}

// ============================================================
// BATCH ENHANCED GEOCODING
// ============================================================

/**
 * Batch geocode a list of orders with smart retries for failures.
 * First pass: all orders in parallel chunks.
 * Second pass: failed orders retried with enhanced fallbacks.
 *
 * @param {object[]} orders           - Orders that need geocoding
 * @param {string}   city             - City bias
 * @param {object[]} kmlZones         - KML zones for zone validation
 * @param {object}   options          - { photonUrl, geoCacheDb, gcacheLRU, onProgress }
 */
async function batchEnhancedGeocode(orders, city, kmlZones = [], options = {}) {
    const { onProgress, hubAnchor = null, ...geoOptions } = options;
    // v39.1: Pass hubAnchor to per-order geocoding
    const geoOptionsWithHub = { ...geoOptions, hubAnchor };
    const CHUNK_SIZE = 15;

    if (hubAnchor?.lat && hubAnchor?.lng && (!kmlZones || kmlZones.length === 0)) {
        logger.info(`[GeoEnhanced] 🏠 Hub-anchor guard ACTIVE: All geocoded points must be within 15km of hub (${hubAnchor.lat.toFixed(4)},${hubAnchor.lng.toFixed(4)})`);
    }

    // Track all division coords for anomaly detection (starts empty, fills dynamically)
    const divisionCoords = orders
        .filter(o => o.coords?.lat && o.coords?.lng)
        .map(o => ({ lat: o.coords.lat, lng: o.coords.lng }));

    const results = new Map(); // address → result
    let processed = 0;
    const totalToGeo = orders.length;

    // PASS 1: Parallel chunks — fast first attempt
    logger.info(`[GeoEnhanced] PASS 1: Geocoding ${totalToGeo} orders in chunks of ${CHUNK_SIZE}...`);
    for (let i = 0; i < totalToGeo; i += CHUNK_SIZE) {
        const chunk = orders.slice(i, i + CHUNK_SIZE);
        await Promise.all(chunk.map(async (order) => {
            const addr = order.address || order.addressGeo || '';
            if (!addr) return;

            const expectedZone = String(order.deliveryZone || order.kmlZone || order.sector || '').trim();

            try {
                const result = await enhancedGeocode(addr, city, expectedZone || null, kmlZones, divisionCoords, geoOptionsWithHub);
                if (result) {
                    order.coords = { lat: result.latitude, lng: result.longitude };
                    order._geoProvider = result.provider;
                    divisionCoords.push({ lat: result.latitude, lng: result.longitude }); // Feed back for anomaly detection
                    results.set(addr, result);
                } else {
                    order._geoFailed = true;
                }
            } catch (e) {
                order._geoFailed = true;
            }
        }));

        processed += chunk.length;
        if (onProgress) onProgress(processed, totalToGeo, 'pass1');
    }

    // Collect failures
    const failed = orders.filter(o => !o.coords?.lat && (o.address || o.addressGeo));
    logger.info(`[GeoEnhanced] PASS 1 done. Success: ${totalToGeo - failed.length}/${totalToGeo}. Failed: ${failed.length}`);

    if (failed.length === 0) return results;

    // PASS 2: Enhanced retry for each failure individually (sequentially to avoid rate limits)
    logger.info(`[GeoEnhanced] PASS 2: Enhanced retry for ${failed.length} failures...`);
    for (let i = 0; i < failed.length; i++) {
        const order = failed[i];
        const addr = order.address || order.addressGeo || '';
        const expectedZone = String(order.deliveryZone || order.kmlZone || '').trim();

        try {
            // Pass 2: strict polite mode for free providers
            await new Promise(r => setTimeout(r, 1000));
            const result = await enhancedGeocode(addr, city, expectedZone || null, kmlZones, divisionCoords, {
                ...geoOptionsWithHub,
                _pass: 2
            });

            if (result) {
                order.coords = { lat: result.latitude, lng: result.longitude };
                order._geoProvider = result.provider;
                order._geoFailed = false;
                divisionCoords.push({ lat: result.latitude, lng: result.longitude });
                results.set(addr, result);
                logger.info(`[GeoEnhanced] PASS 2 recovered: ${addr} → (${result.latitude.toFixed(5)},${result.longitude.toFixed(5)})`);
            } else {
                logger.warn(`[GeoEnhanced] PASS 2 failed: ${addr}`);
            }
        } catch (e) { /* ignore */ }

        if (onProgress) onProgress(processed + i + 1, totalToGeo + failed.length, 'pass2');
    }

    const finalFailed = orders.filter(o => !o.coords?.lat && (o.address || o.addressGeo));
    logger.info(`[GeoEnhanced] PASS 2 done. Still failed: ${finalFailed.length}/${failed.length}`);
    return results;
}

module.exports = {
    enhancedGeocode,
    batchEnhancedGeocode,
    deepCleanAddress,
    generateUAVariants,
    normalizeUkrainianAddress,
    applyCityRenames,
    extractStreetAndHouse,
    checkAnomalyDistance,
    haversine,
    isInBounds,
    getCityBounds,
    ALL_CITY_RENAMES,
    resetAllGeoProviders,
};
