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

export const processExcelFile = async (file: File): Promise<ProcessedExcelData> => {
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
          throw new Error('Не удалось прочитать CSV файл')
        }
        
        const lines = csvText.split('\n').filter(line => line.trim())
        if (lines.length < 2) {
          throw new Error('CSV файл должен содержать заголовки и данные')
        }
        
        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''))
        
        const rows = lines.slice(1).map(line => {
          const cells = line.split(',').map(cell => cell.trim().replace(/"/g, ''))
          return cells
        })
        
        const jsonData = [headers, ...rows]
        const result = processJsonData(jsonData)
        resolve(result)
        
      } catch (error) {
        console.error('Ошибка обработки CSV файла:', error)
        reject(error)
      }
    }
    
    reader.onerror = () => {
      reject(new Error('Ошибка чтения CSV файла'))
    }
    
    reader.readAsText(file)
  })
}

// Обработка Excel файлов
const processExcelFileInternal = async (file: File): Promise<ProcessedExcelData> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        if (!data) {
          throw new Error('Не удалось прочитать файл')
        }

        const arrayBuffer = data as ArrayBuffer
        const workbook = XLSX.read(arrayBuffer, { type: 'array' })
        const sheetNames = workbook.SheetNames
        
        if (sheetNames.length === 0) {
          throw new Error('В файле нет листов')
        }

        const firstSheetName = sheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][]
        
        if (jsonData.length < 2) {
          throw new Error('Файл должен содержать заголовки и данные')
        }

        const result = processJsonData(jsonData)
        resolve(result)
        
      } catch (error) {
        console.error('Ошибка обработки Excel файла:', error)
        reject(error)
      }
    }
    
    reader.onerror = () => {
      reject(new Error('Ошибка чтения файла'))
    }
    
    reader.readAsArrayBuffer(file)
  })
}

const processJsonData = (jsonData: any[][]): ProcessedExcelData => {
  // Находим строку с заголовками (может быть не первая из-за объединённых ячеек)
  let headerRowIndex = 0
  let headers: string[] = []
  
  // Ищем строку, которая содержит ключевые слова заголовков
  for (let i = 0; i < Math.min(5, jsonData.length); i++) {
    const row = jsonData[i] as any[]
    const rowStr = row.map(c => String(c || '').toLowerCase()).join('|')
    
    // Проверяем наличие ключевых заголовков
    if (rowStr.includes('адрес') || rowStr.includes('address') || 
        rowStr.includes('номер') || rowStr.includes('number') ||
        rowStr.includes('телефон') || rowStr.includes('phone')) {
      headerRowIndex = i
      headers = row.map(c => String(c || '').trim())
      console.log(`Найдена строка заголовков в строке ${i + 1}:`, headers)
      break
    }
  }
  
  // Если не нашли, используем первую строку
  if (headers.length === 0) {
    headers = (jsonData[0] || []).map(c => String(c || '').trim())
    console.log('Используем первую строку как заголовки:', headers)
  }
  
  // Нормализуем заголовки - убираем лишние пробелы, приводим к нижнему регистру для поиска
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim())
  
  // Ищем индекс колонки с адресом (проверяем различные варианты)
  // Список колонок, которые точно НЕ являются адресами
  const excludeColumns = [
    'заказчик', 'customer', 'клиент', 'client', 'имя', 'name',
    'способ оплаты', 'payment', 'оплата', 'payment_method',
    'комментарий', 'comment', 'примечание', 'note',
    'состояние', 'status', 'статус', 'state',
    'номер', 'number', 'order', 'заказ',
    'телефон', 'phone', 'тел',
    'тип заказа', 'order_type', 'type',
    'дата', 'date', 'время', 'time',
    'зона доставки', 'delivery_zone', 'zone'
  ]
  
  // Сначала ищем точное совпадение "Адрес" или "Address"
  const exactAddressIndices: number[] = []
  const possibleAddressIndices: number[] = []
  
  normalizedHeaders.forEach((h, idx) => {
    const lowerHeader = h.toLowerCase().trim()
    
    // Пропускаем исключенные колонки
    if (excludeColumns.some(excl => lowerHeader.includes(excl))) {
      return
    }
    
    // Точное совпадение
    if (lowerHeader === 'адрес' || lowerHeader === 'address') {
      exactAddressIndices.push(idx)
    }
    // Возможное совпадение (содержит слово "адрес")
    else if (lowerHeader.includes('адрес') || lowerHeader.includes('address')) {
      possibleAddressIndices.push(idx)
    }
  })
  
  // Приоритет: сначала точные совпадения, потом возможные
  const addressColumnIndices = [...exactAddressIndices, ...possibleAddressIndices]
  
  console.log('Точные колонки с адресом:', exactAddressIndices.map(i => `${i}: "${headers[i]}"`))
  console.log('Возможные колонки с адресом:', possibleAddressIndices.map(i => `${i}: "${headers[i]}"`))
  
  const rows = jsonData.slice(headerRowIndex + 1) as any[][]
  
  const orders: any[] = []
  const couriers: any[] = []
  const paymentMethods: any[] = []
  const errors: any[] = []
  
  // Логируем заголовки для отладки
  console.log('Заголовки Excel (все):', headers)
  console.log('Всего строк данных:', rows.length)
  
  // Функция для валидации адреса - проверяем, что это действительно адрес, а не инструкция/комментарий
  const isValidAddress = (str: string, columnName?: string): boolean => {
    if (!str || str.trim().length < 5) return false
    
    const lowerStr = str.toLowerCase().trim()
    const lowerColName = (columnName || '').toLowerCase().trim()
    
    // Исключаем известные не-адресные колонки
    if (excludeColumns.some(excl => lowerColName.includes(excl))) {
      return false
    }
    
    // Исключаем инструкции, комментарии, имена, способы оплаты, даты
    const invalidPatterns = [
      /зателефонувати|зателефоновать|позвонить|call|звон/i,
      /хвилин|минут|minutes/i,
      /до доставки|перед доставкой|before delivery/i,
      /примітка|примечание|note|комментарий|комментар/i,
      /инструкция|інструкція|instruction/i,
      /упаковка|packaging/i,
      /коментар|комментарий|comment/i,
      /примечание|примітка|note/i,
      /безготівка|безготівка_|наличные|нал|card|карта|payment|оплата/i,
      /qr|мульті|мульти|multi/i,
      /glovo:|code:|delivery|доставка курьером/i,
      /^\d{7,8}$/, // только номер заказа (7-8 цифр)
      /^[а-яёіїє]{2,20}\s+[а-яёіїє]{2,20}$/i, // только имя и фамилия (2 слова по 2-20 букв)
      /^[a-z]{2,20}\s+[a-z]{2,20}$/i, // только имя и фамилия латиницей
      /^зона\s+\d+/i, // зона доставки
      /исполнен|доставляется|в обработке/i,
      // Новые паттерны для исключения: имена + даты, короткие комментарии
      /^[а-яёіїєa-z]{3,15}\s+\d{1,2}[\.\/]\d{1,2}[\.\/]\d{2,4}/i, // "голуб 13.12.24", "Христина 27/11/06"
      /^[а-яёіїєa-z]{3,15}\s+\d{1,2}[\.\/]\d{1,2}\s+[а-яёіїєa-z]{2,5}$/i, // "16.02 иван дн"
      /контроль|шеф|дн$/i, // "Контроль шефом!", "дн"
      /^[а-яёіїєa-z]{3,20}$/i // только одно слово (имя без фамилии)
    ]
    
    // Проверяем, что это не инструкция/комментарий/имя/способ оплаты/дата
    for (const pattern of invalidPatterns) {
      if (pattern.test(lowerStr)) {
        return false
      }
    }
    
    // Адрес должен содержать хотя бы один из следующих маркеров:
    // - название улицы/проспекта/бульвара
    // - номер дома (цифра)
    // - название города
    const addressMarkers = [
      /\b(вул|вулиця|улица|ул\.?|проспект|просп\.?|провулок|пров\.?|бульвар|бул\.?|линия|лінія|лін|площа|площадь|пл\.?|пер\.?|переулок|str|street)\b/i,
      /\b\d+[а-яa-z]?[,\s]/, // номер дома с разделителем (например, "14,", "14а ")
      /\b(киев|київ|kiev|kyiv|одесса|одеса|харьков|харків|полтава|украина|ukraine)\b/i,
      /\b(под\.?|подъезд|під\.?|під'їзд|д\/ф|д\.ф|кв\.?|квартира|эт\.?|этаж|етаж|floor|л\/с|л\.с|кл|apartment|habteka)\b/i
    ]
    
    // Должен содержать хотя бы один маркер адреса
    const hasAddressMarker = addressMarkers.some(pattern => pattern.test(lowerStr))
    
    // Не должен быть только телефоном, email или числом
    const isNotPhone = !/^[\d\+\-\(\)\s]+$/.test(str)
    const isNotEmail = !/^[\w\.-]+@[\w\.-]+\.\w+$/.test(str)
    const isNotOnlyNumber = !/^\d+$/.test(str)
    
    // Должен быть достаточно длинным и содержать кириллицу/латиницу
    const hasText = str.length > 10 && /[а-яА-ЯёЁіІїЇєЄa-zA-Z]/.test(str)
    
    // Должен содержать хотя бы один номер (дома, квартиры и т.д.)
    const hasNumber = /\d/.test(str)
    
    return hasAddressMarker && isNotPhone && isNotEmail && isNotOnlyNumber && hasText && hasNumber
  }
  
  rows.forEach((row, index) => {
    try {
      // Пропускаем пустые строки
      if (!row || row.length === 0 || row.every(cell => !cell || String(cell).trim() === '')) {
        return
      }
      
      const rowData = createRowData(row, headers)
      
      // Улучшенный поиск адреса - проверяем все колонки, которые могут содержать адрес
      let foundAddress = ''
      if (addressColumnIndices.length > 0) {
        // Сначала проверяем колонки, которые точно должны содержать адрес
        for (const idx of addressColumnIndices) {
          // Проверяем саму колонку и соседние (на случай объединенных ячеек)
          const cellsToCheck = [
            { idx, offset: 0 }, // сама колонка
            { idx: idx + 1, offset: 1 }, // следующая колонка (комментарий к адресу)
            { idx: idx - 1, offset: -1 } // предыдущая колонка
          ]
          
          for (const { idx: checkIdx, offset } of cellsToCheck) {
            if (checkIdx < 0 || checkIdx >= row.length) continue
            
            const val = row[checkIdx]
            if (val && String(val).trim().length > 5) {
              const strVal = String(val).trim()
              const colName = headers[checkIdx] || headers[idx] || ''
              
              // Пропускаем если это точно комментарий к адресу
              const lowerColName = colName.toLowerCase().trim()
              if (lowerColName.includes('комментарий') || lowerColName.includes('comment')) {
                console.log(`⏭️ Пропускаем комментарий к адресу в колонке "${colName}" (индекс ${checkIdx}): ${strVal.substring(0, 40)}`)
                continue
              }
              
              // Логируем все проверки для отладки
              const isValid = isValidAddress(strVal, colName)
              console.log(`🔍 Проверяем значение в колонке "${colName}" (индекс ${checkIdx}): "${strVal.substring(0, 40)}" - ${isValid ? '✅ валидный адрес' : '❌ не адрес'}`)
              
              // Используем строгую валидацию адреса
              if (isValid) {
                foundAddress = strVal
                console.log(`✅ Найден валидный адрес в колонке "${colName}" (индекс ${checkIdx}, offset ${offset}): ${strVal.substring(0, 60)}`)
                break
              }
            }
          }
          
          if (foundAddress) break
        }
      }
      
      // Если адрес не найден в специальных колонках, ищем по всему ряду (но исключаем известные не-адресные колонки)
      if (!foundAddress) {
        for (let i = 0; i < row.length; i++) {
          const val = row[i]
          const colName = headers[i] || ''
          const lowerColName = colName.toLowerCase().trim()
          
          // Пропускаем известные не-адресные колонки
          if (excludeColumns.some(excl => lowerColName.includes(excl))) {
            continue
          }
          
          // Пропускаем если это точно комментарий к адресу
          if (lowerColName.includes('комментарий') || lowerColName.includes('comment')) {
            continue
          }
          
          if (val && typeof val === 'string') {
            const strVal = String(val).trim()
            // Используем строгую валидацию адреса
            if (isValidAddress(strVal, colName)) {
              foundAddress = strVal
              console.log(`✅ Найден валидный адрес в колонке "${colName}" (индекс ${i}): ${strVal.substring(0, 60)}`)
              break
            }
          }
        }
      }
      
      // Добавляем найденный адрес в rowData, если его там нет
      if (foundAddress && !rowData.address && !rowData['адрес'] && !rowData['address']) {
        rowData.address = foundAddress
        rowData['адрес'] = foundAddress
      }
      
      // Если есть номер заказа (7-значное число), считаем это заказом
      const orderNumber = findOrderNumber(rowData)
      if (orderNumber) {
        const order = createOrderFromData(rowData, orderNumber, index)
        if (foundAddress) {
          order.address = foundAddress
        }
        if (order.address) {
          orders.push(order)
        } else {
          console.warn(`Заказ ${orderNumber} без адреса, пропускаем`)
        }
        return
      }
      
      if (isOrderRow(rowData)) {
        const order = createOrder(rowData, index)
        if (foundAddress) {
          order.address = foundAddress
        }
        if (order.address) {
          orders.push(order)
        } else {
          console.warn(`Заказ в строке ${index + 2} без адреса, пропускаем`)
        }
      } else if (isCourierRow(rowData)) {
        couriers.push(createCourier(rowData, index))
      } else if (isPaymentMethodRow(rowData)) {
        paymentMethods.push(createPaymentMethod(rowData, index))
      } else {
        // Пробуем создать заказ, если есть адрес
        if (foundAddress) {
          const orderNumber = getValue(rowData, ['номер', 'number', 'orderNumber']) || `ORD-${index + 1}`
          const order = {
            id: `order_${Date.now()}_${index}`,
            orderNumber,
            address: foundAddress,
            courier: getValue(rowData, ['курьер', 'courier']) || '',
            amount: parseFloat(getValue(rowData, ['сумма', 'amount', 'цена']) || '0'),
            phone: getValue(rowData, ['телефон', 'phone']) || '',
            customerName: getValue(rowData, ['клиент', 'customer', 'имя', 'name']) || '',
            plannedTime: getValue(rowData, ['время', 'time']) || '',
            isSelected: false,
            isInRoute: false,
            ...rowData // Добавляем все остальные поля из исходных данных
          }
          orders.push(order)
          console.log(`Создан заказ из строки ${index + 2} с адресом: ${foundAddress.substring(0, 50)}`)
        } else {
          errors.push({
            row: index + 2,
            message: 'Не удалось определить тип записи и не найден адрес',
            data: rowData
          })
        }
      }
    } catch (error) {
      errors.push({
        row: index + 2,
        message: `Ошибка обработки строки: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
        data: row
      })
    }
  })
  
  console.log(`Обработано заказов: ${orders.length}, курьеров: ${couriers.length}, способов оплаты: ${paymentMethods.length}`)
  if (orders.length > 0) {
    console.log('Примеры заказов:', orders.slice(0, 3).map(o => ({ 
      orderNumber: o.orderNumber, 
      address: o.address?.substring(0, 50) || 'нет адреса' 
    })))
  }

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
  }
}


const createRowData = (row: any[], headers: string[]): Record<string, any> => {
  const rowData: Record<string, any> = {}
  
  headers.forEach((header, index) => {
    if (header && row[index] !== undefined) {
      rowData[header] = row[index]
    }
  })
  
  return rowData
}

const isOrderRow = (rowData: Record<string, any>): boolean => {
  const hasOrderNumber = hasValue(rowData, ['номер', 'number', 'orderNumber', 'order_number', 'номер_заказа'])
  const hasAddress = hasValue(rowData, ['адрес', 'address', 'адрес_доставки', 'адресс'])
  const hasAmount = hasValue(rowData, ['сумма', 'amount', 'цена', 'price', 'стоимость', 'total'])
  
  return (hasOrderNumber || hasAddress) && (hasAmount || hasAddress)
}

// Проверяет, является ли строка курьером
const isCourierRow = (rowData: Record<string, any>): boolean => {
  const hasName = hasValue(rowData, ['имя', 'name', 'курьер', 'courier', 'курьер_имя', 'courier_name'])
  const hasPhone = hasValue(rowData, ['телефон', 'phone', 'телефон_курьера', 'courier_phone'])
  
  return hasName && hasPhone && !isOrderRow(rowData)
}

// Проверяет, является ли строка способом оплаты
const isPaymentMethodRow = (rowData: Record<string, any>): boolean => {
  const hasPaymentType = hasValue(rowData, ['оплата', 'payment', 'способ', 'метод_оплаты', 'payment_method'])
  
  return hasPaymentType && !isOrderRow(rowData) && !isCourierRow(rowData)
}

// Проверяет наличие значения в указанных полях
const hasValue = (rowData: Record<string, any>, fields: string[]): boolean => {
  const lowerRowData = Object.keys(rowData).reduce((acc, key) => {
    acc[key.toLowerCase()] = rowData[key]
    return acc
  }, {} as Record<string, any>)
  
  return fields.some(field => {
    const value = lowerRowData[field.toLowerCase()]
    return value !== undefined && value !== null && value !== ''
  })
}

// Создает объект заказа
const createOrder = (rowData: Record<string, any>, index: number): any => {
  // Расширенный поиск адреса - проверяем больше вариантов названий колонок
  const address = getValue(rowData, [
    'адрес', 'address', 'адрес_доставки', 'адресс', 'address_delivery',
    'адрес доставки', 'адрес доставки', 'delivery_address',
    'адреса', 'адреса доставки', 'адреса_доставки'
  ]) || ''
  
  // Функция для валидации адреса
  const isValidAddress = (str: string): boolean => {
    if (!str || str.trim().length < 5) return false
    
    // Исключаем инструкции и комментарии
    const invalidPatterns = [
      /зателефонувати|зателефоновать|позвонить|call|звон/i,
      /хвилин|минут|minutes/i,
      /до доставки|перед доставкой|before delivery/i,
      /примітка|примечание|note|комментарий|комментар/i,
      /инструкция|інструкція|instruction/i,
      /упаковка|упаковка|packaging/i,
      /коментар|комментарий|comment/i,
      /примечание|примітка|note/i
    ]
    
    for (const pattern of invalidPatterns) {
      if (pattern.test(str)) {
        return false
      }
    }
    
    // Адрес должен содержать маркеры адреса
    const addressMarkers = [
      /\b(вул|вулиця|улица|ул|проспект|просп|провулок|пров|бульвар|бул|линия|лінія|лін|площа|площадь)\b/i,
      /\b\d+[а-я]?\b/, // номер дома
      /\b(киев|київ|kiev|kyiv|одесса|одеса|харьков|харків|полтава)\b/i
    ]
    
    const hasAddressMarker = addressMarkers.some(pattern => pattern.test(str))
    const isNotPhone = !/^[\d\+\-\(\)\s]+$/.test(str)
    const isNotEmail = !/^[\w\.-]+@[\w\.-]+\.\w+$/.test(str)
    const isNotOnlyNumber = !/^\d+$/.test(str)
    const hasText = str.length > 10 && /[а-яА-ЯёЁіІїЇєЄa-zA-Z]/.test(str)
    
    const hasNumber = /\d/.test(str)
    
    return hasAddressMarker && isNotPhone && isNotEmail && isNotOnlyNumber && hasText && hasNumber
  }
  
  // Если адрес не найден стандартным способом, пробуем найти валидный адрес
  // Список колонок, которые точно НЕ являются адресами
  const excludeCols = [
    'заказчик', 'customer', 'клиент', 'client', 'имя', 'name',
    'способ оплаты', 'payment', 'оплата', 'payment_method',
    'комментарий', 'comment', 'примечание', 'note',
    'состояние', 'status', 'статус', 'state',
    'номер', 'number', 'order', 'заказ',
    'телефон', 'phone', 'тел',
    'тип заказа', 'order_type', 'type',
    'дата', 'date', 'время', 'time',
    'зона доставки', 'delivery_zone', 'zone'
  ]
  
  let finalAddress = address
  if (!finalAddress || !isValidAddress(finalAddress, 'адрес')) {
    finalAddress = ''
    for (const key in rowData) {
      const lowerKey = key.toLowerCase().trim()
      // Пропускаем исключенные колонки
      if (excludeCols.some(excl => lowerKey.includes(excl))) {
        continue
      }
      
      const value = rowData[key]
      if (value && typeof value === 'string') {
        const strVal = String(value).trim()
        // Используем валидацию адреса с проверкой названия колонки
        if (isValidAddress(strVal, key)) {
          finalAddress = strVal
          console.log(`✅ Найден валидный адрес в колонке "${key}": ${strVal.substring(0, 50)}...`)
          break
        }
      }
    }
  }
  
  // Извлекаем все нужные поля по ключевым словам (независимо от порядка столбцов)
  const getFieldByKeywords = (keywords: string[], fieldName: string): string => {
    for (const key in rowData) {
      const lowerKey = key.toLowerCase().trim()
      for (const keyword of keywords) {
        const lowerKeyword = keyword.toLowerCase()
        // Проверяем точное совпадение или вхождение ключевого слова
        if (lowerKey === lowerKeyword || lowerKey.includes(lowerKeyword)) {
          const value = rowData[key]
          if (value !== undefined && value !== null && String(value).trim() !== '') {
            console.log(`✅ Найдено поле "${fieldName}" в столбце "${key}" (искали по "${keyword}"): ${String(value).trim().substring(0, 50)}`)
            return String(value).trim()
          }
        }
      }
    }
    return ''
  }
  
  // Адрес уже найден в finalAddress
  // Состояние
  const status = getFieldByKeywords([
    'состояние', 'status', 'статус', 'state', 'статус заказа', 'состояние заказа'
  ], 'состояние')
  
  // Время на кухню
  const kitchenTime = getFieldByKeywords([
    'время на кухню', 'время_на_кухню', 'временакухню', 'времянакухню',
    'kitchen time', 'kitchen_time', 'kitchentime', 'time to kitchen',
    'время готовности', 'время_готовности', 'времяготовности',
    'ready time', 'ready_time', 'readytime'
  ], 'время на кухню')
  
  // Плановое время
  const plannedTime = getFieldByKeywords([
    'плановое время', 'плановое_время', 'плановоевремя',
    'planned time', 'planned_time', 'plannedtime',
    'время доставки', 'время_доставки', 'времядодоставки',
    'delivery time', 'delivery_time', 'deliverytime',
    'дедлайн', 'deadline', 'deadline_time'
  ], 'плановое время')
  
  return {
    id: `order_${Date.now()}_${index}`,
    orderNumber: getValue(rowData, ['номер', 'number', 'orderNumber']) || `ORD-${index + 1}`,
    address: finalAddress,
    status: status,
    kitchenTime: kitchenTime,
    plannedTime: plannedTime,
    courier: getValue(rowData, ['курьер', 'courier']) || '',
    amount: parseFloat(getValue(rowData, ['сумма', 'amount', 'цена']) || '0'),
    phone: getValue(rowData, ['телефон', 'phone']) || '',
    customerName: getValue(rowData, ['клиент', 'customer', 'имя', 'name']) || '',
    isSelected: false,
    isInRoute: false,
    ...rowData // Добавляем ВСЕ поля из Excel, включая "время на кухню" и "плановое время"
  }
}

// Создает объект курьера
const createCourier = (rowData: Record<string, any>, index: number): any => {
  return {
    id: `courier_${Date.now()}_${index}`,
    name: getValue(rowData, ['имя', 'name', 'курьер', 'courier']) || '',
    phone: getValue(rowData, ['телефон', 'phone']) || '',
    email: getValue(rowData, ['email', 'почта']) || '',
    vehicleType: getValue(rowData, ['транспорт', 'vehicle', 'тип']) || 'car',
    isActive: true
  }
}

// Создает объект способа оплаты
const createPaymentMethod = (rowData: Record<string, any>, index: number): any => {
  return {
    id: `payment_${Date.now()}_${index}`,
    name: getValue(rowData, ['название', 'name', 'оплата', 'payment']) || '',
    type: getValue(rowData, ['тип', 'type']) || 'card',
    isActive: true
  }
}

// Получает значение из указанных полей
const getValue = (rowData: Record<string, any>, fields: string[]): string => {
  const lowerRowData = Object.keys(rowData).reduce((acc, key) => {
    acc[key.toLowerCase()] = rowData[key]
    return acc
  }, {} as Record<string, any>)
  
  for (const field of fields) {
    const value = lowerRowData[field.toLowerCase()]
    if (value !== undefined && value !== null && value !== '') {
      return String(value).trim()
    }
  }
  return ''
}

const findOrderNumber = (rowData: Record<string, any>): string | null => {
  for (const key in rowData) {
    const value = rowData[key]
    if (typeof value === 'string' && /^\d{7,8}$/.test(value)) {
      return value
    }
    if (typeof value === 'number' && value >= 1000000 && value <= 99999999) {
      return String(value)
    }
  }
  return null
}

const createOrderFromData = (rowData: Record<string, any>, orderNumber: string, index: number): any => {
  // Сначала пробуем найти адрес по стандартным названиям колонок
  let address = getValue(rowData, [
    'адрес', 'address', 'адрес_доставки', 'адресс', 'address_delivery',
    'адрес доставки', 'delivery_address',
    'адреса', 'адреса доставки', 'адреса_доставки'
  ])
  
  // Функция для валидации адреса (улучшенная версия)
  const excludeCols = [
    'заказчик', 'customer', 'клиент', 'client', 'имя', 'name',
    'способ оплаты', 'payment', 'оплата', 'payment_method',
    'комментарий', 'comment', 'примечание', 'note',
    'состояние', 'status', 'статус', 'state',
    'номер', 'number', 'order', 'заказ',
    'телефон', 'phone', 'тел',
    'тип заказа', 'order_type', 'type',
    'дата', 'date', 'время', 'time',
    'зона доставки', 'delivery_zone', 'zone'
  ]
  
  const isValidAddress = (str: string, columnName?: string): boolean => {
    if (!str || str.trim().length < 5) return false
    
    const lowerStr = str.toLowerCase().trim()
    const lowerColName = (columnName || '').toLowerCase().trim()
    
    // Исключаем известные не-адресные колонки
    if (excludeCols.some(excl => lowerColName.includes(excl))) {
      return false
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
      /^\d{7,8}$/, // только номер заказа
      /^[а-яёіїє]{2,20}\s+[а-яёіїє]{2,20}$/i, // только имя и фамилия
      /^[a-z]{2,20}\s+[a-z]{2,20}$/i, // только имя и фамилия латиницей
      /^зона\s+\d+/i,
      /исполнен|доставляется|в обработке/i
    ]
    
    for (const pattern of invalidPatterns) {
      if (pattern.test(lowerStr)) {
        return false
      }
    }
    
    const addressMarkers = [
      /\b(вул|вулиця|улица|ул\.?|проспект|просп\.?|провулок|пров\.?|бульвар|бул\.?|линия|лінія|лін|площа|площадь|пл\.?|пер\.?|переулок)\b/i,
      /\b\d+[а-я]?[,\s]/,
      /\b(киев|київ|kiev|kyiv|одесса|одеса|харьков|харків|полтава|украина|ukraine)\b/i,
      /\b(под\.?|подъезд|д\/ф|д\.ф|кв\.?|квартира|эт\.?|этаж|floor)\b/i
    ]
    
    const hasAddressMarker = addressMarkers.some(pattern => pattern.test(lowerStr))
    const isNotPhone = !/^[\d\+\-\(\)\s]+$/.test(str)
    const isNotEmail = !/^[\w\.-]+@[\w\.-]+\.\w+$/.test(str)
    const isNotOnlyNumber = !/^\d+$/.test(str)
    const hasText = str.length > 10 && /[а-яА-ЯёЁіІїЇєЄa-zA-Z]/.test(str)
    const hasNumber = /\d/.test(str)
    
    return hasAddressMarker && isNotPhone && isNotEmail && isNotOnlyNumber && hasText && hasNumber
  }
  
  // Проверяем, что найденный адрес валиден
  if (address && !isValidAddress(address, 'адрес')) {
    address = ''
  }
  
  // Если не нашли валидный адрес, ищем в других полях (но исключаем известные не-адресные)
  if (!address || !isValidAddress(address, 'адрес')) {
    address = ''
    for (const key in rowData) {
      const lowerKey = key.toLowerCase().trim()
      // Пропускаем исключенные колонки
      if (excludeCols.some(excl => lowerKey.includes(excl))) {
        continue
      }
      
      const value = rowData[key]
      if (value && typeof value === 'string' && String(value).trim() !== orderNumber) {
        const strVal = String(value).trim()
        // Используем валидацию адреса с проверкой названия колонки
        if (isValidAddress(strVal, key)) {
          address = strVal
          console.log(`✅ Найден валидный адрес в колонке "${key}": ${strVal.substring(0, 50)}...`)
          break
        }
      }
    }
  }
  
  // Извлекаем все нужные поля по ключевым словам (независимо от порядка столбцов)
  const getFieldByKeywords = (keywords: string[], fieldName: string): string => {
    for (const key in rowData) {
      const lowerKey = key.toLowerCase().trim()
      for (const keyword of keywords) {
        const lowerKeyword = keyword.toLowerCase()
        // Проверяем точное совпадение или вхождение ключевого слова
        if (lowerKey === lowerKeyword || lowerKey.includes(lowerKeyword)) {
          const value = rowData[key]
          if (value !== undefined && value !== null && String(value).trim() !== '') {
            console.log(`✅ Найдено поле "${fieldName}" в столбце "${key}" (искали по "${keyword}"): ${String(value).trim().substring(0, 50)}`)
            return String(value).trim()
          }
        }
      }
    }
    return ''
  }
  
  // Адрес уже найден в address
  // Состояние
  const status = getFieldByKeywords([
    'состояние', 'status', 'статус', 'state', 'статус заказа', 'состояние заказа'
  ], 'состояние')
  
  // Время на кухню
  const kitchenTime = getFieldByKeywords([
    'время на кухню', 'время_на_кухню', 'временакухню', 'времянакухню',
    'kitchen time', 'kitchen_time', 'kitchentime', 'time to kitchen',
    'время готовности', 'время_готовности', 'времяготовности',
    'ready time', 'ready_time', 'readytime'
  ], 'время на кухню')
  
  // Плановое время
  const plannedTime = getFieldByKeywords([
    'плановое время', 'плановое_время', 'плановоевремя',
    'planned time', 'planned_time', 'plannedtime',
    'время доставки', 'время_доставки', 'времядодоставки',
    'delivery time', 'delivery_time', 'deliverytime',
    'дедлайн', 'deadline', 'deadline_time'
  ], 'плановое время')
  
  return {
    id: `order_${Date.now()}_${index}`,
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
    ...rowData // Добавляем ВСЕ поля из Excel, включая "время на кухню" и "плановое время"
  }
}
