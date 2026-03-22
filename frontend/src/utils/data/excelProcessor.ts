import { ProcessedExcelData } from '../../types';

export type { ProcessedExcelData };
export const hashString = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
    }
    return hash;
};

export const processExcelFile = async (file: File): Promise<ProcessedExcelData> => {
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.csv')) {
        return processCsvFile(file);
    } else {
        return processExcelFileInternal(file);
    }
}

// Обработка CSV файлов
const processCsvFile = async (file: File): Promise<ProcessedExcelData> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const csvText = e.target?.result as string;
                if (!csvText) {
                    throw new Error('Не удалось прочитать CSV файл');
                }
                const lines = csvText.split('\n').filter(line => line.trim());
                if (lines.length < 2) {
                    throw new Error('CSV файл должен содержать заголовки и данные');
                }
                const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
                const rows = lines.slice(1).map(line => {
                    const cells = line.split(',').map(cell => cell.trim().replace(/"/g, ''));
                    return cells;
                });
                const jsonData = [headers, ...rows];
                const result = processJsonData(jsonData);
                resolve(result);
            } catch (error) {
                console.error('Ошибка обработки CSV файла:', error);
                reject(error);
            }
        };
        reader.onerror = () => {
            reject(new Error('Ошибка чтения CSV файла'));
        };
        reader.readAsText(file);
    });
}

// Обработка Excel файлов
const processExcelFileInternal = async (file: File): Promise<ProcessedExcelData> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                if (!data) {
                    throw new Error('Не удалось прочитать файл');
                }
                const arrayBuffer = data as ArrayBuffer;
                import('xlsx').then(XLSX => {
                    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                    const sheetNames = workbook.SheetNames;
                    if (sheetNames.length === 0) {
                        return reject(new Error('В файле нет листов'));
                    }
                    const firstSheetName = sheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
                    if (jsonData.length < 2) {
                        return reject(new Error('Файл должен содержать заголовки и данные'));
                    }
                    const result = processJsonData(jsonData);
                    resolve(result);
                }).catch(error => {
                    console.error('Ошибка загрузки библиотеки xlsx:', error);
                    reject(new Error('Не удалось загрузить библиотеку для чтения Excel'));
                });
            } catch (error) {
                console.error('Ошибка обработки Excel файла:', error);
                reject(error);
            }
        };
        reader.onerror = () => {
            reject(new Error('Ошибка чтения файла'));
        };
        reader.readAsArrayBuffer(file);
    });
}

// Вспомогательные функции для обработки данных
const getValue = (rowData: Record<string, any>, fields: string[]): string => {
    const lowerRowData = Object.keys(rowData).reduce((acc, key) => {
        acc[key.toLowerCase()] = rowData[key];
        return acc;
    }, {} as Record<string, any>);
    for (const field of fields) {
        const value = lowerRowData[field.toLowerCase()];
        if (value !== undefined && value !== null && value !== '') {
            return String(value).trim();
        }
    }
    return '';
};

const hasValue = (rowData: Record<string, any>, fields: string[]): boolean => {
    const lowerRowData = Object.keys(rowData).reduce((acc, key) => {
        acc[key.toLowerCase()] = rowData[key];
        return acc;
    }, {} as Record<string, any>);
    return fields.some(field => {
        const value = lowerRowData[field.toLowerCase()];
        return value !== undefined && value !== null && value !== '';
    });
};

const isOrderRow = (rowData: Record<string, any>): boolean => {
    const hasOrderNumber = hasValue(rowData, ['номер', 'number', 'orderNumber', 'order_number', 'номер_заказа', '№', 'id']);
    const hasAddress = hasValue(rowData, ['адрес', 'address', 'адрес_доставки', 'адресс', 'куда', 'улица', 'street', 'delivery']);
    const hasAmount = hasValue(rowData, ['сумма', 'amount', 'цена', 'price', 'стоимость', 'total', 'к оплате']);
    return (hasOrderNumber || hasAddress) && (hasAmount || hasAddress);
};

const isCourierRow = (rowData: Record<string, any>): boolean => {
    const hasName = hasValue(rowData, ['имя', 'name', 'курьер', 'courier', 'курьер_имя', 'courier_name']);
    const hasPhone = hasValue(rowData, ['телефон', 'phone', 'телефон_курьера', 'courier_phone']);
    return hasName && hasPhone && !isOrderRow(rowData);
};

const isPaymentMethodRow = (rowData: Record<string, any>): boolean => {
    const hasPaymentType = hasValue(rowData, ['оплата', 'payment', 'способ', 'метод_оплаты', 'payment_method']);
    return hasPaymentType && !isOrderRow(rowData) && !isCourierRow(rowData);
};

const findOrderNumber = (rowData: Record<string, any>): string | null => {
    for (const key in rowData) {
        const value = rowData[key];
        if (typeof value === 'string' && /^\d{7,8}$/.test(value)) {
            return value;
        }
        if (typeof value === 'number' && value >= 1000000 && value <= 99999999) {
            return String(value);
        }
    }
    return null;
};

const createRowData = (row: any[], headers: string[]): Record<string, any> => {
    const rowData: Record<string, any> = {};
    headers.forEach((header, index) => {
        if (header && row[index] !== undefined) {
            const value = row[index];
            rowData[header] = value;
            if (header.includes('.')) {
                const parts = header.split('.');
                if (parts.length === 2) {
                    const subHeader = parts[1].trim();
                    rowData[header] = value;
                    if (subHeader && !rowData[subHeader]) {
                        rowData[subHeader] = value;
                    }
                }
            }
            const normalizedHeader = header.toLowerCase().trim();
            if (normalizedHeader && normalizedHeader !== header.toLowerCase()) {
                if (!rowData[normalizedHeader]) {
                    rowData[normalizedHeader] = value;
                }
            }
        }
    });
    return rowData;
};

const createCourier = (rowData: Record<string, any>, index: number): any => {
    return {
        id: `courier_${Date.now()}_${index}`,
        name: getValue(rowData, ['имя', 'name', 'курьер', 'courier']) || '',
        phone: getValue(rowData, ['телефон', 'phone']) || '',
        email: getValue(rowData, ['email', 'почта']) || '',
        vehicleType: getValue(rowData, ['транспорт', 'vehicle', 'тип']) || 'car',
        isActive: true
    };
};

const createPaymentMethod = (rowData: Record<string, any>, index: number): any => {
    return {
        id: `payment_${Date.now()}_${index}`,
        name: getValue(rowData, ['название', 'name', 'оплата', 'payment']) || '',
        type: getValue(rowData, ['тип', 'type']) || 'card',
        isActive: true
    };
};

export const parseAddressGeo = (str: string): { lat?: number; lng?: number; address?: string } => {
    if (!str) return {};
    const res: any = {};
    
    // Format 1: XML-like (Lat="...", Long="...")
    const latMatch = str.match(/Lat=["']?([^"'\s>]+)["']?/i);
    const lngMatch = str.match(/Long=["']?([^"'\s>]+)["']?/i);
    const addrMatch = str.match(/AddressStr=["']?([^"'>]+)["']?/i);

    if (latMatch) {
        const lat = parseFloat(latMatch[1]);
        if (!isNaN(lat)) res.lat = lat;
    }
    if (lngMatch) {
        const lng = parseFloat(lngMatch[1]);
        if (!isNaN(lng)) res.lng = lng;
    }
    if (addrMatch) res.address = addrMatch[1].trim();

    // Format 2: Plain text (Широта: ..., Долгота: ... or Latitude: ..., Longitude: ...)
    if (!res.lat || !res.lng) {
        const latTextMatch = str.match(/(?:Широта|Latitude|Lat)[:\s]+([-+]?\d+\.\d+)/i);
        const lngTextMatch = str.match(/(?:Долгота|Longitude|Long|Lng)[:\s]+([-+]?\d+\.\d+)/i);
        
        if (latTextMatch) {
            const lat = parseFloat(latTextMatch[1]);
            if (!isNaN(lat)) res.lat = lat;
        }
        if (lngTextMatch) {
            const lng = parseFloat(lngTextMatch[1]);
            if (!isNaN(lng)) res.lng = lng;
        }
    }

    // Format 3: comma separated (50.45, 30.52)
    if (!res.lat || !res.lng) {
        const pairMatch = str.match(/^\s*([-+]?\d+\.\d+)\s*,\s*([-+]?\d+\.\d+)\s*$/);
        if (pairMatch) {
            res.lat = parseFloat(pairMatch[1]);
            res.lng = parseFloat(pairMatch[2]);
        }
    }

    return res;
};

/**
 * v36.2: Universal Geodata Enricher
 * Extracts coordinates from addressGeo/address_geo/etc. even for raw server data.
 */
export const enrichOrderGeodata = (order: any): any => {
    if (!order) return order;
    
    // Skip if already has deep coords and is locked
    if (order.coords?.lat && order.coords?.lng && order.isAddressLocked) return order;

    const geoRaw = order.addressGeo || order.address_geo || order.coords || 
                   order['координаты'] || order['широта/долгота'] || order['lat/lng'] || 
                   order.location || order.point;

    if (geoRaw) {
        const geoData = parseAddressGeo(String(geoRaw));
        if (geoData.lat && geoData.lng) {
            return {
                ...order,
                coords: { lat: geoData.lat, lng: geoData.lng },
                latitude: geoData.lat,
                longitude: geoData.lng,
                isAddressLocked: true,
                addressGeoStr: geoData.address || order.addressGeoStr || String(geoRaw)
            };
        }
    }
    return order;
};

const createOrderFromData = (rowData: Record<string, any>, orderNumber: string, index: number): any => {
    let address = getValue(rowData, [
        'адрес', 'address', 'адрес_доставки', 'адресс', 'address_delivery',
        'адрес доставки', 'delivery_address', 'адреса', 'адреса доставки', 'адреса_доставки',
        'addressStr', 'address_str'
    ]);

    const addressGeoRaw = getValue(rowData, ['addressGeo', 'address_geo', 'координаты', 'coords', 'geo', 'широта/долгота', 'lat/lng', 'location', 'point']);
    const geoData = addressGeoRaw ? parseAddressGeo(String(addressGeoRaw)) : {};

    // v35.9.40: Always prioritize addressGeo string if available
    if (geoData.address) {
        address = geoData.address;
    }

    const excludeCols = [
        'заказчик', 'customer', 'клиент', 'client', 'имя', 'name', 'способ оплаты', 'payment',
        'оплата', 'payment_method', 'комментарий', 'comment', 'примечание', 'note', 'состояние',
        'status', 'статус', 'state', 'номер', 'number', 'order', 'заказ', 'телефон', 'phone',
        'тел', 'тип заказа', 'order_type', 'type', 'дата', 'date', 'время', 'time', 'зона доставки',
        'delivery_zone', 'zone'
    ];

    const isValidAddress = (str: string, columnName?: string): boolean => {
        if (!str || str.trim().length < 3) return false;
        const lowerStr = str.toLowerCase().trim();
        const lowerColName = (columnName || '').toLowerCase().trim();

        const isExplicitAddressColumn = lowerColName && (
            lowerColName.includes('address') || lowerColName.includes('адрес') ||
            lowerColName.includes('addr') || lowerColName.includes('куда') ||
            lowerColName.includes('доставка') || lowerColName.includes('delivery') ||
            lowerColName.includes('улица') || lowerColName.includes('street') ||
            lowerColName.includes('место') || lowerColName.includes('location') ||
            lowerColName.includes('пункт') || lowerColName.includes('point')
        );

        if (!isExplicitAddressColumn && excludeCols.some(excl => lowerColName.includes(excl))) {
            return false;
        }

        const invalidPatterns = [
            /зателефонувати|зателефоновать|позвонить|call|звон/i,
            /хвилин|минут|minutes/i,
            /до доставки|перед доставкой|before delivery/i,
            /примітка|примечание|note|комментарий|коментар/i,
            /инструкция|інструкція|instruction/i,
            /упаковка|packaging/i,
            /коментар|комментарий|comment/i,
            /примечание|примітка|note/i,
            /безготівка|безготівка_|наличные|нал|card|карта|payment|оплата/i,
            /qr|мульті|мульти|multi/i,
            /glovo:|code:|delivery|доставка курьером/i,
            /^\d{7,8}$/,
            /^[а-яёіїє]{2,20}\s+[а-яёіїє]{2,20}$/i,
            /^[a-z]{2,20}\s+[a-z]{2,20}$/i,
            /^зона\s+\d+/i,
            /исполнен|доставляется|в обработке/i,
            /^[а-яёіїєa-z]{3,15}\s+\d{1,2}[\.\/]\d{1,2}[\.\/]\d{2,4}/i,
            /^[а-яёіїєa-z]{3,15}\s+\d{1,2}[\.\/]\d{1,2}\s+[а-яёіїєa-z]{2,5}$/i,
            /контроль|шеф|дн$/i,
            /^[а-яёіїєa-z]{3,20}$/i
        ];

        for (const pattern of invalidPatterns) {
            if (pattern.test(lowerStr)) {
                return false;
            }
        }

        const addressMarkers = [
            /\b(вул|вулиця|улица|ул\.?|проспект|просп\.?|провулок|пров\.?|бульвар|бул\.?|линия|лінія|лін|площа|площадь|пл\.?|пер\.?|переулок|str|street)\b/i,
            /\b\d+[а-яa-z]?[,\s]/,
            /\b\d+[а-яa-z]?$/,
            /\b(киев|київ|kiev|kyiv|одесса|одеса|харьков|харків|полтава|украина|ukraine)\b/i,
            /\b(под\.?|подъезд|під\.?|під'їзд|д\/ф|д\.ф|кв\.?|квартира|эт\.?|этаж|етаж|floor|л\/с|л\.с|кл|apartment|habteka)\b/i
        ];

        const hasAddressMarker = addressMarkers.some(pattern => pattern.test(lowerStr));
        const isNotPhone = !/^[\d\+\-\(\)\s]+$/.test(str);
        const isNotEmail = !/^[\w\.-]+@[\w\.-]+\.\w+$/.test(str);
        const isNotOnlyNumber = !/^\d+$/.test(str);
        const hasText = str.length > 2 && /[а-яА-ЯёЁіІїЇєЄa-zA-Z]/.test(str);
        const hasNumber = /\d/.test(str);

        if (isExplicitAddressColumn && hasText) {
            if (isNotPhone && isNotEmail && isNotOnlyNumber) {
                return true;
            }
        }
        return hasAddressMarker && isNotPhone && isNotEmail && isNotOnlyNumber && hasText && hasNumber;
    };

    if (address && !isValidAddress(address, 'адрес')) {
        address = '';
    }

    if (!address || !isValidAddress(address, 'адрес')) {
        address = '';
        for (const key in rowData) {
            const lowerKey = key.toLowerCase().trim();
            if (excludeCols.some(excl => lowerKey.includes(excl))) {
                continue;
            }
            const value = rowData[key];
            if (value && typeof value === 'string' && String(value).trim() !== orderNumber) {
                const strVal = String(value).trim();
                if (isValidAddress(strVal, key)) {
                    address = strVal;
                    break;
                }
            }
        }
    }

    const getFieldByKeywords = (keywords: string[], _fieldName: string): string => {
        for (const key in rowData) {
            const lowerKey = key.toLowerCase().trim();
            for (const keyword of keywords) {
                const lowerKeyword = keyword.toLowerCase();
                if (lowerKey === lowerKeyword || lowerKey.includes(lowerKeyword)) {
                    const value = rowData[key];
                    if (value !== undefined && value !== null && String(value).trim() !== '') {
                        return String(value).trim();
                    }
                }
            }
        }
        return '';
    };

    const status = getFieldByKeywords([
        'состояние', 'status', 'статус', 'state', 'статус заказа', 'состояние заказа'
    ], 'состояние');

    const kitchenTime = getFieldByKeywords([
        'время на кухню', 'время_на_кухню', 'временакухню', 'времянакухню', 'kitchen time',
        'kitchen_time', 'kitchentime', 'time to kitchen', 'время готовности', 'время_готовности',
        'времяготовки', 'ready time', 'ready_time', 'readytime'
    ], 'время на кухню');

    const plannedTime = getFieldByKeywords([
        'плановое время', 'плановое_время', 'плановоевремя', 'planned time', 'planned_time',
        'plannedtime', 'время доставки', 'время_доставки', 'времядодоставки', 'delivery time',
        'delivery_time', 'deliverytime', 'дедлайн', 'deadline', 'deadline_time'
    ], 'плановое время');

    // v38.2: Stable ID generation (orderNumber + fallback hash)
    const stableId = orderNumber || `gen_${Math.abs(hashString(address || ''))}_${index}`;

    return enrichOrderGeodata({
        id: stableId,
        orderNumber,
        address: String(address || '').trim(),
        status: status,
        kitchenTime: kitchenTime,
        plannedTime: plannedTime,
        courier: getValue(rowData, ['курьер', 'courier', 'курьер_имя']) || '',
        amount: parseFloat(getValue(rowData, ['сумма', 'amount', 'цена', 'price', 'стоимость'])) || 0,
        phone: getValue(rowData, ['телефон', 'phone', 'телефон_клиента']) || '',
        customerName: getValue(rowData, ['клиент', 'customer', 'имя_клиента', 'имя']) || '',
        isSelected: false,
        isInRoute: false,
        ...rowData
    });
};

const createOrder = (rowData: Record<string, any>, index: number): any => {
    return createOrderFromData(rowData, getValue(rowData, ['номер', 'number', 'orderNumber']) || `ORD-${index + 1}`, index);
};

export const processJsonData = (jsonData: any[][]): ProcessedExcelData => {
    let headerRowIndex = 0;
    let headers: string[] = [];
    let subHeaderRowIndex = -1;
    let subHeaders: string[] = [];

    // Поиск заголовков
    for (let i = 0; i < Math.min(10, jsonData.length); i++) {
        const row = jsonData[i] as any[];
        const rowStr = row.map(c => String(c || '').toLowerCase()).join('|');
        const nonEmptyCells = row.filter(c => c !== null && c !== undefined && String(c).trim() !== '');

        if (nonEmptyCells.length < 3) continue;

        if (rowStr.includes('адрес') || rowStr.includes('address') || rowStr.includes('номер') ||
            rowStr.includes('number') || rowStr.includes('телефон') || rowStr.includes('phone') ||
            rowStr.includes('время') || rowStr.includes('time') || rowStr.includes('заказ') ||
            rowStr.includes('order')) {

            headerRowIndex = i;
            headers = row.map(c => String(c || '').trim());

            // Проверка подзаголовков
            const hasDateHeader = headers.some(h => {
                const lower = String(h || '').toLowerCase().trim();
                return lower === 'дата' || lower === 'date';
            });

            if (hasDateHeader && i + 1 < jsonData.length) {
                const nextRow = jsonData[i + 1] as any[];
                const nextRowStr = nextRow.map(c => String(c || '').toLowerCase()).join('|');
                if (nextRowStr.includes('время на кухню') || nextRowStr.includes('kitchen') ||
                    nextRowStr.includes('доставить к') || nextRowStr.includes('deliver') ||
                    nextRowStr.includes('плановое') || nextRowStr.includes('planned')) {
                    subHeaderRowIndex = i + 1;
                    subHeaders = nextRow.map(c => String(c || '').trim());
                }
            }
            break;
        }
    }

    if (headers.length === 0) {
        headers = (jsonData[0] || []).map(c => String(c || '').trim());
    }

    // Объединение заголовков с подзаголовками
    if (subHeaders.length > 0 && headers.length > 0) {
        const mergedHeaders: string[] = [];
        const maxLength = Math.max(headers.length, subHeaders.length);
        let dateHeaderIndex = -1;

        for (let i = 0; i < headers.length; i++) {
            const h = String(headers[i] || '').toLowerCase().trim();
            if (h === 'дата' || h === 'date') {
                dateHeaderIndex = i;
                break;
            }
        }

        for (let i = 0; i < maxLength; i++) {
            const mainHeader = headers[i] || '';
            const subHeader = subHeaders[i] || '';
            const isInDateRange = dateHeaderIndex >= 0 && i >= dateHeaderIndex && i < dateHeaderIndex + 4;

            if (isInDateRange && subHeader) {
                const dateHeaderName = headers[dateHeaderIndex] || 'Дата';
                mergedHeaders.push(`${dateHeaderName}.${subHeader}`);
            } else if (mainHeader && !isInDateRange) {
                mergedHeaders.push(mainHeader);
            } else if (subHeader && !isInDateRange) {
                mergedHeaders.push(subHeader);
            } else if (isInDateRange && !subHeader) {
                if (i === dateHeaderIndex) {
                    mergedHeaders.push(headers[dateHeaderIndex] || 'Дата');
                } else {
                    mergedHeaders.push('');
                }
            } else {
                mergedHeaders.push('');
            }
        }
        if (mergedHeaders.length > 0) {
            headers = mergedHeaders;
        }
    }

    const dataStartRow = subHeaderRowIndex >= 0 ? subHeaderRowIndex + 1 : headerRowIndex + 1;
    const rows = jsonData.slice(dataStartRow) as any[][];

    const orders: any[] = [];
    const couriers: any[] = [];
    const paymentMethods: any[] = [];
    const errors: any[] = [];

    rows.forEach((row, index) => {
        try {
            if (!row || row.length === 0 || row.every(cell => !cell || String(cell).trim() === '')) {
                return;
            }

            const rowData = createRowData(row, headers);

            // Заказ
            const orderNumber = findOrderNumber(rowData);
            if (orderNumber) {
                orders.push(createOrderFromData(rowData, orderNumber, index));
                return;
            }

            if (isOrderRow(rowData)) {
                orders.push(createOrder(rowData, index));
            } else if (isCourierRow(rowData)) {
                couriers.push(createCourier(rowData, index));
            } else if (isPaymentMethodRow(rowData)) {
                paymentMethods.push(createPaymentMethod(rowData, index));
            } else {
                // Если не удалось определить, но есть адрес - создаем как заказ
                let address = getValue(rowData, ['адрес', 'address']);
                if (address && address.length > 5) {
                    const orderNumber = getValue(rowData, ['номер', 'number', 'orderNumber']) || `ORD-${index + 1}`;
                    orders.push(createOrderFromData(rowData, orderNumber, index));
                } else {
                    errors.push({
                        row: index + 2,
                        message: `Не удалось определить тип записи и не найден адрес`,
                        data: row
                    });
                }
            }
        } catch (error) {
            errors.push({
                row: index + 2,
                message: `Ошибка обработки строки: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
                data: row
            });
        }
    });

    return {
        orders,
        couriers,
        paymentMethods,
        routes: [],
        errors,
        summary: {
            totalRows: rows.length,
            successfulGeocoding: 0,
            failedGeocoding: 0,
            orders: orders.length,
            couriers: couriers.length,
            paymentMethods: paymentMethods.length,
            errors: errors.map(error => typeof error === 'string' ? error : error.message)
        }
    };
}

