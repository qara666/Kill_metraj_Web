import * as XLSX from 'xlsx'

export interface ProcessedExcelData {
    orders: any[]
    couriers: any[]
    paymentMethods: any[]
    routes: any[]
    errors: any[]
    summary: {
        totalRows: number
        successfulGeocoding: number
        failedGeocoding: number
        orders: number
        couriers: number
        paymentMethods: number
        errors: any[]
    }
}

export const processExcelFile = async (file: File, autoPlan: boolean = false): Promise<ProcessedExcelData> => {
    // Новый аргумент для активации автопланирования
    const autoPlanRoutes = (data: any) => {
        // Логика автопланирования маршрутов
        console.log('Автопланирование маршрутов на основе данных:', data);
        // Добавьте логику здесь для автопланирования
    };
    const fileName = file.name.toLowerCase()

    if (fileName.endsWith('.csv')) {
        return processCsvFile(file)
    } else {
        return processExcelFileInternal(file)
    }
}

// Обработка CSV файлов
const processCsvFile = async (file: File): Promise<ProcessedExcelData> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()

        reader.onload = (e) => {
            try {
                const csvText = e.target?.result as string
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
                console.error('Ошибка обработки Excel файла:', error);
                reject(error);
            }
        }

        reader.onerror = () => {
            reject(new Error('Ошибка чтения CSV файла'));
        }

        reader.readAsText(file);
    });
}

// Обработка Excel файлов
const processExcelFileInternal = async (file: File): Promise<ProcessedExcelData> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader()

        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                if (!data) {
                    throw new Error('Не удалось прочитать файл');
                }

                const arrayBuffer = data as ArrayBuffer;
                const workbook = XLSX.read(arrayBuffer, { type: 'array' });
                const sheetNames = workbook.SheetNames;

                if (sheetNames.length === 0) {
                    throw new Error('В файле нет листов');
                }

                const firstSheetName = sheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

                if (jsonData.length < 2) {
                    throw new Error('Файл должен содержать заголовки и данные');
                }

                const result = processJsonData(jsonData);
                resolve(result);
            } catch (error) {
                console.error('Ошибка обработки Excel файла:', error);
                reject(error);
            }
        }

        reader.onerror = () => {
            reject(new Error('Ошибка чтения файла'));
        }

        reader.readAsArrayBuffer(file);
    });
}

export const processJsonData = (jsonData: any[][]): ProcessedExcelData => {
    const orders: any[] = []
    const couriers: string[] = []
    const paymentMethods: string[] = []
    const errors: any[] = []

    if (!jsonData || jsonData.length < 2) {
        return {
            orders: [],
            couriers: [],
            paymentMethods: [],
            routes: [],
            errors: [{ message: 'Недостаточно данных в файле' }],
            summary: {
                totalRows: jsonData?.length || 0,
                successfulGeocoding: 0,
                failedGeocoding: 0,
                orders: 0,
                couriers: 0,
                paymentMethods: 0,
                errors: [{ message: 'Недостаточно данных в файле' }]
            }
        }
    }

    // Находим строку с заголовками (ищем первую строку с текстовыми значениями)
    let headerRowIndex = 0
    let headers: string[] = []
    
    for (let i = 0; i < Math.min(5, jsonData.length); i++) {
        const row = jsonData[i]
        if (Array.isArray(row) && row.length > 0) {
            const hasTextHeaders = row.some((cell: any) => {
                const str = String(cell || '').trim().toLowerCase()
                return str.length > 0 && (
                    str.includes('номер') || str.includes('адрес') || str.includes('телефон') ||
                    str.includes('order') || str.includes('address') || str.includes('phone') ||
                    str.includes('заказ') || str.includes('курьер') || str.includes('courier')
                )
            })
            if (hasTextHeaders) {
                headerRowIndex = i
                headers = row.map((cell: any) => String(cell || '').trim())
                break
            }
        }
    }

    // Если заголовки не найдены, используем первую строку
    if (headers.length === 0 && jsonData.length > 0) {
        headers = jsonData[0].map((cell: any) => String(cell || '').trim())
    }

    // Функция для поиска индекса колонки по названию (регистронезависимо)
    const findColumnIndex = (searchTerms: string[]): number => {
        for (const term of searchTerms) {
            const lowerTerm = term.toLowerCase()
            for (let i = 0; i < headers.length; i++) {
                const header = String(headers[i] || '').toLowerCase()
                if (header.includes(lowerTerm) || lowerTerm.includes(header)) {
                    return i
                }
            }
        }
        return -1
    }

    // Находим индексы колонок
    const orderNumberIdx = findColumnIndex(['номер', 'заказ', 'order', 'order number', 'order_number', '№'])
    const addressIdx = findColumnIndex(['адрес', 'address', 'адреса', 'адреса доставки'])
    const phoneIdx = findColumnIndex(['телефон', 'phone', 'тел', 'телефон клиента'])
    const customerNameIdx = findColumnIndex(['клиент', 'имя', 'customer', 'name', 'фио', 'покупатель'])
    const kitchenTimeIdx = findColumnIndex(['время на кухню', 'kitchen time', 'kitchen_time', 'время готовности'])
    const deliveryTimeIdx = findColumnIndex(['доставить к', 'delivery time', 'delivery_time', 'плановое время', 'planned time'])
    const amountIdx = findColumnIndex(['сумма', 'amount', 'стоимость', 'price', 'цена'])
    const paymentMethodIdx = findColumnIndex(['оплата', 'payment', 'способ оплаты', 'payment method'])
    const courierIdx = findColumnIndex(['курьер', 'courier', 'доставщик', 'delivery'])

    // Функция для определения адреса (поиск по эвристикам)
    const isLikelyAddress = (value: any): boolean => {
        if (typeof value !== 'string') return false
        const v = value.trim().toLowerCase()
        if (v.length < 5) return false
        return /[a-zа-яіїє]/i.test(v) && (
            v.includes('ул') || v.includes('вул') || v.includes('пр') || v.includes('просп') || v.includes('str') ||
            v.includes('улица') || v.includes('street') || v.includes('проспект') || v.includes('пл') || v.includes('площад')
        )
    }

    const extractAddress = (row: any[]): string => {
        // Сначала проверяем найденный индекс адреса
        if (addressIdx >= 0 && addressIdx < row.length) {
            const addr = String(row[addressIdx] || '').trim()
            if (isLikelyAddress(addr)) return addr
        }
        
        // Ищем адрес по эвристикам (приоритет колонка H - индекс 7)
        const candidatesIdx = [7, 6, 8, 5, 9, 4]
        for (const idx of candidatesIdx) {
            if (idx < row.length) {
                const cand = String(row[idx] || '').trim()
                if (isLikelyAddress(cand)) return cand
            }
        }
        
        // Перебор всей строки
        for (let i = 0; i < row.length; i++) {
            const cand = String(row[i] || '').trim()
            if (isLikelyAddress(cand)) return cand
        }
        
        // Возвращаем значение из найденного индекса или пустую строку
        return addressIdx >= 0 && addressIdx < row.length ? String(row[addressIdx] || '').trim() : ''
    }

    // Обрабатываем строки данных (начинаем после заголовков)
    for (let i = headerRowIndex + 1; i < jsonData.length; i++) {
        const row = jsonData[i]
        if (!Array.isArray(row) || row.length === 0) continue

        // Пропускаем полностью пустые строки
        const hasData = row.some((cell: any) => {
            const str = String(cell || '').trim()
            return str.length > 0
        })
        if (!hasData) continue

        try {
            // Извлекаем данные из строки
            const orderNumber = orderNumberIdx >= 0 && orderNumberIdx < row.length 
                ? String(row[orderNumberIdx] || '').trim() 
                : String(row[0] || '').trim()
            
            const address = extractAddress(row)
            
            // Пропускаем строки без адреса (номер заказа может быть пустым, но адрес обязателен)
            if (!address || address.length < 5) {
                continue
            }

            const phone = phoneIdx >= 0 && phoneIdx < row.length 
                ? String(row[phoneIdx] || '').trim() 
                : String(row[3] || '').trim()
            
            const customerName = customerNameIdx >= 0 && customerNameIdx < row.length 
                ? String(row[customerNameIdx] || '').trim() 
                : String(row[4] || '').trim()
            
            const kitchenTime = kitchenTimeIdx >= 0 && kitchenTimeIdx < row.length 
                ? row[kitchenTimeIdx] 
                : row[9]
            
            const deliveryTime = deliveryTimeIdx >= 0 && deliveryTimeIdx < row.length 
                ? String(row[deliveryTimeIdx] || '').trim() 
                : String(row[10] || '').trim()
            
            const amount = amountIdx >= 0 && amountIdx < row.length 
                ? parseFloat(String(row[amountIdx] || '0')) || 0
                : parseFloat(String(row[13] || '0')) || 0
            
            const paymentMethod = paymentMethodIdx >= 0 && paymentMethodIdx < row.length 
                ? String(row[paymentMethodIdx] || 'Неизвестно').trim() 
                : String(row[14] || 'Неизвестно').trim()
            
            const courier = courierIdx >= 0 && courierIdx < row.length 
                ? String(row[courierIdx] || 'Не назначен').trim() 
                : String(row[15] || 'Не назначен').trim()

            // Создаем объект заказа
            const order: any = {
                orderNumber,
                address,
                phone,
                customerName,
                kitchenTime,
                deliveryTime,
                amount,
                paymentMethod,
                courier,
                raw: {} // Сохраняем все данные строки в raw для дальнейшей обработки
            }

            // Сохраняем все данные строки в raw
            headers.forEach((header, idx) => {
                if (header && idx < row.length) {
                    order.raw[header] = row[idx]
                }
            })

            // Также сохраняем по индексам
            row.forEach((cell, idx) => {
                order.raw[idx] = cell
            })

            orders.push(order)

            // Собираем уникальных курьеров
            if (courier && courier !== 'Не назначен' && !couriers.includes(courier)) {
                couriers.push(courier)
            }

            // Собираем уникальные способы оплаты
            if (paymentMethod && paymentMethod !== 'Неизвестно' && !paymentMethods.includes(paymentMethod)) {
                paymentMethods.push(paymentMethod)
            }
        } catch (error) {
            errors.push({
                row: i + 1,
                error: error instanceof Error ? error.message : String(error)
            })
        }
    }

    return {
        orders,
        couriers,
        paymentMethods,
        routes: [],
        errors,
        summary: {
            totalRows: jsonData.length,
            successfulGeocoding: 0,
            failedGeocoding: 0,
            orders: orders.length,
            couriers: couriers.length,
            paymentMethods: paymentMethods.length,
            errors
        }
    }
}
