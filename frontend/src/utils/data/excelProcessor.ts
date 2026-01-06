import * as XLSX from 'xlsx'

import { ProcessedExcelData } from '../../types'

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

export const processJsonData = (jsonData: any[][]): ProcessedExcelData => {
  // Находим строку с заголовками (может быть не первая из-за объединённых ячеек)
  let headerRowIndex = 0
  let headers: string[] = []
  let subHeaderRowIndex = -1
  let subHeaders: string[] = []

  // ВАЖНО: Логируем первые 10 строк для диагностики
  console.log('📋 [Excel Processor] Первые 10 строк файла для поиска заголовков:')
  for (let i = 0; i < Math.min(10, jsonData.length); i++) {
    const row = jsonData[i] as any[]
    const nonEmptyCells = row.filter(c => c !== null && c !== undefined && String(c).trim() !== '')
    console.log(`  Строка ${i + 1} (${nonEmptyCells.length} непустых ячеек):`, row.slice(0, 20).map((c, idx) => `${idx}: "${String(c || '').substring(0, 30)}"`))
  }

  // Ищем строку, которая содержит ключевые слова заголовков
  // Расширяем поиск до 10 строк для файлов с пустыми строками вначале
  for (let i = 0; i < Math.min(10, jsonData.length); i++) {
    const row = jsonData[i] as any[]
    const rowStr = row.map(c => String(c || '').toLowerCase()).join('|')

    // Подсчитываем количество непустых ячеек
    const nonEmptyCells = row.filter(c => c !== null && c !== undefined && String(c).trim() !== '')

    // Пропускаем строки с менее чем 3 непустыми ячейками (вероятно, не заголовки)
    if (nonEmptyCells.length < 3) {
      console.log(`⏭️ [Excel Processor] Пропускаем строку ${i + 1}: слишком мало данных (${nonEmptyCells.length} ячеек)`)
      continue
    }

    // Проверяем наличие ключевых заголовков (расширенный список)
    if (rowStr.includes('адрес') || rowStr.includes('address') ||
      rowStr.includes('номер') || rowStr.includes('number') || rowStr.includes('№') ||
      rowStr.includes('телефон') || rowStr.includes('phone') ||
      rowStr.includes('время') || rowStr.includes('time') ||
      rowStr.includes('дата') || rowStr.includes('date') ||
      rowStr.includes('кухню') || rowStr.includes('kitchen') ||
      rowStr.includes('плановое') || rowStr.includes('planned') ||
      rowStr.includes('доставить') || rowStr.includes('deliver') ||
      rowStr.includes('заказ') || rowStr.includes('order') ||
      rowStr.includes('состояние') || rowStr.includes('status') ||
      rowStr.includes('сумма') || rowStr.includes('amount') ||
      rowStr.includes('клиент') || rowStr.includes('customer') ||
      rowStr.includes('курьер') || rowStr.includes('courier')) {
      headerRowIndex = i
      headers = row.map(c => String(c || '').trim())
      console.log(`✅ [Excel Processor] Найдена строка заголовков в строке ${i + 1}:`, headers.slice(0, 20))
      console.log(`📋 [Excel Processor] Все заголовки (${headers.length}):`, headers)

      // ВАЖНО: Проверяем следующую строку на наличие подзаголовков
      // Если в строке заголовков есть "Дата", проверяем следующую строку на подзаголовки
      const hasDateHeader = headers.some(h => {
        const lower = String(h || '').toLowerCase().trim()
        return lower === 'дата' || lower === 'date'
      })

      if (hasDateHeader && i + 1 < jsonData.length) {
        const nextRow = jsonData[i + 1] as any[]
        const nextRowStr = nextRow.map(c => String(c || '').toLowerCase()).join('|')

        // Проверяем, содержит ли следующая строка подзаголовки времени
        if (nextRowStr.includes('время на кухню') || nextRowStr.includes('kitchen') ||
          nextRowStr.includes('доставить к') || nextRowStr.includes('deliver') ||
          nextRowStr.includes('плановое') || nextRowStr.includes('planned') ||
          nextRowStr.includes('создания') || nextRowStr.includes('creation')) {
          subHeaderRowIndex = i + 1
          subHeaders = nextRow.map(c => String(c || '').trim())
          console.log(`✅ [Excel Processor] Найдена строка подзаголовков в строке ${i + 2}:`, subHeaders.slice(0, 20))
          console.log(`📋 [Excel Processor] Все подзаголовки (${subHeaders.length}):`, subHeaders)
        }
      }

      break
    }
  }

  // Если не нашли, используем первую строку
  if (headers.length === 0) {
    headers = (jsonData[0] || []).map(c => String(c || '').trim())
    console.log('⚠️ [Excel Processor] Используем первую строку как заголовки:', headers.slice(0, 20))

    // Проверяем вторую строку на подзаголовки
    if (jsonData.length > 1) {
      const secondRow = jsonData[1] as any[]
      const secondRowStr = secondRow.map(c => String(c || '').toLowerCase()).join('|')
      if (secondRowStr.includes('время на кухню') || secondRowStr.includes('kitchen') ||
        secondRowStr.includes('доставить к') || secondRowStr.includes('deliver') ||
        secondRowStr.includes('плановое') || secondRowStr.includes('planned')) {
        subHeaderRowIndex = 1
        subHeaders = secondRow.map(c => String(c || '').trim())
        console.log(`✅ [Excel Processor] Найдена строка подзаголовков в строке 2:`, subHeaders.slice(0, 20))
      }
    }
  }

  // ВАЖНО: Объединяем заголовки с подзаголовками
  // Если есть подзаголовки, создаем составные ключи типа "Дата.время на кухню"
  if (subHeaders.length > 0 && headers.length > 0) {
    const mergedHeaders: string[] = []
    const maxLength = Math.max(headers.length, subHeaders.length)

    // Находим индекс столбца "Дата" в основных заголовках
    let dateHeaderIndex = -1
    for (let i = 0; i < headers.length; i++) {
      const h = String(headers[i] || '').toLowerCase().trim()
      if (h === 'дата' || h === 'date') {
        dateHeaderIndex = i
        break
      }
    }

    console.log(`📋 [Excel Processor] Индекс столбца "Дата": ${dateHeaderIndex}`)

    // ВАЖНО: Создаем один ключ на столбец, чтобы сохранить правильную индексацию
    // ПРОБЛЕМА: Когда "Дата" объединена на несколько столбцов, в headers только первый столбец содержит "Дата",
    // остальные пустые, но в subHeaders все столбцы содержат подзаголовки ("создания", "время на кухню", и т.д.)
    for (let i = 0; i < maxLength; i++) {
      const mainHeader = headers[i] || ''
      const subHeader = subHeaders[i] || ''

      // ВАЖНО: Сначала проверяем, находимся ли мы в области "Дата" (даже если mainHeader пустой)
      // Если dateHeaderIndex найден, проверяем, находимся ли мы в диапазоне [dateHeaderIndex, dateHeaderIndex + 4)
      const isInDateRange = dateHeaderIndex >= 0 && i >= dateHeaderIndex && i < dateHeaderIndex + 4

      // Если мы в области "Дата" и есть подзаголовок, создаем составной ключ "Дата.подзаголовок"
      if (isInDateRange && subHeader) {
        // Используем оригинальное написание "Дата" из headers[dateHeaderIndex], если оно есть
        const dateHeaderName = headers[dateHeaderIndex] || 'Дата'
        mergedHeaders.push(`${dateHeaderName}.${subHeader}`)
        console.log(`✅ [Excel Processor] Столбец ${i}: создан составной ключ "${dateHeaderName}.${subHeader}"`)
      }
      // Если есть основной заголовок и подзаголовок, но НЕ в области "Дата"
      else if (mainHeader && subHeader && !isInDateRange) {
        // Для других заголовков используем основной заголовок
        mergedHeaders.push(mainHeader)
      }
      // Если есть только основной заголовок (и мы не в области "Дата", или нет подзаголовка)
      else if (mainHeader && !isInDateRange) {
        mergedHeaders.push(mainHeader)
      }
      // Если есть только подзаголовок, но мы НЕ в области "Дата"
      else if (subHeader && !isInDateRange) {
        // Это обычный подзаголовок
        mergedHeaders.push(subHeader)
      }
      // Если мы в области "Дата", но нет подзаголовка - используем основной заголовок "Дата" или пустую строку
      else if (isInDateRange && !subHeader) {
        // Если это первый столбец "Дата", используем его; иначе пустую строку
        if (i === dateHeaderIndex) {
          mergedHeaders.push(headers[dateHeaderIndex] || 'Дата')
        } else {
          mergedHeaders.push('')
        }
      }
      // Пустая ячейка - сохраняем пустую строку для сохранения индексов
      else {
        mergedHeaders.push('')
      }
    }

    // ВАЖНО: Также создаем дополнительные ключи для обратной совместимости
    // Но не добавляем их в основной массив headers, чтобы не сломать индексацию
    // Вместо этого, мы будем добавлять их в rowData при создании

    // Обновляем headers с объединенными заголовками
    if (mergedHeaders.length > 0) {
      headers = mergedHeaders
      console.log(`✅ [Excel Processor] Объединенные заголовки (${headers.length}):`, headers.slice(0, 25))
      console.log(`📋 [Excel Processor] Все объединенные заголовки:`, headers)
    }
  }

  // Нормализуем заголовки - убираем лишние пробелы, приводим к нижнему регистру для поиска
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim())

  // ВАЖНО: Логируем ВСЕ заголовки для отладки
  console.log(`📋 Заголовки Excel (все):`, headers)

  // Находим заголовки, связанные со временем
  const timeRelatedHeaders: Array<{ index: number, header: string }> = []
  headers.forEach((h, idx) => {
    const lowerHeader = h.toLowerCase().trim()
    if (lowerHeader.includes('время') || lowerHeader.includes('time') ||
      lowerHeader.includes('дата') || lowerHeader.includes('date') ||
      lowerHeader.includes('кухню') || lowerHeader.includes('kitchen') ||
      lowerHeader.includes('плановое') || lowerHeader.includes('planned') ||
      lowerHeader.includes('доставить') || lowerHeader.includes('deliver') ||
      lowerHeader.includes('дедлайн') || lowerHeader.includes('deadline')) {
      timeRelatedHeaders.push({ index: idx, header: h })
    }
  })
  console.log(`📋 Заголовки, связанные со временем:`, timeRelatedHeaders)

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

  // ВАЖНО: Если есть подзаголовки, пропускаем и строку заголовков, и строку подзаголовков
  const dataStartRow = subHeaderRowIndex >= 0 ? subHeaderRowIndex + 1 : headerRowIndex + 1
  const rows = jsonData.slice(dataStartRow) as any[][]

  console.log(`📋 [Excel Processor] Строка начала данных: ${dataStartRow + 1} (пропущено ${dataStartRow} строк заголовков)`)

  const orders: any[] = []
  const couriers: any[] = []
  const paymentMethods: any[] = []
  const errors: any[] = []

  // Логируем заголовки для отладки (уже логировали выше)
  console.log('📋 Всего строк данных:', rows.length)

  // Выводим заголовки, связанные со временем (уже логировали выше в timeRelatedHeaders)

  // Функция для валидации адреса - проверяем, что это действительно адрес, а не инструкция/комментарий
  const isValidAddress = (str: string, columnName?: string): boolean => {
    if (!str || str.trim().length < 3) return false

    const lowerStr = str.toLowerCase().trim()
    const lowerColName = (columnName || '').toLowerCase().trim()

    // ВАЖНО: Сначала проверяем, является ли колонка ЯВНО адресной
    const isExplicitAddressColumn = lowerColName &&
      (lowerColName.includes('address') ||
        lowerColName.includes('адрес') ||
        lowerColName.includes('addr') ||
        lowerColName.includes('куда') ||
        lowerColName.includes('доставка') ||
        lowerColName.includes('delivery') ||
        lowerColName.includes('улица') ||
        lowerColName.includes('street') ||
        lowerColName.includes('место') ||
        lowerColName.includes('location') ||
        lowerColName.includes('пункт') ||
        lowerColName.includes('point'));

    // Исключаем известные не-адресные колонки, ТОЛЬКО если это не явная колонка адреса
    if (!isExplicitAddressColumn && excludeColumns.some(excl => lowerColName.includes(excl))) {
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
      /\b\d+[а-яa-z]?$/, // номер дома в конце строки (например, "Ленина 5")
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
    const hasText = str.length > 2 && /[а-яА-ЯёЁіІїЇєЄa-zA-Z]/.test(str)

    // Должен содержать хотя бы один номер (дома, квартиры и т.д.)
    const hasNumber = /\d/.test(str)

    if (isExplicitAddressColumn && hasText) {
      // Если это точно колонка адреса, пропускаем проверку маркеров, если текст достаточно длинный
      // Но все равно проверяем на garbage (email, phone)
      if (isNotPhone && isNotEmail && isNotOnlyNumber) {
        return true;
      }
    }

    return hasAddressMarker && isNotPhone && isNotEmail && isNotOnlyNumber && hasText && hasNumber
  }

  rows.forEach((row, index) => {
    try {
      // Пропускаем пустые строки
      if (!row || row.length === 0 || row.every(cell => !cell || String(cell).trim() === '')) {
        console.log(`⏭️ [Строка ${index + dataStartRow + 1}] Пропускаем пустую строку`)
        return
      }

      // Логируем обработку каждой строки (первые 10 строк)
      if (index < 10) {
        console.log(`\n🔍 [Строка ${index + dataStartRow + 1}] Начинаем обработку:`)
        console.log(`   Первые 10 значений:`, row.slice(0, 10).map((v, i) => `${i}: "${String(v || '').substring(0, 30)}"`))
      }

      const rowData = createRowData(row, headers)

      // Логируем созданные rowData для первых строк
      if (index < 10) {
        console.log(`   Созданные ключи rowData (первые 15):`, Object.keys(rowData).slice(0, 15))
      }

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
        // Сначала пробуем более мягкую валидацию для HTML данных
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

          if (val && (typeof val === 'string' || typeof val === 'number')) {
            const strVal = String(val).trim()

            // Для первых строк логируем все значения для диагностики
            if (index < 5) {
              console.log(`🔍 [Строка ${index + 2}] Проверяем колонку "${colName}" (индекс ${i}): "${strVal.substring(0, 60)}"`)
            }

            // Используем строгую валидацию адреса
            if (isValidAddress(strVal, colName)) {
              foundAddress = strVal
              console.log(`✅ Найден валидный адрес в колонке "${colName}" (индекс ${i}): ${strVal.substring(0, 60)}`)
              break
            }

            // Если строгая валидация не прошла, пробуем более мягкую для длинных строк
            if (strVal.length > 15 && !foundAddress) {
              // Мягкая валидация: содержит хотя бы один маркер адреса и не является явно не-адресом
              const hasAnyAddressMarker = /\b(вул|вулиця|улица|ул\.?|проспект|просп\.?|провулок|пров\.?|бульвар|бул\.?|линия|лінія|лін|площа|площадь|пл\.?|пер\.?|переулок|str|street)\b/i.test(strVal) ||
                /\b\d+[а-яa-z]?[,\s]/.test(strVal) ||
                /\b(киев|київ|kiev|kyiv|одесса|одеса|харьков|харків|полтава|украина|ukraine)\b/i.test(strVal)

              const isNotExplicitlyNotAddress = !/^[\d\+\-\(\)\s]+$/.test(strVal) && // не только телефон
                !/^[\w\.-]+@[\w\.-]+\.\w+$/.test(strVal) && // не email
                !/^\d{7,8}$/.test(strVal) && // не только номер заказа
                !/^[а-яёіїє]{2,20}\s+[а-яёіїє]{2,20}$/i.test(strVal) && // не только имя
                !/^[a-z]{2,20}\s+[a-z]{2,20}$/i.test(strVal) && // не только имя латиницей
                !/зателефонувати|зателефоновать|позвонить|call|звон/i.test(strVal) &&
                !/хвилин|минут|minutes/i.test(strVal) &&
                !/примітка|примечание|note|комментарий|коментар/i.test(strVal)

              if (hasAnyAddressMarker && isNotExplicitlyNotAddress && /[а-яА-ЯёЁіІїЇєЄa-zA-Z]/.test(strVal) && /\d/.test(strVal)) {
                foundAddress = strVal
                console.log(`✅ Найден адрес (мягкая валидация) в колонке "${colName}" (индекс ${i}): ${strVal.substring(0, 60)}`)
                break
              }
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
          console.log(`✅ [Строка ${index + 2}] Создан заказ из строки с адресом: ${foundAddress.substring(0, 50)}`)
        } else {
          // Детальное логирование для диагностики
          console.warn(`⚠️ [Строка ${index + 2}] Не удалось определить тип записи и не найден адрес`)
          console.warn(`   📋 Проверки:`)
          console.warn(`      - isOrderRow: ${isOrderRow(rowData)}`)
          console.warn(`      - isCourierRow: ${isCourierRow(rowData)}`)
          console.warn(`      - isPaymentMethodRow: ${isPaymentMethodRow(rowData)}`)
          console.warn(`      - findOrderNumber: ${findOrderNumber(rowData)}`)
          console.warn(`      - foundAddress: "${foundAddress}"`)
          console.warn(`   📋 Заголовки (первые 10):`, headers.slice(0, 10))
          console.warn(`   📋 Значения (первые 10):`, row.slice(0, 10).map(v => String(v || '').substring(0, 40)))
          console.warn(`   📋 rowData ключи (первые 15):`, Object.keys(rowData).slice(0, 15))
          console.warn(`   📋 rowData значения (первые 10):`, Object.keys(rowData).slice(0, 10).map(k => `${k}: "${String(rowData[k] || '').substring(0, 30)}"`))

          errors.push({
            row: index + 2,
            message: `Не удалось определить тип записи и не найден адрес. Проверенные колонки: ${headers.slice(0, 10).join(', ')}`,
            data: {
              headers: headers.slice(0, 15),
              values: row.slice(0, 15).map(v => String(v || '').substring(0, 50)),
              rowDataKeys: Object.keys(rowData).slice(0, 15)
            }
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

  if (orders.length === 0) {
    console.warn('⚠️ [Excel Processor] НЕ НАЙДЕНО ЗАКАЗОВ! Проверьте:')
    console.warn('  1. Заголовки файла:', headers.slice(0, 15))
    console.warn('  2. Первая строка данных:', rows[0]?.slice(0, 15))
    console.warn('  3. Найденные колонки адресов:', addressColumnIndices.map(i => `${i}: "${headers[i]}"`))
    console.warn('  4. Всего строк данных:', rows.length)
    console.warn('  5. Ошибки:', errors.length > 0 ? errors.slice(0, 3) : 'нет')
  }

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
      const value = row[index]
      // Сохраняем значение с оригинальным названием заголовка
      rowData[header] = value

      // ВАЖНО: Если заголовок содержит точку (например, "Дата.время на кухню"),
      // также сохраняем просто подзаголовок для обратной совместимости
      if (header.includes('.')) {
        const parts = header.split('.')
        if (parts.length === 2) {
          const subHeader = parts[1].trim()
          // Сохраняем как составной ключ "Дата.время на кухню"
          rowData[header] = value
          // Также сохраняем просто подзаголовок "время на кухню" для обратной совместимости
          if (subHeader && !rowData[subHeader]) {
            rowData[subHeader] = value
          }
        }
      }

      // ВАЖНО: Также сохраняем с нормализованным ключом (нижний регистр, без пробелов)
      // Это помогает при поиске полей, если заголовки немного отличаются
      const normalizedHeader = header.toLowerCase().trim()
      if (normalizedHeader && normalizedHeader !== header.toLowerCase()) {
        // Не перезаписываем, если уже есть точное совпадение
        if (!rowData[normalizedHeader]) {
          rowData[normalizedHeader] = value
        }
      }
    }
  })

  // ВАЖНО: Логируем для всех строк с данными (первые 5 и строки с проблемными заказами)
  const orderNumberMatch = row.find((cell: any) => {
    const str = String(cell || '').trim()
    return /^\d{7,8}$/.test(str) || str.includes('9323351') || str.includes('9324097') || str.includes('9328519')
  })

  if (orderNumberMatch || row.length > 0) {
    const orderNum = String(orderNumberMatch || row[0] || '').trim()
    // Логируем для всех заказов (первые 10) и проблемных заказов
    const shouldLog = !orderNum || orderNum.length === 0 || parseInt(orderNum) < 100 ||
      orderNum.includes('9323351') || orderNum.includes('9324097') ||
      parseInt(orderNum) >= 9320000 && parseInt(orderNum) <= 9330000

    if (shouldLog) {
      // Находим все ключи, связанные со временем
      const timeKeys = Object.keys(rowData).filter(k => {
        const lower = k.toLowerCase()
        return lower.includes('время') || lower.includes('time') ||
          lower.includes('дата') || lower.includes('date') ||
          lower.includes('кухню') || lower.includes('kitchen') ||
          lower.includes('плановое') || lower.includes('planned') ||
          lower.includes('доставить') || lower.includes('deliver') ||
          lower.includes('создания') || lower.includes('creation')
      })

      console.log(`📋 [createRowData] Создание rowData для строки (заказ: ${orderNum || 'не определен'}):`, {
        'headers (первые 25)': headers.slice(0, 25),
        'row values (первые 25)': row.slice(0, 25).map((v, i) => `${i}: "${String(v).substring(0, 40)}"`),
        'все созданные ключи': Object.keys(rowData),
        'ключи, связанные со временем': timeKeys,
        'значения для времени': timeKeys.reduce((acc, k) => {
          acc[k] = rowData[k]
          return acc
        }, {} as Record<string, any>),
        'специфичные значения': {
          'Дата.время на кухню': rowData['Дата.время на кухню'] || rowData['дата.время на кухню'] || 'не найдено',
          'Дата.доставить к': rowData['Дата.доставить к'] || rowData['дата.доставить к'] || 'не найдено',
          'Дата.плановое время': rowData['Дата.плановое время'] || rowData['дата.плановое время'] || 'не найдено',
          'Дата.создания': rowData['Дата.создания'] || rowData['дата.создания'] || 'не найдено',
          'время на кухню': rowData['время на кухню'] || rowData['время_на_кухню'] || 'не найдено',
          'плановое время': rowData['плановое время'] || rowData['плановое_время'] || 'не найдено',
          'доставить к': rowData['доставить к'] || rowData['доставить_к'] || 'не найдено',
          'Дата': rowData['Дата'] || rowData['дата'] || 'не найдено',
        }
      })
    }
  }

  return rowData
}

const isOrderRow = (rowData: Record<string, any>): boolean => {
  const hasOrderNumber = hasValue(rowData, ['номер', 'number', 'orderNumber', 'order_number', 'номер_заказа', '№', 'id'])
  const hasAddress = hasValue(rowData, ['адрес', 'address', 'адрес_доставки', 'адресс', 'куда', 'улица', 'street', 'delivery'])
  const hasAmount = hasValue(rowData, ['сумма', 'amount', 'цена', 'price', 'стоимость', 'total', 'к оплате'])

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

  // Функция для валидации адреса (синхронизирована с основной логикой)
  const isValidAddress = (str: string, columnName?: string): boolean => {
    if (!str || str.trim().length < 3) return false

    const lowerStr = str.toLowerCase().trim()
    const lowerColName = (columnName || '').toLowerCase().trim()

    // ВАЖНО: Сначала проверяем, является ли колонка ЯВНО адресной
    const isExplicitAddressColumn = lowerColName &&
      (lowerColName.includes('address') ||
        lowerColName.includes('адрес') ||
        lowerColName.includes('addr') ||
        lowerColName.includes('куда') ||
        lowerColName.includes('доставка') ||
        lowerColName.includes('delivery') ||
        lowerColName.includes('улица') ||
        lowerColName.includes('street') ||
        lowerColName.includes('место') ||
        lowerColName.includes('location') ||
        lowerColName.includes('пункт') ||
        lowerColName.includes('point'));

    // Исключаем известные не-адресные колонки, ТОЛЬКО если это не явная колонка адреса
    if (!isExplicitAddressColumn && excludeCols.some(excl => lowerColName.includes(excl))) {
      return false
    }

    // Исключаем инструкции и комментарии
    const invalidPatterns = [
      /зателефонувати|зателефоновать|позвонить|call|звон/i,
      /хвилин|минут|minutes/i,
      /до доставки|перед доставкой|before delivery/i,
      /примітка|примечание|note|комментарий|комментар/i,
      /инструкция|інструкція|instruction/i,
      /упаковка|упаковка|packaging/i,
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

    for (const pattern of invalidPatterns) {
      if (pattern.test(lowerStr)) {
        return false
      }
    }

    // Адрес должен содержать маркеры адреса
    const addressMarkers = [
      /\b(вул|вулиця|улица|ул\.?|проспект|просп\.?|провулок|пров\.?|бульвар|бул\.?|линия|лінія|лін|площа|площадь|пл\.?|пер\.?|переулок|str|street)\b/i,
      /\b\d+[а-я]?\b/, // номер дома
      /\b\d+[а-яa-z]?$/, // номер дома в конце строки (например, "Ленина 5")
      /\b(киев|київ|kiev|kyiv|одесса|одеса|харьков|харків|полтава|украина|ukraine)\b/i
    ]

    const hasAddressMarker = addressMarkers.some(pattern => pattern.test(lowerStr))
    const isNotPhone = !/^[\d\+\-\(\)\s]+$/.test(str)
    const isNotEmail = !/^[\w\.-]+@[\w\.-]+\.\w+$/.test(str)
    const isNotOnlyNumber = !/^\d+$/.test(str)
    const hasText = str.length > 2 && /[а-яА-ЯёЁіІїЇєЄa-zA-Z]/.test(str)
    const hasNumber = /\d/.test(str)

    if (isExplicitAddressColumn && hasText) {
      if (isNotPhone && isNotEmail && isNotOnlyNumber) {
        return true;
      }
    }

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
  // Проверяем валидность адреса (isValidAddress принимает columnName как опциональный параметр)
  if (!finalAddress || !isValidAddress(finalAddress)) {
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
        // Второй параметр columnName опционален и используется для фильтрации
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

  // ВАЖНО: Время на кухню - улучшенный поиск с учетом ВСЕХ возможных названий столбцов
  // Из скриншота: столбец "Дата" (K3-N3) содержит подстолбец "время на кухню" (L4)
  // Формат значения: "13:00:00", "13:30:00", "20:12:24" (только время дня)
  // Сначала пробуем точные совпадения (на русском и английском)
  // ВАЖНО: при экспорте Excel подстолбцы могут называться просто "время на кухню" или "Дата.время на кухню"
  let kitchenTime = getFieldByKeywords([
    'время на кухню', 'время_на_кухню', 'временакухню', 'времянакухню',
    'kitchen time', 'kitchen_time', 'kitchentime', 'time to kitchen',
    'время готовности', 'время_готовности', 'времяготовности',
    'ready time', 'ready_time', 'readytime',
    'время готовки', 'времяготовки', 'cooking time',
    // Подстолбцы из столбца "Дата":
    'дата.время на кухню', 'дата время на кухню', 'дата_время_на_кухню',
    'date.время на кухню', 'date время на кухню', 'date_время_на_кухню',
    'Дата.время на кухню', 'Дата время на кухню', 'Дата_время_на_кухню'
  ], 'время на кухню')

  // Если не нашли, проверяем ВСЕ ключи в rowData, которые содержат "время" И "кухню"
  // Учитываем все варианты написания, включая подстолбцы из столбца "Дата"
  // ВАЖНО: из скриншота видно, что подстолбец может называться просто "время на кухню" (без префикса "Дата.")
  if (!kitchenTime) {
    for (const key in rowData) {
      const lowerKey = key.toLowerCase().trim()
      // Ищем ключи, которые содержат и "время" и "кухню", или "kitchen" и "time"
      // Также учитываем вложенные структуры типа "Дата.время на кухню" или просто "время на кухню"
      // ВАЖНО: проверяем точное совпадение "время на кухню" (с пробелами) или варианты с "Дата."
      const exactMatch = lowerKey === 'время на кухню' || lowerKey === 'время_на_кухню' ||
        lowerKey.includes('дата.время на кухню') || lowerKey.includes('дата.время_на_кухню') ||
        lowerKey.includes('date.время на кухню') || lowerKey.includes('date.время_на_кухню')
      const hasTime = lowerKey.includes('время') || lowerKey.includes('time')
      const hasKitchen = lowerKey.includes('кухню') || lowerKey.includes('кухня') || lowerKey.includes('kitchen')
      const hasReady = lowerKey.includes('готов') || lowerKey.includes('готовность') || lowerKey.includes('ready')

      // Если это точное совпадение или содержит "время" и "кухню"
      if ((exactMatch || (hasTime && (hasKitchen || hasReady))) &&
        !lowerKey.includes('плановое') && !lowerKey.includes('planned') &&
        !lowerKey.includes('доставки') && !lowerKey.includes('delivery') &&
        !lowerKey.includes('доставить') && !lowerKey.includes('deliver')) {
        const value = rowData[key]
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          const strVal = String(value).trim()
          // Пропускаем длительности
          if (!strVal.toLowerCase().includes('мин.') && !strVal.toLowerCase().includes('час')) {
            kitchenTime = strVal
            console.log(`✅ [Excel Processor] Найдено "время на кухню" в поле "${key}": ${kitchenTime}`)
            break
          }
        }
      }
    }
  }

  // Если все еще не нашли, проверяем столбец "Дата" - он может содержать дату и время
  // Excel serial date (например, 45963.524247685185) содержит и дату, и время
  if (!kitchenTime && rowData['Дата']) {
    const dateValue = rowData['Дата']
    // Пробуем парсить как Excel serial date
    const excelDate = parseFloat(String(dateValue))
    if (!isNaN(excelDate) && excelDate > 25569) { // 25569 = 01.01.1970 в Excel
      // Excel serial date - конвертируем в JS Date
      const jsDate = new Date((excelDate - 25569) * 86400 * 1000)
      if (!isNaN(jsDate.getTime())) {
        kitchenTime = jsDate.toISOString()
        console.log(`✅ [Excel Processor] Найдено "время на кухню" в столбце "Дата" (Excel serial): ${kitchenTime}`)
      }
    } else {
      // Пробуем парсить как строку даты
      const dateStr = String(dateValue).trim()
      if (dateStr.includes('/') || dateStr.includes('.') || dateStr.includes('-') || dateStr.includes(':')) {
        kitchenTime = dateStr
        console.log(`✅ [Excel Processor] Найдено "время на кухню" в столбце "Дата" (строка): ${kitchenTime}`)
      }
    }
  }

  // Если все еще не нашли, пробуем поиск только по "кухню" или "готов" (без требования "время")
  if (!kitchenTime) {
    for (const key in rowData) {
      const lowerKey = key.toLowerCase().trim()
      if ((lowerKey.includes('кухню') || lowerKey.includes('кухня') || lowerKey.includes('kitchen') ||
        (lowerKey.includes('готов') && !lowerKey.includes('доставки'))) &&
        !lowerKey.includes('плановое') && !lowerKey.includes('planned') &&
        !lowerKey.includes('доставить') && !lowerKey.includes('deliver')) {
        const value = rowData[key]
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          const strVal = String(value).trim().toLowerCase()
          // Пропускаем длительности
          if (!strVal.includes('мин.') && !strVal.includes('час')) {
            // Проверяем, что это похоже на время/дату, а не на длительность
            const fullValue = String(value).trim()
            if (fullValue.includes(':') || fullValue.includes('/') || fullValue.includes('.') ||
              !isNaN(parseFloat(fullValue))) {
              kitchenTime = fullValue
              console.log(`✅ [Excel Processor] Найдено "время на кухню" (только по "кухню"/"готов") в поле "${key}": ${kitchenTime}`)
              break
            }
          }
        }
      }
    }
  }

  // ВАЖНО: Плановое время - улучшенный поиск с учетом ВСЕХ возможных названий столбцов
  // Из скриншота: столбец "Дата" (K3-N3) содержит подстолбцы:
  //   - "доставить к" (M4) - формат: "29.10.2025 13:30" (дата и время)
  //   - "плановое время" (N4) - формат: "29.10.2025 13:30" (дата и время)
  // ВАЖНО: при экспорте Excel подстолбцы могут называться просто "доставить к"/"плановое время" или "Дата.доставить к"/"Дата.плановое время"
  // Сначала пробуем точные совпадения (на русском и английском)
  let plannedTime = getFieldByKeywords([
    'плановое время', 'плановое_время', 'плановоевремя',
    'planned time', 'planned_time', 'plannedtime',
    'время доставки', 'время_доставки', 'времядодоставки', // НО: может содержать длительность!
    'delivery time', 'delivery_time', 'deliverytime',
    'дедлайн', 'deadline', 'deadline_time',
    'доставить к', 'доставить_к', 'доставить к', 'доставитьк',
    // Подстолбцы из столбца "Дата":
    'дата.плановое время', 'дата плановое время', 'дата_плановое_время',
    'date.плановое время', 'date плановое время', 'date_плановое_время',
    'Дата.плановое время', 'Дата плановое время', 'Дата_плановое_время',
    'дата.доставить к', 'дата доставить к', 'дата_доставить_к', 'дата.доставитьк',
    'date.доставить к', 'date доставить к', 'date_доставить_к', 'date.доставитьк',
    'Дата.доставить к', 'Дата доставить к', 'Дата_доставить_к', 'Дата.доставитьк'
  ], 'плановое время')

  // ВАЖНО: "Время доставки" может содержать длительность (например, "20мин."), а не время!
  // Если нашли "Время доставки", но там длительность - пропускаем и ищем дальше
  if (plannedTime && (String(plannedTime).toLowerCase().includes('мин.') ||
    String(plannedTime).toLowerCase().includes('час'))) {
    console.log(`⚠️ [Excel Processor] "Время доставки" содержит длительность "${plannedTime}", ищем дальше...`)
    plannedTime = ''
  }

  // Если не нашли, проверяем ВСЕ ключи в rowData, которые содержат "плановое" И "время", или "доставить к"
  // ВАЖНО: из скриншота видно, что подстолбцы могут называться просто "доставить к" или "плановое время" (без префикса "Дата.")
  if (!plannedTime) {
    for (const key in rowData) {
      const lowerKey = key.toLowerCase().trim()
      // ВАЖНО: проверяем точное совпадение "доставить к" или "плановое время" (с пробелами) или варианты с "Дата."
      const exactMatch = lowerKey === 'доставить к' || lowerKey === 'доставить_к' ||
        lowerKey === 'плановое время' || lowerKey === 'плановое_время' ||
        lowerKey.includes('дата.доставить к') || lowerKey.includes('дата.доставить_к') ||
        lowerKey.includes('дата.плановое время') || lowerKey.includes('дата.плановое_время') ||
        lowerKey.includes('date.доставить к') || lowerKey.includes('date.доставить_к') ||
        lowerKey.includes('date.плановое время') || lowerKey.includes('date.плановое_время')
      // Ищем ключи, которые содержат "плановое" и "время", или "доставить" и "к", или "planned" и "time"
      const hasPlanned = lowerKey.includes('плановое') || lowerKey.includes('planned')
      const hasTime = lowerKey.includes('время') || lowerKey.includes('time')
      const hasDeliver = lowerKey.includes('доставить') && (lowerKey.includes('к') || lowerKey.includes('к'))
      const hasDeadline = lowerKey.includes('дедлайн') || lowerKey.includes('deadline')

      // ВАЖНО: НЕ используем "время доставки", если там длительность
      const isDeliveryTime = lowerKey.includes('время доставки') || lowerKey.includes('delivery time')

      // Если это точное совпадение или содержит нужные ключевые слова
      if ((exactMatch || ((hasPlanned && hasTime) || hasDeliver || hasDeadline)) &&
        !lowerKey.includes('кухню') && !lowerKey.includes('kitchen')) {
        const value = rowData[key]
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          const strVal = String(value).trim().toLowerCase()
          // Пропускаем длительности
          if (!strVal.includes('мин.') && !strVal.includes('час')) {
            plannedTime = String(value).trim()
            console.log(`✅ [Excel Processor] Найдено "плановое время" в поле "${key}": ${plannedTime}`)
            break
          } else if (isDeliveryTime) {
            console.log(`⚠️ [Excel Processor] Пропускаем "${key}": содержит длительность "${value}"`)
          }
        }
      }
    }
  }

  // Если не нашли, проверяем столбец "Дата" - он может содержать дату и время
  // Excel serial date (например, 45963.524247685185) содержит и дату, и время
  if (!plannedTime && rowData['Дата']) {
    const dateValue = rowData['Дата']
    // Пробуем парсить как Excel serial date
    const excelDate = parseFloat(String(dateValue))
    if (!isNaN(excelDate) && excelDate > 25569) { // 25569 = 01.01.1970 в Excel
      // Excel serial date - конвертируем в JS Date
      const jsDate = new Date((excelDate - 25569) * 86400 * 1000)
      if (!isNaN(jsDate.getTime())) {
        plannedTime = jsDate.toISOString()
        console.log(`✅ [Excel Processor] Найдено "плановое время" в столбце "Дата" (Excel serial): ${plannedTime}`)
      }
    } else {
      // Пробуем парсить как строку даты
      const dateStr = String(dateValue).trim()
      if (dateStr.includes('/') || dateStr.includes('.') || dateStr.includes('-') || dateStr.includes(':')) {
        plannedTime = dateStr
        console.log(`✅ [Excel Processor] Найдено "плановое время" в столбце "Дата" (строка): ${plannedTime}`)
      }
    }
  }

  // Если все еще не нашли, пробуем поиск только по "плановое", "доставить к" или "дедлайн"
  if (!plannedTime) {
    for (const key in rowData) {
      const lowerKey = key.toLowerCase().trim()
      if ((lowerKey.includes('плановое') || lowerKey.includes('planned') ||
        (lowerKey.includes('доставить') && lowerKey.includes('к')) ||
        lowerKey.includes('дедлайн') || lowerKey.includes('deadline')) &&
        !lowerKey.includes('кухню') && !lowerKey.includes('kitchen')) {
        const value = rowData[key]
        if (value !== undefined && value !== null && String(value).trim() !== '') {
          const strVal = String(value).trim().toLowerCase()
          // Пропускаем длительности
          if (!strVal.includes('мин.') && !strVal.includes('час')) {
            // Проверяем, что это похоже на время/дату
            const fullValue = String(value).trim()
            if (fullValue.includes(':') || fullValue.includes('/') || fullValue.includes('.') ||
              !isNaN(parseFloat(fullValue))) {
              plannedTime = fullValue
              console.log(`✅ [Excel Processor] Найдено "плановое время" (по ключевому слову) в поле "${key}": ${plannedTime}`)
              break
            }
          }
        }
      }
    }
  }

  const orderNumber = getValue(rowData, ['номер', 'number', 'orderNumber']) || `ORD-${index + 1}`

  // Собираем все оригинальные поля из Excel с их оригинальными названиями
  // Важно: сначала spread rowData, чтобы сохранить оригинальные названия полей из Excel
  const order: any = {
    ...rowData, // ВСЕ поля из Excel ПЕРВЫМИ, чтобы сохранить оригинальные названия (например, "время на кухню", "плановое время")
    // Затем добавляем/перезаписываем нашими вычисленными полями
    id: `order_${Date.now()}_${index}`,
    orderNumber: orderNumber,
    address: finalAddress,
    status: status,
    // Сохраняем извлеченные значения, но НЕ перезаписываем оригинальные поля из Excel
    kitchenTime: kitchenTime || rowData['время на кухню'] || rowData['kitchenTime'] || null,
    plannedTime: plannedTime || rowData['плановое время'] || rowData['plannedTime'] || null,
    courier: getValue(rowData, ['курьер', 'courier']) || '',
    amount: parseFloat(getValue(rowData, ['сумма', 'amount', 'цена']) || '0'),
    phone: getValue(rowData, ['телефон', 'phone']) || '',
    customerName: getValue(rowData, ['клиент', 'customer', 'имя', 'name']) || '',
    isSelected: false,
    isInRoute: false,
    // Явно сохраняем оригинальные поля из Excel, если они не были добавлены через spread
    'время на кухню': rowData['время на кухню'] || kitchenTime || null,
    'плановое время': rowData['плановое время'] || plannedTime || null,
    'доставить к': rowData['доставить к'] || rowData['доставить_к'] || null,
    // ВАЖНО: Сохраняем rowData как raw для доступа в AutoPlanner
    raw: { ...rowData }
  }

  // ВАЖНО: Детальное логирование для диагностики проблем с временем
  const shouldLog = index < 5 || String(orderNumber).includes('9328519') || String(orderNumber).includes('9352250')
  if (shouldLog) {
    // Ищем все ключи, связанные со временем
    const timeRelatedKeys = Object.keys(rowData).filter(k => {
      const lower = k.toLowerCase()
      return lower.includes('время') || lower.includes('time') ||
        lower.includes('дата') || lower.includes('date') ||
        lower.includes('кухню') || lower.includes('kitchen') ||
        lower.includes('плановое') || lower.includes('planned') ||
        lower.includes('доставить') || lower.includes('deliver') ||
        lower.includes('дедлайн') || lower.includes('deadline')
    })

    console.log(`📋 [Excel Processor] Заказ ${orderNumber} (строка ${index + 2}):`, {
      'finalAddress': finalAddress?.substring(0, 50) || 'не найден',
      'kitchenTime (извлеченное)': kitchenTime || 'не найдено',
      'plannedTime (извлеченное)': plannedTime || 'не найдено',
      'всего ключей в rowData': Object.keys(rowData).length,
      'ключи, связанные со временем': timeRelatedKeys,
      'значения времени': timeRelatedKeys.reduce((acc, k) => {
        acc[k] = rowData[k]
        return acc
      }, {} as Record<string, any>),
      'rowData["время на кухню"]': rowData['время на кухню'] || 'не найдено',
      'rowData["плановое время"]': rowData['плановое время'] || 'не найдено',
      'rowData["доставить к"]': rowData['доставить к'] || 'не найдено',
      'rowData["Дата"]': rowData['Дата'] || rowData['дата'] || 'не найдено',
      'Все ключи в созданном заказе': Object.keys(order).slice(0, 40),
      'order.raw существует': !!order.raw,
      'order.raw ключи': order.raw ? Object.keys(order.raw).slice(0, 30) : [],
    })
  }

  return order
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
    if (!str || str.trim().length < 3) return false

    const lowerStr = str.toLowerCase().trim()
    const lowerColName = (columnName || '').toLowerCase().trim()

    // ВАЖНО: Сначала проверяем, является ли колонка ЯВНО адресной
    const isExplicitAddressColumn = lowerColName &&
      (lowerColName.includes('address') ||
        lowerColName.includes('адрес') ||
        lowerColName.includes('addr') ||
        lowerColName.includes('куда') ||
        lowerColName.includes('доставка') ||
        lowerColName.includes('delivery') ||
        lowerColName.includes('улица') ||
        lowerColName.includes('street') ||
        lowerColName.includes('место') ||
        lowerColName.includes('location') ||
        lowerColName.includes('пункт') ||
        lowerColName.includes('point'));

    // Исключаем известные не-адресные колонки, ТОЛЬКО если это не явная колонка адреса
    if (!isExplicitAddressColumn && excludeCols.some(excl => lowerColName.includes(excl))) {
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
      /исполнен|доставляется|в обработке/i,
      /^[а-яёіїєa-z]{3,15}\s+\d{1,2}[\.\/]\d{1,2}[\.\/]\d{2,4}/i,
      /^[а-яёіїєa-z]{3,15}\s+\d{1,2}[\.\/]\d{1,2}\s+[а-яёіїєa-z]{2,5}$/i,
      /контроль|шеф|дн$/i,
      /^[а-яёіїєa-z]{3,20}$/i
    ]

    for (const pattern of invalidPatterns) {
      if (pattern.test(lowerStr)) {
        return false
      }
    }

    const addressMarkers = [
      /\b(вул|вулиця|улица|ул\.?|проспект|просп\.?|провулок|пров\.?|бульвар|бул\.?|линия|лінія|лін|площа|площадь|пл\.?|пер\.?|переулок|str|street)\b/i,
      /\b\d+[а-яa-z]?[,\s]/,
      /\b\d+[а-яa-z]?$/,
      /\b(киев|київ|kiev|kyiv|одесса|одеса|харьков|харків|полтава|украина|ukraine)\b/i,
      /\b(под\.?|подъезд|під\.?|під'їзд|д\/ф|д\.ф|кв\.?|квартира|эт\.?|этаж|етаж|floor|л\/с|л\.с|кл|apartment|habteka)\b/i
    ]

    const hasAddressMarker = addressMarkers.some(pattern => pattern.test(lowerStr))
    const isNotPhone = !/^[\d\+\-\(\)\s]+$/.test(str)
    const isNotEmail = !/^[\w\.-]+@[\w\.-]+\.\w+$/.test(str)
    const isNotOnlyNumber = !/^\d+$/.test(str)
    const hasText = str.length > 2 && /[а-яА-ЯёЁіІїЇєЄa-zA-Z]/.test(str)
    const hasNumber = /\d/.test(str)

    if (isExplicitAddressColumn && hasText) {
      if (isNotPhone && isNotEmail && isNotOnlyNumber) {
        return true;
      }
    }

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
