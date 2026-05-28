'use strict';

/**
 * turboGeoEnhanced.js — v1.0 SOTA BACKEND GEOCODING ENGINE
 *
 * 6-уровневая каскадная стратегия геокодирования:
 *
 *  L1  DB Cache + LRU cache (мгновенно, бесплатно)
 *  L2  addressGeo из FO данных (ноль API вызовов, GPS-точный)
 *  L3  Turbo параллельно: photon + komoot + nominatim (самые быстрые, широкие)
 *  L4  Расширение вариантов: UA-специфичные мутации адресов (переименования, опечатки, ЖК, м-н)
 *  L5  Глубокое падение: только улица, район, прогрессивное удаление терминов
 *  L6  Экстренное принудительное: игнорировать KML зону, принять любой валидный результат в границах города
 *
 * Улучшения валидации зон:
 *  - Обнаружение аномального расстояния: перекрестная проверка геокодированной точки с центроидом KML зоны
 *  - Двойная защита границ города: отклоняет результаты явно за пределами Украины
 *  - Цепочка падения зоны: если точная зона не проходит → соседняя зона (≤ 2км) → любая зона в отделе
 *
 * Специализация украинских адресов:
 *  - Обрабатывает хрущовки (названия зданий без номера улицы)
 *  - Обрабатывает кириллические/транслитерированные типы улиц (вул / вулиця / ul / ulytsia)
 *  - Обрабатывает паттерны дача / котедж / приватний сектор
 *  - Обрабатывает переименованные улицы (оба названия параллельно)
 *  - Обрабатывает шум квартиры/входа/домофона: "под.1 д/ф моб эт.5 кв.28" → чистое удаление
 *  - Обрабатывает маркеры секций: №55, корп.2, буд.3-А
 */

const axios = require('axios');
const logger = require('../src/utils/logger');
const selfHostRoutingHealth = require('../src/services/selfHostRoutingHealth');
const KmlService = require('../src/services/KmlService');
const { cleanAddress, generateVariants } = require('../src/utils/addressUtils');

// ============================================================
// ПРЕДОХРАНИТЕЛЬ ПРОВАЙДЕРОВ (бесплатные публичные API имеют лимиты запросов)
// ============================================================
const GEO_FAIL_THRESHOLD = 3;
const GEO_BLOCK_MS = 30 * 1000;       // 30s короткая блокировка при жёстких сетевых ошибках
const GEO_BLOCK_MS_429 = 60 * 1000;   // v7.9: 1 минута при лимите запросов (было 5мин — слишком долго)
const geoProviderFailures = new Map();     // provider -> { сбои, время блокировки, последняя ошибка }
const providerNextAllowedAt = new Map();   // provider -> следующая эпоха в мс
const providerQueue = new Map();           // provider -> цепочка промисов

// v7.2: Адаптивные интервалы (мс) на провайдер
const PROVIDER_INTERVALS = {
    'nominatim': 500,
    'arcgis': 50,        // Очень строгий публичный API
    'nominatim-mirror': 500,
    'default': 50
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

// v7.9: Аварийная разблокировка — очищает все предохранители для немедленного повторного геокодирования
function resetAllGeoProviders() {
    geoProviderFailures.clear();
    providerNextAllowedAt.clear();
    logger.info('[GeoEnhanced]  All geo provider circuit breakers reset');
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
            // v7.2: Используем адаптивный интервал + jitter (±15%)
            const baseInterval = PROVIDER_INTERVALS[provider] || PROVIDER_INTERVALS.default;
            const jitter = baseInterval * 0.15 * (Math.random() * 2 - 1);
            providerNextAllowedAt.set(provider, startedAt + baseInterval + jitter);
            
            return fn();
        });
    providerQueue.set(provider, next);
    return next;
}


// ============================================================
// ГРАНИЦЫ ГОРОДОВ — защита от выбросов геокодирования
// ============================================================
const CITY_BOUNDS = {
    'Харків': { minLat: 49.88, maxLat: 50.08, minLng: 36.07, maxLng: 36.47 },
    'Харьков': { minLat: 49.88, maxLat: 50.08, minLng: 36.07, maxLng: 36.47 },
    'Kharkiv': { minLat: 49.88, maxLat: 50.08, minLng: 36.07, maxLng: 36.47 },
    'Київ': { minLat: 50.05, maxLat: 50.75, minLng: 30.05, maxLng: 31.25 }, // v1.1: Expanded for suburbs (Brovary, Boryspil, Irpin, etc.)
    'Киев': { minLat: 50.05, maxLat: 50.75, minLng: 30.05, maxLng: 31.25 },
    'Kyiv': { minLat: 50.05, maxLat: 50.75, minLng: 30.05, maxLng: 31.25 },
    'Дніпро': { minLat: 48.30, maxLat: 48.65, minLng: 34.80, maxLng: 35.35 }, // Slightly expanded
    'Днепр': { minLat: 48.30, maxLat: 48.65, minLng: 34.80, maxLng: 35.35 },
    'Dnipro': { minLat: 48.30, maxLat: 48.65, minLng: 34.80, maxLng: 35.35 },
    'Одеса': { minLat: 46.25, maxLat: 46.75, minLng: 30.50, maxLng: 30.95 }, // Slightly expanded
    'Одесса': { minLat: 46.25, maxLat: 46.75, minLng: 30.50, maxLng: 30.95 },
    'Odesa': { minLat: 46.25, maxLat: 46.75, minLng: 30.50, maxLng: 30.95 },
    'Львів': { minLat: 49.75, maxLat: 49.95, minLng: 23.85, maxLng: 24.20 }, // Slightly expanded
    'Львов': { minLat: 49.75, maxLat: 49.95, minLng: 23.85, maxLng: 24.20 },
    'Lviv': { minLat: 49.75, maxLat: 49.95, minLng: 23.85, maxLng: 24.20 },
    'Полтава': { minLat: 49.50, maxLat: 49.70, minLng: 34.40, maxLng: 34.75 }, // Slightly expanded
    'Poltava': { minLat: 49.50, maxLat: 49.70, minLng: 34.40, maxLng: 34.75 },
};

// Расширение на пригороды: если у города есть пригороды, расширяем bounding box на это число км
const SUBURB_EXTENSION_DEG = 0.15; // ~17км на широте 50°

// ============================================================
// СЛОВАРИ ПЕРЕИМЕНОВАНИЙ УЛИЦ — сопоставление старых→новых названий для геокодирования
// Охватывает: Киев, Харьков, Одесса, Полтава (+ дополнительно Дніпро, Львів)
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
// УДАЛЕНИЕ ШУМА ИЗ УКРАИНСКИХ АДРЕСОВ
// ============================================================

/**
 * Глубокая очистка украинских/русских адресов доставки.
 * Удаляет информацию о квартире, подъезде, этаже, кодах домофона, примечаниях.
 * v2: Исправлены ошибки regex, улучшена обработка скобок, добавлено удаление префикса "г.".
 */
function deepCleanAddress(raw) {
    if (!raw) return '';
    let s = raw;

    // Удаляем название страны "Украина", "Україна"
    s = s.replace(/Україн[аи]/gi, '');
    s = s.replace(/Украин[аы]/gi, '');

    // Удаляем префикс города "г." / "г ": "г. КИЇВ" → "КИЇВ"
    // ПРИМЕЧАНИЕ: \b НЕ работает с кириллицей в JS regex, используем (^|[\s,]) вместо
    s = s.replace(/(^|[\s,])г\.\s*/gi, '$1');
    s = s.replace(/(^|[\s,])м\.\s*/gi, '$1');

    // Удаляем GPS координаты, если случайно остались в строке адреса
    s = s.replace(/Lat\s*=\s*"?[\d.]+"\s*/gi, '');
    s = s.replace(/Long\s*=\s*"?[\d.]+"\s*/gi, '');
    s = s.replace(/AddressStr\s*=\s*"?[^"]+"\s*/gi, '');

    // Удаляем номера телефонов В ПЕРВУЮ ОЧЕРЕДЬ (до остального удаления шума): (093) 123-45-67 | +380...
    s = s.replace(/(\+?380|\(?0\d{2}\)?)\s?[\d\s\-]{7,}/g, '');

    // Удаляем коды домофона + всё после до запятой/точки с запятой/конца
    // д/ф моб, д/ф 123, код 456, домофон, дф
    s = s.replace(/[, ]?\s*(д\/ф|д\.ф\.|домофон|дф|код\s*\d+)[^,;]*/gi, '');

    // Удаляем маркеры мобильного/домофона + всё после до запятой/точки с запятой/конца
    s = s.replace(/[, ]?\s*моб(?:ільний|ильный)?\.?\s*\d*[^,;]*/gi, '');

    // Удаляем шум квартиры/помещения: кв. 28, квартира 5, оф. 3
    s = s.replace(/(^|[\s,])(кв|квартира|апарт|оф|офис|офіс)\s*\.?\s*\d+[а-яіє]*\b/gi, '$1');

    // Удаляем подъезд: под.1 | п-д 2 | под 3
    s = s.replace(/(^|[\s,])(под\.?|підʼїзд|подъезд|п-д)\s*\.?\s*\d+\b/gi, '$1');

    // Удаляем этаж: эт.5 | этаж 3 | поверх 2
    s = s.replace(/(^|[\s,])(эт\.?|этаж|поверх|пов\.?)\s*\.?\s*\d+\b/gi, '$1');

    // Удаляем префикс "д." но СОХРАНЯЕМ номер: "д.16е" → "16е"
    s = s.replace(/(^|[\s,])д\.\s*(?=\d)/gi, '$1');

    // Удаляем префикс "буд." но СОХРАНЯЕМ номер: "буд.3-А" → "3-А"
    s = s.replace(/(^|[\s,])буд\.?\s*(?=\d)/gi, '$1');

    // Удаляем суффикс "корп.": "корп.2" → удалено (шум секции здания)
    s = s.replace(/,?\s*корп\.?\s*\d+[а-яіє]?\s*/gi, '');

    // Удаляем оставшиеся маркеры "№": "№55" 
    s = s.replace(/,?\s*№\s*\d+\s*/gi, '');

    // Удаляем содержимое скобок, которое является техническим шумом (кв/эт/под/моб)
    // Сохраняем скобки, похожие на названия улиц (кириллические слова, не только цифры)
    s = s.replace(/\((?:под\.?\s*\d+|кв\.?\s*\d+|эт\.?\s*\d+|пов\.?\s*\d+|д\/ф[^)]*|моб[^)]*|оф\.?\s*\d+|літ\.?\s*\w+|лит\.?\s*\w+|корп\.?\s*\d+|буд\.?\s*\d+)\)/gi, '');

    // Удаляем "под." без номера в конце строки
    s = s.replace(/,?\s*под\.?\s*$/gi, '');

    // Удаляем хвостовой/начальный шум: запятые, пробелы
    s = s.replace(/,\s*$/g, '');
    s = s.replace(/^[, ]+/, '');
    s = s.replace(/,\s*,/g, ','); // двойные запятые
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

    // v47: Semantic NLP Parser - Хирургическая очистка мусора до геокодера
    // 1. Удаляем все внутри скобок (там обычно комментарии типа "(оставить у двери)", "(вход со двора)")
    s = s.replace(/\s*\([^)]*\)/g, '');
    
    // 2. Удаляем номера квартир (кв. 5, кв 44, квартира 12)
    s = s.replace(/\b(?:кв|квартира)\.?\s*\d+[а-яА-Яa-zA-Z]?\b/gi, '');
    
    // 3. Удаляем подъезды (под. 1, подъезд 3, п. 2)
    s = s.replace(/\b(?:под|подъезд|п|парадное|під|під\'їзд)\.?\s*\d+\b/gi, '');
    
    // 4. Удаляем этажи (эт. 5, этаж 2, поверх 3)
    s = s.replace(/\b(?:эт|этаж|поверх|пов)\.?\s*\d+\b/gi, '');
    
    // 5. Удаляем домофоны (код 123, домофон 45)
    s = s.replace(/\b(?:код|домофон)\.?\s*\d+\b/gi, '');
    
    // 6. Удаляем корпуса, оставляя их ближе к номеру дома (опционально, но часто корпуса путают геокодер)
    // s = s.replace(/\b(?:корп|корпус|к)\.?\s*\d+[а-яА-Яa-zA-Z]?\b/gi, ''); // Решено оставить, так как корпус важен для дома

    // Нормализуем сокращения типов улиц
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

    // Нормализуем "г. КИЇВ" → "Київ" (регистр названия города)
    s = s.replace(/\bКиїв\b/gi, 'Київ');
    s = s.replace(/\bКИЇВ\b/g, 'Київ');
    s = s.replace(/\bКиев\b/g, 'Київ');
    s = s.replace(/\bХарків\b/gi, 'Харків');
    s = s.replace(/\bХарьков\b/g, 'Харків');

    // Очищаем запятые, оставшиеся после удаления мусора (например "ул. Ленина, 15, ,")
    s = s.replace(/,\s*,/g, ',');
    s = s.replace(/,\s*$/g, '');

    // Очищаем двойные пробелы
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

    // Удаляем название города
    s = s.replace(/\bКиїв\b/gi, '').replace(/\bХарків\b/gi, '');
    // Удаляем префикс типа улицы
    s = s.replace(/\b(вулиця|вул|улиця|ул|проспект|просп|пр-т|бульвар|бул|провулок|пров|площа|пл|набережна|наб)\.?\s*/gi, '');
    // Очищаем
    s = s.replace(/^[, ]+/, '').replace(/[, ]+$/, '').replace(/\s+/g, ' ').trim();

    // Пробуем извлечь "Название, Номер" или "Название Номер"
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

    // 1. Добавляем нормализованную версию (расширенные сокращения)
    if (normalized !== cleaned) {
        variants.add(normalized);
        if (city) variants.add(`${city}, ${normalized}`);
    }

    // 2. Добавляем версию с префиксом города для каждого существующего варианта
    for (const v of [...variants]) {
        if (city && !v.toLowerCase().includes(city.toLowerCase())) {
            variants.add(`${city}, ${v}`);
        }
    }

    // 3. Нормализация типа улицы: все возможные комбинации
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

    // 4. Применяем варианты переименования городов (старые↔новые названия улиц)
    const renamedVariants = applyCityRenames(normalized, city);
    for (const rv of renamedVariants) {
        if (rv !== normalized && rv.length > 4) {
            variants.add(rv);
            if (city) variants.add(`${city}, ${rv}`);
        }
    }

    // 5. Удаляем номер дома → запасной вариант только с улицей
    const noHouse = normalized.replace(/[,\s]+\d+[а-яіє/a-z-]*\s*$/i, '').trim();
    if (noHouse && noHouse !== normalized && noHouse.length > 5) {
        variants.add(noHouse);
        if (city) variants.add(`${city}, ${noHouse}`);
    }

    // 6. Извлекаем содержимое скобок как альтернативное название улицы (старые названия)
    const parenMatch = raw.match(/\(([^)]+)\)/);
    if (parenMatch) {
        const inner = parenMatch[1].trim();
        if (inner.length > 3 && !/^\d+$/.test(inner) && !/кв|эт|под|моб|д\/ф|літ|лит/i.test(inner)) {
            const houseMatch = cleaned.match(/,?\s*(\d+[а-яіє]*)$/i);
            const house = houseMatch ? houseMatch[1] : '';

            // Добавляем вариант "СтароеНазвание дом, Город"
            variants.add(`${inner}${house ? ' ' + house : ''}, ${city || 'Київ'}`.trim());
            variants.add(`${city || 'Київ'}, ${inner}${house ? ' ' + house : ''}`.trim());

            // Также пробуем с префиксом типа улицы
            const prefix = cleaned.match(/^(вулиця|вул\.?|проспект|просп\.?|провулок|пров\.?|бульвар|бул\.?)\s*/i);
            const prefixStr = prefix ? prefix[1] + ' ' : '';
            variants.add(`${city || 'Київ'}, ${prefixStr}${inner}${house ? ' ' + house : ''}`.trim());
        }
    }

    // 7. Извлекаем только "улица + дом" без префиксов
    const streetHouse = extractStreetAndHouse(normalized);
    if (streetHouse && streetHouse.length > 3) {
        variants.add(`${city || 'Київ'}, ${streetHouse}`);
    }

    // 8. Типичные паттерны украинских пригородов/посёлков
    if (/\b(дача|дачне|ДНТ|СТ|садов)\b/i.test(raw)) {
        const districtMatch = raw.match(/([А-ЯІЄҐ][а-яієґ]+(?:\s+[А-ЯІЄҐ][а-яієґ]+)?)\s+район/i);
        if (districtMatch) {
            variants.add(`${districtMatch[1]} район, ${city || ''}`);
        }
    }

    // 9. Удаляем суффиксы "корп." или "буд.", сбивающие геокодеры
    const noBuilding = cleaned.replace(/,?\s*(корп\.?|буд\.?|корпус|будинок)\s*\d+[а-яіє]?/gi, '').trim();
    if (noBuilding !== cleaned) {
        variants.add(noBuilding);
        if (city) variants.add(`${city}, ${noBuilding}`);
    }

    // 10. Запасной вариант с транслитерацией ключевых украинских букв
    const transliterated = normalized
        .replace(/ї/gi, 'i').replace(/є/gi, 'ye').replace(/і/gi, 'i')
        .replace(/ґ/gi, 'g').replace(/'/g, '');
    if (transliterated !== normalized && transliterated.length > 4) {
        variants.add(transliterated);
    }

    // Фильтруем пустые, дедуплицируем, возвращаем упорядоченный список
    return [...new Set([...variants])].filter(v => v && v.length > 4);
}

// ============================================================
// РЕАЛИЗАЦИИ ПРОВАЙДЕРОВ
// ============================================================

async function queryPhoton(query, photonUrl, timeout = 6000, searchBbox = null, focusPoint = null) {
    let url = `${photonUrl}/api?q=${encodeURIComponent(query)}&limit=5`;
    if (searchBbox) {
        url += `&bbox=${searchBbox.minLng},${searchBbox.minLat},${searchBbox.maxLng},${searchBbox.maxLat}`;
    }
    if (focusPoint) {
        url += `&lon=${focusPoint.lng}&lat=${focusPoint.lat}`;
    }
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

async function queryKomoot(query, timeout = 8000, searchBbox = null, focusPoint = null) {
    let url = `https://photon.komoot.io/api?q=${encodeURIComponent(query)}&limit=5`;
    if (searchBbox) {
        url += `&bbox=${searchBbox.minLng},${searchBbox.minLat},${searchBbox.maxLng},${searchBbox.maxLat}`;
    }
    if (focusPoint) {
        url += `&lon=${focusPoint.lng}&lat=${focusPoint.lat}`;
    }
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

async function queryNominatim(query, timeout = 8000, searchBbox = null) {
    let url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1&accept-language=uk`;
    if (searchBbox) {
        url += `&viewbox=${searchBbox.minLng},${searchBbox.maxLat},${searchBbox.maxLng},${searchBbox.minLat}&bounded=1`;
    }
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

async function queryNominatimLocal(query, timeout = 3000, searchBbox = null) {
    const localBase = (process.env.NOMINATIM_URL || 'http://127.0.0.1:8080').trim().replace(/\/+$/, '');
    let url = `${localBase}/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1&accept-language=uk`;
    if (searchBbox) {
        url += `&viewbox=${searchBbox.minLng},${searchBbox.maxLat},${searchBbox.maxLng},${searchBbox.minLat}&bounded=1`;
    }
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

async function queryNominatimMirror(query, timeout = 8000, searchBbox = null) {
    let url = `https://nominatim.geocoding.ai/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1&accept-language=uk`;
    if (searchBbox) {
        url += `&viewbox=${searchBbox.minLng},${searchBbox.maxLat},${searchBbox.maxLng},${searchBbox.minLat}&bounded=1`;
    }
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

// v42: Geoapify — высокоточный коммерческий провайдер
// Поддерживает Ukrainian rooftop precision, лучший для пригородов и переименованных улиц.

// v50: Идеальный гениальный провайдер - ArcGIS (бесплатно, быстро, без ключа, не банит IP Render)
async function queryArcgis(query, timeout = 6000, searchBbox = null, focusPoint = null) {
    let url = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?singleLine=${encodeURIComponent(query)}&sourceCountry=UKR&f=json&maxLocations=5`;
    if (searchBbox) {
        url += `&searchExtent=${searchBbox.minLng},${searchBbox.minLat},${searchBbox.maxLng},${searchBbox.maxLat}`;
    }
    if (focusPoint) {
        url += `&location=${focusPoint.lng},${focusPoint.lat}&distance=50000`;
    }
    const res = await axios.get(url, { timeout, proxy: false, headers: { 'User-Agent': 'KillMetraj_App/2.0' } });
    if (!res.data?.candidates?.length) return [];
    return res.data.candidates.map(c => ({
        lat: c.location.y,
        lng: c.location.x,
        display: c.address,
        provider: 'arcgis',
        type: c.attributes?.Addr_type || 'address',
        confidence: (c.score || 80) / 100
    }));
}

async function queryGeoapify(query, timeout = 8000, searchBbox = null, focusPoint = null) {
    const GEOAPIFY_KEY = process.env.GEOAPIFY_API_KEY || 'e57726487e4d41e7807a00508007a6ec';
    if (!GEOAPIFY_KEY) return [];
    let url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(query)}&lang=uk&limit=5&apiKey=${GEOAPIFY_KEY}`;
    if (searchBbox) {
        url += `&filter=rect:${searchBbox.minLng},${searchBbox.minLat},${searchBbox.maxLng},${searchBbox.maxLat}`;
    }
    if (focusPoint) {
        url += `&bias=proximity:${focusPoint.lng},${focusPoint.lat}`;
    }
    const res = await axios.get(url, { timeout, proxy: false, headers: { 'User-Agent': 'KillMetraj/2.0' } });
    const features = res.data?.features || [];
    return features.map(f => {
        const props = f.properties || {};
        const [lng, lat] = f.geometry?.coordinates || [null, null];
        if (!lat || !lng) return null;
        const confidence = props.rank?.confidence || (props.housenumber ? 0.95 : 0.75);
        return {
            lat: parseFloat(lat),
            lng: parseFloat(lng),
            display: props.formatted || query,
            provider: 'geoapify',
            type: props.housenumber ? 'ROOFTOP' : 'RANGE_INTERPOLATED',
            importance: confidence,
            confidence
        };
    }).filter(Boolean);
}

// Безопасная обёртка запроса — возвращает [] при любой ошибке
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
            // Считаем "успехом" получение любых кандидатов
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
// ОЦЕНКА КАНДИДАТОВ
// ============================================================

/**
 * Оценить кандидата геокодирования.
 * Выше = лучше.
 */
function scoreCandidate(candidate, { city, expectedZoneName, kmlZones, anomalyRadiusKm }) {
    let score = candidate.confidence || 0.5;

    // Бонус за совпадение города в названии
    if (city && candidate.display && candidate.display.toLowerCase().includes(city.toLowerCase())) {
        score += 1.0;
    }

    // Бонус для nominatim по важности
    if (candidate.importance) score += candidate.importance;

    // Бонус для результатов с номером дома
    if (['house', 'building', 'residential'].includes(candidate.type)) score += 0.5;

    // Штраф: вне границ города
    const bounds = getCityBounds(city);
    if (bounds) {
        if (!isInBounds(candidate.lat, candidate.lng, bounds)) {
            score -= 10; // Жёсткий штраф — вне города
        }
    }

    // v7.7: СТРОГАЯ ПРОВЕРКА НАХОЖДЕНИЯ В ПОЛИГОНЕ (КРИТИЧЕСКИЙ ПРИОРИТЕТ)
    // Если есть активные KML зоны, точка ДОЛЖНА быть внутри одной из них
    if (kmlZones && kmlZones.length > 0) {
        let isInsideAnyActiveZone = false;
        let bestZoneMatch = null;

        for (const zone of kmlZones) {
            const polygon = zone.boundary?.coordinates?.[0] || zone.coordinates;
            if (polygon && KmlService._isPointInPolygon(candidate.lat, candidate.lng, polygon)) {
                isInsideAnyActiveZone = true;
                bestZoneMatch = zone;
                break;
            }
        }

        if (isInsideAnyActiveZone) {
            score += 5.0; // ОГРОМНЫЙ бонус за нахождение внутри активного сектора
            candidate.kmlZone = bestZoneMatch.name;
        } else {
            // v44: "Мягкий" KML лимит. Проверяем расстояние до центроидов зон.
            // Если точка снаружи полигона, но ОЧЕНЬ близко к центроиду какой-то зоны (< 2.5 км),
            // мы не штрафуем её экстремально, так как полигоны могут быть нарисованы неточно.
            let minDistanceToCentroid = Infinity;
            for (const zone of kmlZones) {
                if (zone.centroid) {
                    const d = haversine(candidate.lat, candidate.lng, zone.centroid.lat, zone.centroid.lng);
                    if (d < minDistanceToCentroid) minDistanceToCentroid = d;
                }
            }

            if (minDistanceToCentroid <= 2.5) {
                score -= 2.0; // Умеренный штраф (за пределами зоны, но близко)
                logger.debug(`[GeoEnhanced] Candidate (${candidate.lat}, ${candidate.lng}) outside KML but within tolerance (${minDistanceToCentroid.toFixed(1)}km from centroid).`);
            } else {
                score -= 15.0; // Экстремальный штраф (полностью другой конец города)
                logger.debug(`[GeoEnhanced] Candidate (${candidate.lat}, ${candidate.lng}) rejected: outside all active zones and far from centroids (${minDistanceToCentroid.toFixed(1)}km).`);
            }
        }
    }

    // Штраф: аномальная позиция относительно центроида зоны (запасная логика)
    if (expectedZoneName && kmlZones?.length) {
        const zoneMatch = kmlZones.find(z =>
            z.name && z.name.toLowerCase().includes(expectedZoneName.toLowerCase())
        );
        if (zoneMatch?.centroid) {
            const dist = haversine(candidate.lat, candidate.lng, zoneMatch.centroid.lat, zoneMatch.centroid.lng);
            if (dist > anomalyRadiusKm) {
                score -= 5 * (dist / anomalyRadiusKm); // Пропорциональный штраф
            } else {
                score += 0.5; // Небольшой бонус за близость к ожидаемой зоне
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
// ПРОВЕРКА АНОМАЛЬНОГО РАССТОЯНИЯ
// ============================================================

/**
 * Имея набор уже геокодированных координат заказов для этого курьера/дивизиона,
 * проверить, находится ли новый кандидат аномально далеко от центроида.
 * Возвращает { anomaly: bool, distKm: number }
 */
function checkAnomalyDistance(candidateLat, candidateLng, existingCoords, maxAnomalyKm = 30) {
    if (!existingCoords || existingCoords.length < 2) return { anomaly: false };

    // Вычисляем центроид существующих точек
    const centLat = existingCoords.reduce((s, c) => s + c.lat, 0) / existingCoords.length;
    const centLng = existingCoords.reduce((s, c) => s + c.lng, 0) / existingCoords.length;

    const dist = haversine(candidateLat, candidateLng, centLat, centLng);
    return { anomaly: dist > maxAnomalyKm, distKm: dist, centLat, centLng };
}

// ============================================================
// ГЛАВНЫЙ ЭКСПОРТ: enhancedGeocode
// ============================================================

/**
 * 6-уровневое расширенное геокодирование со специализацией по украинским адресам, валидацией зон
 * и обнаружением аномального расстояния.
 *
 * @param {string}   address         - Сырой адрес из FO
 * @param {string}   city            - Название города для смещения (например, 'Харків')
 * @param {string}   expectedZone    - Ожидаемое имя KML-зоны (из данных FO)
 * @param {object[]} kmlZones        - Все загруженные KML-зоны (с центроидом, если доступен)
 * @param {object[]} divisionCoords  - Уже геокодированные координаты для этого дивизиона (для проверки аномалий)
 * @param {object}   options         - { photonUrl, geoCacheDb, gcacheLRU }
 * @returns {{ latitude, longitude, provider, locationType, anomaly } | null}
 */
async function enhancedGeocode(address, city = 'Харків', expectedZone = null, kmlZones = [], divisionCoords = [], options = {}) {
    if (!address || !address.trim()) return null;

    // v1.1: Авто-детекция города из строки адреса (приоритет над переданным bias)
    const detectCity = (addr) => {
        const s = addr.toLowerCase();
        if (s.includes('харьков') || s.includes('харків')) return 'Харків';
        if (s.includes('одесса') || s.includes('одеса')) return 'Одеса';
        if (s.includes('днепр') || s.includes('дніпро')) return 'Дніпро';
        if (s.includes('полтава')) return 'Полтава';
        if (s.includes('львов') || s.includes('львів')) return 'Львів';
        // Пригороды Киева -> Киев
        const kyivSuburbs = [
            'бровари', 'бровары', 'бориспіль', 'борисполь', 'ірпінь', 'ирпень',
            'буча', 'вишгород', 'вышгород', 'вишневе', 'вишневое', 'боярка',
            'обухів', 'обухов', 'васильків', 'васильков', 'софіївська борщагівка',
            'петропавлівська борщагівка', 'щасливе', 'счастливое', 'горенка'
        ];
        if (kyivSuburbs.some(sub => s.includes(sub)) || s.includes('київ') || s.includes('киев')) {
            return 'Київ';
        }
        return null;
    };

    const detectedCity = detectCity(address);
    const effectiveCity = detectedCity || city || 'Харків';

    const { photonUrl = 'http://localhost:2322', geoCacheDb = null, gcacheLRU = null, onProviderEvent, hubAnchor = null } = options;
    const safeQueryTracked = mkSafeQueryTracked(onProviderEvent);

    const CITY_BOUNDS_OBJ = getCityBounds(effectiveCity);
    
    // v46: SOTA Next-Gen BBOX Extraction & Dynamic Buffer
    let searchBbox = null;
    let focusPoint = null;
    if (expectedZone && kmlZones && kmlZones.length > 0) {
        const expectedZoneNorm = expectedZone.toLowerCase();
        const zoneMatch = kmlZones.find(z => z.name && z.name.toLowerCase().includes(expectedZoneNorm));
        if (zoneMatch && zoneMatch.bounds) {
            const BUFFER_DEG = 0.005; // ~500 meters dynamic expansion
            searchBbox = {
                minLat: zoneMatch.bounds.south - BUFFER_DEG,
                maxLat: zoneMatch.bounds.north + BUFFER_DEG,
                minLng: zoneMatch.bounds.west - BUFFER_DEG,
                maxLng: zoneMatch.bounds.east + BUFFER_DEG
            };
            if (zoneMatch.centroid) focusPoint = zoneMatch.centroid;
        }
    }
    if (!focusPoint && hubAnchor && hubAnchor.lat) {
        focusPoint = hubAnchor;
    }

    // v39.1: Максимальное расстояние от хаба — когда KML зоны отсутствуют, отклонять точки слишком далеко от хаба.
    // 15 км по прямой покрывает все типичные городские зоны доставки (Оболонь, Подол, Осокорки и т.д.)
    const HUB_MAX_KM = 15;
    const hasHub = hubAnchor && hubAnchor.lat && hubAnchor.lng;
    const hasKml = kmlZones && kmlZones.length > 0;

    // v39.1: Защита хаб-якоря — отклоняет координату, если она дальше HUB_MAX_KM от хаба
    // Применяется ТОЛЬКО когда нет KML зон (если KML есть, зоны обрабатывают пространственную валидацию)
    const isOutsideHubRadius = (lat, lng) => {
        if (!hasHub || hasKml) return false; // Не применимо
        const d = haversine(lat, lng, hubAnchor.lat, hubAnchor.lng);
        return d > HUB_MAX_KM;
    };

    // v44: KML пространственная защита с ТОЛЕРАНТНОСТЬЮ — точка должна быть внутри полигона
    // ИЛИ находиться достаточно близко (2.5 км) к центроиду любой зоны, чтобы избежать отбраковки идеально точных адресов из-за кривых полигонов.
    const isInsideActiveZones = (lat, lng) => {
        if (!hasKml) return true; // Если KML нет, считаем "внутри" для прохода к City Bounds
        
        // 1. Строгая проверка по полигону
        for (const zone of kmlZones) {
            const polygon = zone.boundary?.coordinates?.[0] || zone.coordinates;
            if (polygon && KmlService._isPointInPolygon(lat, lng, polygon)) {
                return true; // Внутри активной зоны
            }
        }
        
        // 2. Мягкая проверка по дистанции (tolerance)
        for (const zone of kmlZones) {
            if (zone.centroid) {
                const d = haversine(lat, lng, zone.centroid.lat, zone.centroid.lng);
                if (d <= 2.0) {
                    return true; // В пределах толерантности
                }
            }
        }
        
        return false; // Снаружи всех активных зон и за пределами толерантности
    };

    // -------------------------------
    // L1: LRU кэш в памяти
    // -------------------------------
    const cacheKey = deepCleanAddress(address).toLowerCase();
    if (gcacheLRU) {
        const lruHit = gcacheLRU.get(cacheKey);
        if (lruHit && lruHit.latitude) {
            // v39.1: Даже LRU-кэшированные результаты должны проходить проверки хаб-якоря и KML
            if (isOutsideHubRadius(lruHit.latitude, lruHit.longitude) || !isInsideActiveZones(lruHit.latitude, lruHit.longitude)) {
                logger.warn(`[GeoEnhanced] L1 LRU EVICTED: ${address} — cached coord is outside allowed zones/hub radius`);
                gcacheLRU.delete(cacheKey);
                // Проваливаемся к повторному геокодированию
            } else {
                logger.debug(`[GeoEnhanced] L1 LRU hit: ${address}`);
                return lruHit;
            }
        }
    }

    // -------------------------------
    // L2: GeoCache БД
    // -------------------------------
    if (geoCacheDb) {
        try {
            const cached = await geoCacheDb.findOne({ where: { address_key: cacheKey, is_success: true } });
            if (cached && cached.lat && cached.lng) {
                // v40: ОБХОД РУЧНОЙ КОРРЕКЦИИ — если оператор вручную закрепил этот адрес,
                // НИКОГДА не удалять и не перегеокодировать его независимо от KML/хаб-якоря.
                // Ручные закрепления — это истина, и они должны переживать перенастройку зон.
                if (cached.provider === 'manual') {
                    const result = { latitude: cached.lat, longitude: cached.lng, locationType: 'MANUAL_FIX', provider: 'manual', _isManual: true };
                    if (gcacheLRU) gcacheLRU.set(cacheKey, result);
                    logger.debug(`[GeoEnhanced] L2 MANUAL pin preserved for: ${address}`);
                    return result;
                }
                // v39.1: Проверяем координату из кэша БД по хаб-якорю и KML зонам
                if (isOutsideHubRadius(cached.lat, cached.lng) || !isInsideActiveZones(cached.lat, cached.lng)) {
                    logger.warn(`[GeoEnhanced] L2 DB cache EVICTED: ${address} — cached coord (${cached.lat.toFixed(4)},${cached.lng.toFixed(4)}) is outside allowed zones/hub radius. Will re-geocode.`);
                    try { await geoCacheDb.destroy({ where: { address_key: cacheKey } }); } catch (_) {}
                    if (gcacheLRU) gcacheLRU.delete(cacheKey);
                    // Проваливаемся к свежему геокодированию
                } else {
                    const result = { latitude: cached.lat, longitude: cached.lng, locationType: 'CACHED_DB', provider: cached.provider || 'cache' };
                    if (gcacheLRU) gcacheLRU.set(cacheKey, result);
                    logger.debug(`[GeoEnhanced] L2 DB cache hit: ${address}`);
                    return result;
                }
            }
        } catch (e) { /* ignore */ }
    }

    // Вспомогательная: валидируем и оцениваем пакет кандидатов
    const scoreBatch = (candidates) => candidates
        .filter(c => c && !isNaN(c.lat) && !isNaN(c.lng))
        .map(c => scoreCandidate(c, {
            city,
            expectedZoneName: expectedZone,
            kmlZones,
            anomalyRadiusKm: 25 // 25км от центроида зоны — аномалия
        }))
        .filter(c => c._score > -5); // Жёсткий порог отклонения

    const tryAccept = (candidates, label) => {
        if (!candidates.length) return null;
        const best = pickBest(candidates);
        if (!best) return null;

        // v41: Приоритет KML. Если точка ВНУТРИ KML, игнорируем CITY_BOUNDS_OBJ.
        // Это позволяет пригородам работать без огромного разлета City Bounds, если зоны настроены.
        const inKml = hasKml ? isInsideActiveZones(best.lat, best.lng) : false;
        
        if (!inKml && CITY_BOUNDS_OBJ && !isInBounds(best.lat, best.lng, CITY_BOUNDS_OBJ)) {
            logger.warn(`[GeoEnhanced] ${label}: Best candidate (${best.lat.toFixed(4)},${best.lng.toFixed(4)}) is OUTSIDE ${effectiveCity} bounds and NOT in KML — rejected`);
            return null;
        }

        if (hasKml && !inKml) {
             logger.warn(`[GeoEnhanced] ${label}: Candidate (${best.lat.toFixed(4)},${best.lng.toFixed(4)}) is OUTSIDE KML zones — rejected`);
             return null;
        }

        // v39.1: Проверка хаб-якоря — отклоняем, если слишком далеко от хаба (только если нет KML зон)
        if (isOutsideHubRadius(best.lat, best.lng)) {
            const dHub = haversine(best.lat, best.lng, hubAnchor.lat, hubAnchor.lng);
            logger.warn(`[GeoEnhanced] ${label}: Candidate (${best.lat.toFixed(4)},${best.lng.toFixed(4)}) is ${dHub.toFixed(1)}km from hub — exceeds ${HUB_MAX_KM}km limit. REJECTED. (addr: ${address})`);
            return null;
        }

        // v39.1: Порог аномалии вернули к 30км по запросу
        if (divisionCoords.length >= 3) {
            const { anomaly, distKm } = checkAnomalyDistance(best.lat, best.lng, divisionCoords, 30);
            if (anomaly) {
                logger.warn(`[GeoEnhanced] ${label}: Anomalous distance ${distKm?.toFixed(1)}km from division centroid (threshold: 30km) — rejected (addr: ${address})`);
                return null;
            }
        }

        // v39.1: Проверка консенсуса между провайдерами когда НЕТ KML зон.
        // Если только 1 провайдер вернул результат и он лучший, требуем согласия с другими в пределах 5км.
        // Это предотвращает принятие единичного выброса геокодера как истины.
        if (!hasKml && candidates.length > 1) {
            const otherCandidates = candidates.filter(c => c !== best && c._score > -3);
            if (otherCandidates.length >= 2) {
                // Вычисляем центроид консенсуса других провайдеров
                const consensusLat = otherCandidates.reduce((s, c) => s + c.lat, 0) / otherCandidates.length;
                const consensusLng = otherCandidates.reduce((s, c) => s + c.lng, 0) / otherCandidates.length;
                const distFromConsensus = haversine(best.lat, best.lng, consensusLat, consensusLng);
                if (distFromConsensus > 5) {
                    logger.warn(`[GeoEnhanced] ${label}: Best candidate disagrees with ${otherCandidates.length} other providers by ${distFromConsensus.toFixed(1)}km — flagged as unreliable (addr: ${address})`);
                    // Пробуем кандидата центроида консенсуса вместо этого
                    const consensusCandidate = pickBest(otherCandidates);
                    if (consensusCandidate) {
                        logger.info(`[GeoEnhanced] ${label}: Using consensus candidate instead: (${consensusCandidate.lat.toFixed(5)},${consensusCandidate.lng.toFixed(5)}) via ${consensusCandidate.provider}`);
                        return { latitude: consensusCandidate.lat, longitude: consensusCandidate.lng, locationType: consensusCandidate.type || 'CONSENSUS', provider: consensusCandidate.provider, _score: consensusCandidate._score };
                    }
                }
            }
        }

        // v45: СТРОГАЯ ПРОВЕРКА ОЖИДАЕМОЙ ЗОНЫ
        if (expectedZone && kmlZones && kmlZones.length > 0) {
            const expectedZoneNorm = expectedZone.toLowerCase();
            const zoneMatch = kmlZones.find(z => z.name && z.name.toLowerCase().includes(expectedZoneNorm));
            
            if (zoneMatch && zoneMatch.centroid) {
                // Если геокодер нашел точку, которая дальше 2 км от центра ОЖИДАЕМОЙ зоны
                // это ложное срабатывание в другом районе города
                const distToExpectedCentroid = haversine(best.lat, best.lng, zoneMatch.centroid.lat, zoneMatch.centroid.lng);
                if (distToExpectedCentroid > 2) {
                    logger.warn(`[GeoEnhanced] ${label}: Best candidate (${best.lat.toFixed(4)},${best.lng.toFixed(4)}) is ${distToExpectedCentroid.toFixed(1)}km from EXPECTED zone "${expectedZone}" centroid (> 2km limit) — REJECTED. (addr: ${address})`);
                    return null;
                }
            }
        }

        logger.info(`[GeoEnhanced]  ${label}: Accepted (${best.lat.toFixed(5)},${best.lng.toFixed(5)}) score=${best._score.toFixed(2)} via ${best.provider}`);
        return { latitude: best.lat, longitude: best.lng, locationType: best.type || best.provider?.toUpperCase() || 'GEOCODED', provider: best.provider, _score: best._score };
    };

    const saveToCache = async (result, provider) => {
        if (!result) return;
        // Не кешируем центроиды фолбеков, так как это не точные адреса
        if (['kml_centroid', 'division_centroid', 'city_centroid'].includes(provider) || 
            ['kml_centroid', 'division_centroid', 'city_centroid'].includes(result.provider)) return;
        
        if (gcacheLRU) gcacheLRU.set(cacheKey, result);
        if (geoCacheDb) {
            try {
                await geoCacheDb.upsert({
                    address_key: cacheKey,
                    lat: result.latitude,
                    lng: result.longitude,
                    is_success: true,
                    provider: provider || result.provider || 'enhanced',
                    // J: явно ставим expires_at = +7 дней максимум, чтобы не засорять БД устаревающими данными
                    expires_at: new Date(Date.now() + 7 * 24 * 3600 * 1000),
                    updated_at: new Date(),
                });
            } catch (e) { /* ignore */ }
        }
    };

    // Helper for ultra-fast early return: resolves immediately if any provider finds a high-confidence match inside KML
    const raceWithEarlyAccept = (promises, label) => {
        return new Promise((resolve) => {
            let pending = promises.length;
            let allCandidates = [];
            let resolved = false;

            for (const p of promises) {
                p.then(res => {
                    if (resolved) return;
                    if (res && res.length > 0) {
                        allCandidates.push(...res);
                        // Only try early accept if KML is present (so no consensus needed) 
                        if (hasKml) {
                            const scored = scoreBatch(res);
                            // We only fast-track if the candidate is very strong (score >= 0)
                            if (scored.length > 0 && scored[0]._score >= 0) {
                                const accepted = tryAccept(scored, `${label}-Fast`);
                                if (accepted) {
                                    resolved = true;
                                    return resolve(accepted);
                                }
                            }
                        }
                    }
                    pending--;
                    if (pending === 0 && !resolved) {
                        resolved = true;
                        resolve(tryAccept(scoreBatch(allCandidates), label));
                    }
                }).catch(() => {
                    if (resolved) return;
                    pending--;
                    if (pending === 0 && !resolved) {
                        resolved = true;
                        resolve(tryAccept(scoreBatch(allCandidates), label));
                    }
                });
            }
            if (promises.length === 0) resolve(null);
        });
    };

    // ----------------------------------------
    // L3: Турбо параллельно — первичный чистый запрос
    // ----------------------------------------
    const cleanQuery = deepCleanAddress(address);
    const normalizedQuery = normalizeUkrainianAddress(cleanQuery);
    // Используем нормализованный запрос для L3 (расширяет сокращения, нормализует название города)
    const cityQuery = city ? `${normalizedQuery}, ${city}` : normalizedQuery;

    {
        const includeNl = selfHostRoutingHealth.shouldQueryNominatimLocal();
        const promises = [
            includeNl ? safeQueryTracked('nominatim-local', queryNominatimLocal, cityQuery, 3000, searchBbox) : Promise.resolve([]),
            safeQueryTracked('photon', queryPhoton, cityQuery, photonUrl, 3500, searchBbox, focusPoint),
            safeQueryTracked('komoot', queryKomoot, cityQuery, 4500, searchBbox, focusPoint),
            safeQueryTracked('nominatim', queryNominatim, cityQuery, 4500, searchBbox),
            safeQueryTracked('nominatim-mirror', queryNominatimMirror, cityQuery, 4500, searchBbox),
            safeQueryTracked('maps-co', queryMapsCo, cityQuery, 4500),
            safeQueryTracked('geoapify', queryGeoapify, cityQuery, 6000, searchBbox, focusPoint),
            safeQueryTracked('arcgis', queryArcgis, cityQuery, 5000, searchBbox, focusPoint),
        ];
        const result = await raceWithEarlyAccept(promises, 'L3-Turbo');
        if (result) { await saveToCache(result, result.provider); return result; }
    }

    // L3.5: Также пробуем с очищенным (ненормализованным) запросом, если отличается
    if (cleanQuery !== normalizedQuery) {
        const rawCityQuery = city ? `${cleanQuery}, ${city}` : cleanQuery;
        const includeNl35 = selfHostRoutingHealth.shouldQueryNominatimLocal();
        const promises = [
            includeNl35 ? safeQueryTracked('nominatim-local', queryNominatimLocal, rawCityQuery, 3000, searchBbox) : Promise.resolve([]),
            safeQueryTracked('photon', queryPhoton, rawCityQuery, photonUrl, 3500, searchBbox, focusPoint),
            safeQueryTracked('komoot', queryKomoot, rawCityQuery, 4500, searchBbox, focusPoint),
            safeQueryTracked('nominatim', queryNominatim, rawCityQuery, 4500, searchBbox),
            safeQueryTracked('nominatim-mirror', queryNominatimMirror, rawCityQuery, 4500, searchBbox),
            safeQueryTracked('maps-co', queryMapsCo, rawCityQuery, 4500),
            safeQueryTracked('geoapify', queryGeoapify, rawCityQuery, 6000, searchBbox, focusPoint),
            safeQueryTracked('arcgis', queryArcgis, rawCityQuery, 5000, searchBbox, focusPoint),
        ];
        const result = await raceWithEarlyAccept(promises, 'L3.5-Raw');
        if (result) { await saveToCache(result, result.provider); return result; }
    }

    // ----------------------------------------
    // L4: Расширение вариантов — UA-специфичные
    // ----------------------------------------
    const variants = generateUAVariants(address, city);

    // Пробуем каждый вариант независимо (в порядке приоритета)
    for (let i = 0; i < Math.min(variants.length, 10); i++) {
        const v = variants[i];
        if (v.toLowerCase() === cityQuery.toLowerCase()) continue; // Уже пробовали

        const includeNlV = selfHostRoutingHealth.shouldQueryNominatimLocal();
        // v42: добавляем geoapify в L4 — даёт лучший результат для нестандартных вариантов
        const promises = [
            includeNlV ? safeQueryTracked('nominatim-local', queryNominatimLocal, v, 3000, searchBbox) : Promise.resolve([]),
            safeQueryTracked('photon', queryPhoton, v, photonUrl, 3500, searchBbox, focusPoint),
            safeQueryTracked('nominatim', queryNominatim, v, 4500, searchBbox),
            safeQueryTracked('nominatim-mirror', queryNominatimMirror, v, 4500, searchBbox),
            safeQueryTracked('maps-co', queryMapsCo, v, 4500),
            safeQueryTracked('geoapify', queryGeoapify, v, 6000, searchBbox, focusPoint),
            safeQueryTracked('arcgis', queryArcgis, v, 5000, searchBbox, focusPoint),
        ];
        const result = await raceWithEarlyAccept(promises, `L4-Variant[${i}]`);
        if (result) { await saveToCache(result, result.provider); return result; }
    }

    // ----------------------------------------
    // L5: Глубокое падение — прогрессивное удаление
    // ----------------------------------------
    const deepStrategies = buildDeepStrategies(cleanQuery, city);
    for (const { query, label } of deepStrategies) {
        const includeNlD = selfHostRoutingHealth.shouldQueryNominatimLocal();
        const promises = [
            includeNlD ? safeQueryTracked('nominatim-local', queryNominatimLocal, query, 3000, searchBbox) : Promise.resolve([]),
            safeQueryTracked('photon', queryPhoton, query, photonUrl, 3500, searchBbox, focusPoint),
            safeQueryTracked('komoot', queryKomoot, query, 4500, searchBbox, focusPoint),
            safeQueryTracked('nominatim', queryNominatim, query, 4500, searchBbox),
            safeQueryTracked('nominatim-mirror', queryNominatimMirror, query, 4500, searchBbox),
            safeQueryTracked('maps-co', queryMapsCo, query, 4500),
            safeQueryTracked('geoapify', queryGeoapify, query, 6000, searchBbox, focusPoint),
            safeQueryTracked('arcgis', queryArcgis, query, 5000, searchBbox, focusPoint),
        ];
        const result = await raceWithEarlyAccept(promises, `L5-Deep[${label}]`);
        if (result) {
            logger.info(`[GeoEnhanced] L5 deep fallback success (${label}) for: ${address}`);
            await saveToCache(result, result.provider);
            return result;
        }
    }

    // ----------------------------------------
    // L6: Экстренное — принимаем любой результат внутри города, игнорируем зону
    // Пробуем с полностью очищенным адресом сначала, затем прогрессивно проще
    // ----------------------------------------
    logger.warn(`[GeoEnhanced] L6 Emergency: loosening zone constraint for: ${address}`);

    const emergencyQueries = [];
    // 6a. Полный нормализованный запрос
    const fullNormalized = normalizeUkrainianAddress(cleanQuery);
    if (fullNormalized !== cleanQuery) {
        emergencyQueries.push(`${city}, ${fullNormalized}`);
    }
    // 6b. Только улица + дом
    const shQuery = extractStreetAndHouse(fullNormalized);
    if (shQuery) {
        emergencyQueries.push(`${city}, ${shQuery}`);
    }
    // 6c. Оригинальный токен до первой запятой (может содержать номер дома)
    const firstPart = cleanQuery.split(',')[0].trim();
    if (firstPart && firstPart.length > 3) {
        emergencyQueries.push(`${city}, ${firstPart}`);
    }
    // 6d. Применяем переименования и пробуем
    const renamed6 = applyCityRenames(fullNormalized, city);
    for (const rv of renamed6) {
        if (rv !== fullNormalized) {
            emergencyQueries.push(`${city}, ${rv}`);
        }
    }

    let emergencyBest = null;
    const includeNlE = selfHostRoutingHealth.shouldQueryNominatimLocal();

    for (const eq of emergencyQueries) {
        const [enl, ep, ek, en, enm, emc, eg] = await Promise.all([
            includeNlE ? safeQueryTracked('nominatim-local', queryNominatimLocal, eq, 3000) : Promise.resolve([]),
            safeQueryTracked('photon', queryPhoton, eq, photonUrl, 3500, null, focusPoint),
            safeQueryTracked('komoot', queryKomoot, eq, 4500, null, focusPoint),
            safeQueryTracked('nominatim', queryNominatim, eq, 4500),
            safeQueryTracked('nominatim-mirror', queryNominatimMirror, eq, 4500),
            safeQueryTracked('maps-co', queryMapsCo, eq, 4500),
            safeQueryTracked('geoapify', queryGeoapify, eq, 6000, null, focusPoint),
            safeQueryTracked('arcgis', queryArcgis, eq, 5000, null, focusPoint),
        ]);

        const emergencyCandidates = [...enl, ...ep, ...ek, ...en, ...enm, ...emc, ...eg]
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
        // v40: Строгая KML защита для L6 — НЕ обходить KML зоны, если они существуют.
        if (hasKml && !isInsideActiveZones(emergencyBest.lat, emergencyBest.lng)) {
             logger.warn(`[GeoEnhanced] L6 Emergency candidate (${emergencyBest.lat.toFixed(4)},${emergencyBest.lng.toFixed(4)}) is OUTSIDE all active KML zones — REJECTED to force manual fix. (addr: ${address})`);
        } else {
            logger.info(`[GeoEnhanced] L6 Emergency accepted (${emergencyBest.lat.toFixed(5)},${emergencyBest.lng.toFixed(5)}) for: ${address}`);
            const result = { latitude: emergencyBest.lat, longitude: emergencyBest.lng, locationType: 'EMERGENCY', provider: emergencyBest.provider, _score: emergencyBest._score };
            await saveToCache(result, result.provider);
            return result;
        }
    }

    // ============================================================
    // L7: СТРИТ МИДПОИНТ ФОЛБЕК (Street Midpoint Fallback)
    // ============================================================
    // Если адрес с номером дома не найден ни на одном из уровней, мы удаляем номер дома
    // и ищем только улицу. Возвращаем координаты ее середины.
    // Это сохраняет точность в пределах улицы, вместо сброса на центр целой зоны доставки.
    const streetFallbackQuery = extractStreetAndHouse(fullNormalized) ? extractStreetAndHouse(fullNormalized).replace(/[,\s]+\d+[а-яіє/a-z-]*\s*$/i, '').trim() : null;
    if (streetFallbackQuery && streetFallbackQuery.length > 4) {
        logger.warn(`[GeoEnhanced] L7 Street Midpoint Fallback: attempting to geocode street only for: ${address} -> ${streetFallbackQuery}`);
        
        const sfQuery = `${city}, ${streetFallbackQuery}`;
        const [enl, ep, ek, en, enm, emc, eg] = await Promise.all([
            includeNlE ? safeQueryTracked('nominatim-local', queryNominatimLocal, sfQuery, 3000) : Promise.resolve([]),
            safeQueryTracked('photon', queryPhoton, sfQuery, photonUrl, 3500, null, focusPoint),
            safeQueryTracked('komoot', queryKomoot, sfQuery, 4500, null, focusPoint),
            safeQueryTracked('nominatim', queryNominatim, sfQuery, 4500),
            safeQueryTracked('nominatim-mirror', queryNominatimMirror, sfQuery, 4500),
            safeQueryTracked('maps-co', queryMapsCo, sfQuery, 4500),
            safeQueryTracked('geoapify', queryGeoapify, sfQuery, 6000, null, focusPoint),
            safeQueryTracked('arcgis', queryArcgis, sfQuery, 5000, null, focusPoint),
        ]);

        const sfCandidates = [...enl, ...ep, ...ek, ...en, ...enm, ...emc, ...eg]
            .filter(c => c && !isNaN(c.lat) && !isNaN(c.lng))
            .map(c => scoreCandidate(c, { city, kmlZones: [], anomalyRadiusKm: 9999 }))
            .filter(c => {
                if (!CITY_BOUNDS_OBJ) return true;
                return isInBounds(c.lat, c.lng, CITY_BOUNDS_OBJ);
            });

        const bestSf = pickBest(sfCandidates);
        if (bestSf) {
            // Для Street Midpoint мы более лояльны, но всё же проверяем KML, если есть
            if (hasKml && !isInsideActiveZones(bestSf.lat, bestSf.lng)) {
                 logger.warn(`[GeoEnhanced] L7 Street Midpoint candidate (${bestSf.lat.toFixed(4)},${bestSf.lng.toFixed(4)}) is OUTSIDE all active KML zones — REJECTED.`);
            } else {
                logger.info(`[GeoEnhanced] L7 Street Midpoint Fallback accepted (${bestSf.lat.toFixed(5)},${bestSf.lng.toFixed(5)}) for: ${address}`);
                const result = { latitude: bestSf.lat, longitude: bestSf.lng, locationType: 'STREET_MIDPOINT', provider: bestSf.provider, _score: bestSf._score };
                await saveToCache(result, result.provider);
                return result;
            }
        }
    }

    // ============================================================
    // L8: ПАДЕНИЕ НА ЦЕНТРОИД ЗОНЫ (ГАРАНТИЯ 100% ГЕОКОДИРОВАНИЯ)
    // ============================================================
    // Для обеспечения 100% расчета заказов в фоновом режиме (чтобы курьеры не теряли километраж),
    // если адрес не найден, мы используем координаты центра сектора (KML зоны).
    // Важно: мы помечаем это как APPROXIMATE_ZONE, чтобы на UI это светилось как ошибка для ручного исправления,
    // но система могла продолжать расчет маршрута.
    if (expectedZone && hasKml) {
        const targetZone = kmlZones.find(z => z.name === expectedZone);
        if (targetZone && Array.isArray(targetZone.coordinates)) {
            let sumLat = 0, sumLng = 0, pts = 0;
            targetZone.coordinates.forEach(poly => {
                if (Array.isArray(poly)) {
                    poly.forEach(c => {
                        if (c.lat && c.lng) { sumLat += c.lat; sumLng += c.lng; pts++; }
                    });
                }
            });
            if (pts > 0) {
                const cLat = sumLat / pts;
                const cLng = sumLng / pts;
                logger.warn(`[GeoEnhanced] L8: ALL TEXT LEVELS FAILED. Falling back to KML ZONE CENTROID for: ${address}. (Zone: ${expectedZone})`);
                return { latitude: cLat, longitude: cLng, locationType: 'APPROXIMATE_ZONE', provider: 'kml_centroid', _score: 0.1 };
            }
        }
    }

    // ============================================================
    // L9: ПАДЕНИЕ НА ЦЕНТРОИД ФИЛИАЛА / ТЕКУЩИХ ЗАКАЗОВ
    // ============================================================
    // Если у заказа даже нет KML зоны, берем медиану всех успешных заказов в текущем расчете.
    if (divisionCoords && divisionCoords.length > 0) {
        let sumLat = 0, sumLng = 0;
        divisionCoords.forEach(c => { sumLat += c.lat; sumLng += c.lng; });
        const cLat = sumLat / divisionCoords.length;
        const cLng = sumLng / divisionCoords.length;
        logger.warn(`[GeoEnhanced] L9: ALL LEVELS FAILED. Falling back to DIVISION MEDIAN for: ${address}.`);
        return { latitude: cLat, longitude: cLng, locationType: 'APPROXIMATE_CITY', provider: 'division_centroid', _score: 0.05 };
    }

    // ============================================================
    // L10: ПАДЕНИЕ НА ЦЕНТРОИД ГОРОДА ПО УМОЛЧАНИЮ
    // ============================================================
    if (CITY_BOUNDS_OBJ) {
        const cLat = (CITY_BOUNDS_OBJ.minLat + CITY_BOUNDS_OBJ.maxLat) / 2;
        const cLng = (CITY_BOUNDS_OBJ.minLng + CITY_BOUNDS_OBJ.maxLng) / 2;
        logger.warn(`[GeoEnhanced] L10: Falling back to CITY CENTROID for: ${address}.`);
        return { latitude: cLat, longitude: cLng, locationType: 'APPROXIMATE_CITY', provider: 'city_centroid', _score: 0.01 };
    }

    logger.warn(`[GeoEnhanced]  ALL LEVELS FAILED for: ${address}. Marking as geo error (no fallback coords).`);
    return null;
}

// ============================================================
// ПОСТРОЕНИЕ СТРАТЕГИЙ ГЛУБОКОГО ПАДЕНИЯ
// ============================================================

function buildDeepStrategies(cleaned, city) {
    const strategies = [];
    const cp = city ? `${city}, ` : '';
    const normalized = normalizeUkrainianAddress(cleaned);

    // 1. Нормализованная версия (если отличается от очищенной)
    if (normalized !== cleaned && normalized.length > 4) {
        strategies.push({ query: `${cp}${normalized}`, label: 'normalized' });
    }

    // 2. Удаляем номер дома
    const noHouse = normalized.replace(/[,\s]+\d+[а-яіє/a-z-]*\s*$/i, '').trim();
    if (noHouse && noHouse !== normalized && noHouse.length > 5) {
        strategies.push({ query: `${cp}${noHouse}`, label: 'no-house' });
    }

    // 3. Первый токен до запятой
    const beforeComma = normalized.split(',')[0].trim();
    if (beforeComma && beforeComma !== normalized && beforeComma.length > 4) {
        strategies.push({ query: `${cp}${beforeComma}`, label: 'before-comma' });
    }

    // 4. Удаляем префикс типа улицы полностью
    const noPrefix = normalized
        .replace(/\b(вул\.?|вулиця|ул\.?|улица|пров\.?|просп\.?|пр-т\.?|пр\.?|бул\.?|бульвар|пл\.?|наб\.?|набережна)\s*/gi, '')
        .trim();
    if (noPrefix && noPrefix !== normalized) {
        strategies.push({ query: `${cp}${noPrefix}`, label: 'no-prefix' });
    }

    // 5. Извлекаем только название улицы + номер дома (наиболее агрессивная очистка)
    const streetHouse = extractStreetAndHouse(normalized);
    if (streetHouse && streetHouse.length > 3) {
        strategies.push({ query: `${cp}${streetHouse}`, label: 'street+house' });
    }

    // 6. Применяем переименования городов для каждой стратегии
    const renamedVariants = applyCityRenames(normalized, city);
    for (const rv of renamedVariants) {
        if (rv !== normalized && rv.length > 4) {
            strategies.push({ query: `${cp}${rv}`, label: 'renamed' });
            // Также без номера дома
            const rvNoHouse = rv.replace(/[,\s]+\d+[а-яіє/a-z-]*\s*$/i, '').trim();
            if (rvNoHouse && rvNoHouse !== rv && rvNoHouse.length > 4) {
                strategies.push({ query: `${cp}${rvNoHouse}`, label: 'renamed-no-house' });
            }
        }
    }

    // 7. Обратное: только город с минимальной подсказкой адреса
    const firstWord = normalized.split(/[\s,]/)[0];
    if (firstWord && firstWord.length > 3 && /[а-яієґ]/i.test(firstWord)) {
        strategies.push({ query: `${cp}${firstWord}`, label: 'first-word-only' });
    }

    // 8. Город + район (если адрес содержит информацию о районе)
    const districtMatch = normalized.match(/([А-ЯІЄҐ][а-яієґ]+(?:\s+[А-ЯІЄҐ][а-яієґ]+)?)\s*(?:район|р-н)/i);
    if (districtMatch) {
        strategies.push({ query: `${districtMatch[1]} район, ${city}`, label: 'district' });
    }

    // 9. Старое название улицы в скобках (из исходного адреса)
    const parenMatch = cleaned.match(/\(([^)]+)\)/);
    if (parenMatch) {
        const inner = parenMatch[1].trim();
        if (inner.length > 3 && !/^\d+$/.test(inner) && !/кв|эт|под|моб|д\/ф/i.test(inner)) {
            const houseMatch = normalized.match(/(\d+[а-яіє]*)\s*$/i);
            const house = houseMatch ? ` ${houseMatch[1]}` : '';
            strategies.push({ query: `${cp}${inner}${house}`, label: 'paren-alt-name' });
            // С префиксом типа улицы
            strategies.push({ query: `${cp}вулиця ${inner}${house}`, label: 'paren-alt-vucl' });
        }
    }

    // Дедуплицируем стратегии по запросу
    const seen = new Set();
    return strategies.filter(s => {
        if (s.query.length <= 6 || seen.has(s.query)) return false;
        seen.add(s.query);
        return true;
    });
}

// ============================================================
// ПАКЕТНОЕ РАСШИРЕННОЕ ГЕОКОДИРОВАНИЕ
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
    // v39.1: Передаём hubAnchor в геокодирование каждого заказа
    const geoOptionsWithHub = { ...geoOptions, hubAnchor };
    const CHUNK_SIZE = 5; // Reduced to prevent OOM on Render

    if (hubAnchor?.lat && hubAnchor?.lng && (!kmlZones || kmlZones.length === 0)) {
        logger.info(`[GeoEnhanced]  Hub-anchor guard ACTIVE: All geocoded points must be within 15km of hub (${hubAnchor.lat.toFixed(4)},${hubAnchor.lng.toFixed(4)})`);
    }

    // Собираем все координаты дивизиона для обнаружения аномалий (начинается пустым, заполняется динамически)
    const divisionCoords = orders
        .filter(o => o.coords?.lat && o.coords?.lng)
        .map(o => ({ lat: o.coords.lat, lng: o.coords.lng }));

    const results = new Map(); // address → результат
    let processed = 0;
    const totalToGeo = orders.length;

    // ПРОХОД 1: Параллельные чанки — быстрая первая попытка
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
                    divisionCoords.push({ lat: result.latitude, lng: result.longitude }); // Возвращаем для обнаружения аномалий
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

    // Собираем неудачные
    const failed = orders.filter(o => !o.coords?.lat && (o.address || o.addressGeo));
    logger.info(`[GeoEnhanced] PASS 1 done. Success: ${totalToGeo - failed.length}/${totalToGeo}. Failed: ${failed.length}`);

    if (failed.length === 0) return results;

    // ПРОХОД 2: Расширенный повтор для каждой неудачи индивидуально (последовательно, чтобы избежать лимитов запросов)
    logger.info(`[GeoEnhanced] PASS 2: Enhanced retry for ${failed.length} failures...`);
    for (let i = 0; i < failed.length; i += 3) {
        const chunk = failed.slice(i, i + 3);
        await Promise.all(chunk.map(async (order) => {
            const addr = order.address || order.addressGeo || '';
            const expectedZone = String(order.deliveryZone || order.kmlZone || '').trim();

        try {
            if (i > 0) await new Promise(r => setTimeout(r, 500)); 
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
        }));
    }

    const finalFailed2 = orders.filter(o => !o.coords?.lat && (o.address || o.addressGeo));
    logger.info(`[GeoEnhanced] PASS 2 done. Still failed: ${finalFailed2.length}/${failed.length}`);

    if (finalFailed2.length === 0) return results;

    // ----------------------------------------
    // ПРОХОД 3: Глубокая очистка — удаление шума квартир/этажей/подъездов
    // Многие украинские адреса содержат комментарии типа "кв. 4, домофон 123, под. 2"
    // Эти комментарии сбивают геокодеры, делающие точное совпадение. Удаляем и пробуем снова.
    // ----------------------------------------
    logger.info(`[GeoEnhanced] PASS 3: Deep-clean retry for ${finalFailed2.length} addresses...`);

    // Регулярка, удаляющая всё после маркеров квартиры
    const APT_NOISE_RE = /[,\s]+(?:кв\.?|квар|апарт|кімн|apartment|кв|ap\.?)\s*[\d/a-zа-яієґ]+.*/gi;
    const FLOOR_NOISE_RE = /[,\s]+(?:поверх|пов\.?|эт\.?|этаж|floor)\s*\d+.*/gi;
    const ENTRANCE_NOISE_RE = /[,\s]+(?:підʼїзд|подъезд|под\.?|entrance)\s*\d+.*/gi;
    const COMMENT_NOISE_RE = /[,\s]+(?:домофон|домоф|tel|тел|код|pin|ключ|call|звонить|звонок|дзвінок).*/gi;

    for (let i = 0; i < finalFailed2.length; i += 3) {
        const chunk = finalFailed2.slice(i, i + 3);
        await Promise.all(chunk.map(async (order) => {
            const rawAddr = order.address || order.addressGeo || '';
            if (!rawAddr) return;
            // Глубокая очистка: удаляем комментарии квартиры/этажа/подъезда
            let deepCleaned = rawAddr
                .replace(APT_NOISE_RE, '')
                .replace(FLOOR_NOISE_RE, '')
                .replace(ENTRANCE_NOISE_RE, '')
                .replace(COMMENT_NOISE_RE, '')
                .replace(/\s{2,}/g, ' ')
                .trim();

            if (deepCleaned.toLowerCase() === deepCleanAddress(rawAddr).toLowerCase()) {
                // Нет значимых изменений — пропускаем, чтобы избежать идентичного повтора
                return;
            }

            const expectedZone = String(order.deliveryZone || order.kmlZone || '').trim();
            try {
                const result = await enhancedGeocode(deepCleaned, city, expectedZone || null, kmlZones, divisionCoords, geoOptionsWithHub);
                if (result) {
                    order.coords = { lat: result.latitude, lng: result.longitude };
                    order._geoProvider = result.provider;
                    order._geoFailed = false;
                    order._deepCleaned = true;
                    divisionCoords.push({ lat: result.latitude, lng: result.longitude });
                    results.set(rawAddr, result);
                    logger.info(`[GeoEnhanced] PASS 3 recovered (deep-clean): ${rawAddr} → ${deepCleaned}`);
                }
            } catch (e) { /* ignore */ }
        }));
    }

    const finalFailed3 = orders.filter(o => !o.coords?.lat && (o.address || o.addressGeo));
    logger.info(`[GeoEnhanced] PASS 3 done. Still failed: ${finalFailed3.length}`);

    if (finalFailed3.length === 0) return results;

    // ----------------------------------------
    // ПРОХОД 4: Геокодирование без KML — находим координату, затем проверяем зону
    // Если координата найдена, но снаружи зон → помечаем _kmlRejected=true (действенный диагностический признак)
    // Если координата не найдена вообще → помечаем _geoFailed=true (адрес неизвестен)
    // Это разделяет "неправильное название улицы" от "правильная улица, но не та зона" в интерфейсе.
    // ----------------------------------------
    logger.info(`[GeoEnhanced] PASS 4: No-KML diagnostic geocode for ${finalFailed3.length} addresses...`);

    for (let i = 0; i < finalFailed3.length; i += 3) {
        const chunk = finalFailed3.slice(i, i + 3);
        await Promise.all(chunk.map(async (order) => {
            const addr = order.address || order.addressGeo || '';
            if (!addr) return;
            const expectedZone = String(order.deliveryZone || order.kmlZone || '').trim();
            try {
                // Геокодируем БЕЗ фильтра KML зон, чтобы проверить, находится ли адрес вообще
                const result = await enhancedGeocode(addr, city, expectedZone || null, /* no kml zones */ [], divisionCoords, {
                    ...geoOptionsWithHub,
                    hubAnchor: null  // Также пропускаем защиту хаб-якоря, чтобы увидеть, что говорят геокодеры
                });
                if (result) {
                    // Адрес НАЙДЕН — проверяем, внутри ли он активных зон
                    let isInsideZone = kmlZones.length === 0; // Если зоны не настроены, всегда принимаем
                    if (!isInsideZone) {
                        const KmlService = require('../src/services/KmlService');
                        for (const zone of kmlZones) {
                            const polygon = zone.boundary?.coordinates?.[0] || zone.coordinates;
                            if (polygon && KmlService._isPointInPolygon(result.latitude, result.longitude, polygon)) {
                                isInsideZone = true;
                                break;
                            }
                        }
                    }

                    if (isInsideZone) {
                        // Прошёл! Используем (геокодеры, вероятно, были строже раньше)
                        order.coords = { lat: result.latitude, lng: result.longitude };
                        order._geoProvider = result.provider;
                        order._geoFailed = false;
                        divisionCoords.push({ lat: result.latitude, lng: result.longitude });
                        results.set(addr, result);
                        logger.info(`[GeoEnhanced] PASS 4 recovered (zone check passed): ${addr}`);
                    } else {
                        // Найдено, но вне зоны — диагностический флаг
                        order._kmlRejected = true;
                        order._kmlRejectedCoords = { lat: result.latitude, lng: result.longitude };
                        order._kmlRejectedReason = `Address geocoded to (${result.latitude.toFixed(4)},${result.longitude.toFixed(4)}) but is outside all active KML zones`;
                        logger.warn(`[GeoEnhanced] PASS 4 KML_REJECTED: ${addr} → (${result.latitude.toFixed(4)},${result.longitude.toFixed(4)}) is OUTSIDE active zones`);
                    }
                } else {
                    // Принципиально неразрешимо — помечаем для ручного исправления
                    order._geoFailed = true;
                    order._geoFailedReason = 'address_not_found';
                }
            } catch (e) { /* ignore */ }
        }));
    }

    const finalFailed4 = orders.filter(o => !o.coords?.lat && (o.address || o.addressGeo));
    const kmlRejected = orders.filter(o => o._kmlRejected).length;
    logger.info(`[GeoEnhanced] PASS 4 done. KML-rejected: ${kmlRejected}, truly unfound: ${finalFailed4.length - kmlRejected}. Total remaining without coords: ${finalFailed4.length}`);

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
