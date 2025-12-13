/**
 * Парсер HTML страниц для извлечения данных таблиц
 * Обрабатывает HTML так же, как Excel файлы
 */

import { ProcessedExcelData, processJsonData } from './excelProcessor'

// Функция для извлечения текста из ячейки с правильной кодировкой
const extractCellText = (cell: HTMLTableCellElement): string => {
  // Пробуем разные способы извлечения текста
  let text = ''
  
  // Сначала пробуем textContent (предпочтительно)
  if (cell.textContent) {
    text = cell.textContent
  } else if (cell.innerText) {
    text = cell.innerText
  } else if (cell.textContent !== null) {
    text = String(cell.textContent)
  }
  
  // Очищаем текст от лишних пробелов и переносов строк
  text = text.trim().replace(/\s+/g, ' ').replace(/\n+/g, ' ')
  
  return text
}

// Общая функция парсинга HTML таблицы в структуру Excel
const parseHtmlTableToJson = (htmlText: string): any[][] => {
  // Убеждаемся, что HTML текст правильно декодирован
  // Если текст содержит BOM или неправильную кодировку, пытаемся исправить
  let processedHtml = htmlText
  
  // Удаляем BOM если есть
  if (processedHtml.charCodeAt(0) === 0xFEFF) {
    processedHtml = processedHtml.slice(1)
  }
  
  // Пробуем определить кодировку из мета-тегов
  const charsetMatch = processedHtml.match(/<meta[^>]+charset=["']?([^"'\s>]+)/i)
  const detectedCharset = charsetMatch ? charsetMatch[1].toLowerCase() : 'utf-8'
  
  console.log(`📋 [HTML Processor] Обнаруженная кодировка из мета-тегов: ${detectedCharset}`)
  
  // Если кодировка не UTF-8, пытаемся конвертировать (но это сложно в браузере)
  // В большинстве случаев современные браузеры автоматически декодируют правильно
  const parser = new DOMParser()
  const doc = parser.parseFromString(processedHtml, 'text/html')

  // Проверяем на ошибки парсинга
  const parserError = doc.querySelector('parsererror')
  if (parserError) {
    console.warn('⚠️ [HTML Processor] Ошибка парсинга HTML, но продолжаем:', parserError.textContent)
  }

  // Ищем таблицы в HTML
  const tables = doc.querySelectorAll('table')

  if (tables.length === 0) {
    throw new Error('В HTML странице не найдено таблиц')
  }

  // Берем первую таблицу (или самую большую)
  let targetTable: HTMLTableElement | null = null
  let maxRows = 0

  tables.forEach((table) => {
    const rows = table.querySelectorAll('tr')
    if (rows.length > maxRows) {
      maxRows = rows.length
      targetTable = table as HTMLTableElement
    }
  })

  if (!targetTable) {
    throw new Error('Не удалось найти таблицу в HTML')
  }

  const jsonData: any[][] = []
  const table: HTMLTableElement = targetTable
  const rows = table.querySelectorAll('tr') as NodeListOf<HTMLTableRowElement>

  rows.forEach((row: HTMLTableRowElement) => {
    const cells: any[] = []
    
    // Получаем все ячейки строки (и th, и td)
    const allCellsInRow: HTMLTableCellElement[] = []
    
    // Сначала th (заголовки)
    const thCells = row.querySelectorAll('th')
    thCells.forEach(cell => allCellsInRow.push(cell as HTMLTableCellElement))
    
    // Потом td (данные)
    const tdCells = row.querySelectorAll('td')
    tdCells.forEach(cell => allCellsInRow.push(cell as HTMLTableCellElement))
    
    // Если нет ни th, ни td, пропускаем строку
    if (allCellsInRow.length === 0) {
      return
    }

    allCellsInRow.forEach((cell: HTMLTableCellElement) => {
      const cellText = extractCellText(cell)
      const colspan = parseInt(cell.getAttribute('colspan') || '1', 10)
      
      cells.push(cellText)

      // Добавляем пустые ячейки для colspan
      for (let i = 1; i < colspan; i++) {
        cells.push('')
      }
    })

    // Добавляем строку только если в ней есть хотя бы одна непустая ячейка
    if (cells.length > 0 && cells.some(cell => cell !== '')) {
      jsonData.push(cells)
    }
  })

  if (jsonData.length < 2) {
    throw new Error('Таблица должна содержать заголовки и данные (минимум 2 строки)')
  }

  // Логируем первые строки для диагностики
  console.log(`📋 [HTML Processor] Извлечено ${jsonData.length} строк из таблицы`)
  if (jsonData.length > 0) {
    console.log(`📋 [HTML Processor] Первая строка (заголовки, первые 15):`, jsonData[0].slice(0, 15).map((v, i) => {
      const val = String(v).substring(0, 50)
      const hasCyrillic = /[а-яА-ЯёЁіІїЇєЄ]/.test(val)
      const charCodes = val.split('').slice(0, 10).map(c => c.charCodeAt(0).toString(16)).join(' ')
      return `${i}: "${val}" [кириллица: ${hasCyrillic}, коды: ${charCodes}]`
    }))
  }
  if (jsonData.length > 1) {
    console.log(`📋 [HTML Processor] Вторая строка (данные, первые 15):`, jsonData[1].slice(0, 15).map((v, i) => {
      const val = String(v).substring(0, 50)
      return `${i}: "${val}"`
    }))
  }

  return jsonData
}

/**
 * Обработка HTML страницы по URL
 * Извлекает таблицы и преобразует их в формат, совместимый с Excel процессором
 */
export const processHtmlUrl = async (url: string): Promise<ProcessedExcelData> => {
  try {
    const parsedUrl = new URL(url)
    const isFileProtocol = parsedUrl.protocol === 'file:'

    // Загружаем HTML страницу
    const response = await fetch(
      url,
      isFileProtocol
        ? undefined
        : {
            mode: 'cors',
            headers: {
              Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
          },
    )
    
    if (!response.ok) {
      throw new Error(`Ошибка загрузки HTML: ${response.status} ${response.statusText}`)
    }
    
    // Читаем как текст с правильной кодировкой
    // response.text() автоматически декодирует UTF-8
    const htmlText = await response.text()
    const jsonData = parseHtmlTableToJson(htmlText)

    console.log(`✅ [HTML Processor] Извлечено ${jsonData.length} строк из HTML таблицы`)

    // Используем тот же процессор, что и для Excel
    return processJsonData(jsonData)
  } catch (error: any) {
    console.error('Ошибка обработки HTML:', error)
    const msg = error?.message || 'Неизвестная ошибка'
    // Для file:// поясняем ограничение браузера
    if (url.startsWith('file://')) {
      throw new Error(
        `Локальные файлы по file:// браузер блокирует. Выберите HTML файл через кнопку загрузки внизу или перетащите его мышью. Ошибка: ${msg}`,
      )
    }
    throw new Error(`Ошибка обработки HTML страницы: ${msg}`)
  }
}

/**
 * Валидация URL
 */
export const isValidUrl = (urlString: string): boolean => {
  try {
    const url = new URL(urlString)
    return url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'file:'
  } catch {
    return false
  }
}

/**
 * Определение кодировки из HTML мета-тегов
 */
const detectCharsetFromHtml = (htmlBytes: Uint8Array): string => {
  // Читаем первые 4096 байт для поиска мета-тегов
  const preview = new TextDecoder('latin1').decode(htmlBytes.slice(0, Math.min(4096, htmlBytes.length)))
  const charsetMatch = preview.match(/<meta[^>]+charset=["']?([^"'\s>]+)/i)
  if (charsetMatch) {
    return charsetMatch[1].toLowerCase()
  }
  return 'utf-8' // По умолчанию UTF-8
}

/**
 * Декодирование HTML с правильной кодировкой
 */
const decodeHtmlWithCharset = async (arrayBuffer: ArrayBuffer): Promise<string> => {
  const bytes = new Uint8Array(arrayBuffer)
  
  // Сначала пробуем определить кодировку из мета-тегов
  let detectedCharset = detectCharsetFromHtml(bytes)
  console.log(`📋 [HTML Processor] Обнаруженная кодировка из мета-тегов: ${detectedCharset}`)
  
  // Список кодировок для попытки декодирования
  const charsetsToTry = [
    detectedCharset, // Сначала пробуем обнаруженную
    'utf-8',
    'windows-1251', // Кириллица Windows
    'cp1251', // Альтернативное название
    'iso-8859-5', // Кириллица ISO
    'koi8-r', // Кириллица KOI8
  ]
  
  // Убираем дубликаты
  const uniqueCharsets = [...new Set(charsetsToTry)]
  
  for (const charset of uniqueCharsets) {
    try {
      const decoder = new TextDecoder(charset, { fatal: true })
      const decoded = decoder.decode(arrayBuffer)
      
      // Проверяем, что декодирование прошло успешно
      // Проверяем наличие кириллицы или нормальных символов
      const hasCyrillic = /[а-яА-ЯёЁіІїЇєЄ]/.test(decoded)
      const hasNormalChars = /[a-zA-Z0-9\s]/.test(decoded)
      
      // Проверяем на кракозябры - если много нечитаемых символов, это плохо
      // Кракозябры обычно содержат много символов вне ASCII и кириллицы
      const suspiciousChars = decoded.match(/[^\x00-\x7Fа-яА-ЯёЁіІїЇєЄ\s]/g)
      const suspiciousRatio = suspiciousChars ? suspiciousChars.length / decoded.length : 0
      
      // Если есть кириллица или нормальные символы, и мало подозрительных символов
      if ((hasCyrillic || hasNormalChars) && suspiciousRatio < 0.3) {
        console.log(`✅ [HTML Processor] Успешно декодировано с кодировкой: ${charset} (кириллица: ${hasCyrillic}, подозрительных: ${(suspiciousRatio * 100).toFixed(1)}%)`)
        return decoded
      }
    } catch (e) {
      // Пробуем следующую кодировку
      console.log(`⚠️ [HTML Processor] Не удалось декодировать с ${charset}, пробуем следующую...`)
      continue
    }
  }
  
  // Если ничего не помогло, пробуем UTF-8 с игнорированием ошибок
  console.warn(`⚠️ [HTML Processor] Не удалось определить кодировку, используем UTF-8 с игнорированием ошибок`)
  const decoder = new TextDecoder('utf-8', { fatal: false })
  return decoder.decode(arrayBuffer)
}

/**
 * Обработка локального HTML файла (через input/drag&drop)
 * Использует тот же процессор, что и для Excel файлов
 */
export const processHtmlFile = async (file: File): Promise<ProcessedExcelData> => {
  try {
    // Читаем файл как ArrayBuffer для правильной обработки кодировки
    const arrayBuffer = await file.arrayBuffer()
    
    // Декодируем с правильной кодировкой
    const text = await decodeHtmlWithCharset(arrayBuffer)
    
    // Логируем первые символы для диагностики
    if (text.length > 0) {
      const firstChars = text.substring(0, 200)
      console.log(`📋 [HTML Processor] Первые 200 символов декодированного файла:`, firstChars)
      
      // Проверяем наличие кириллицы
      const hasCyrillic = /[а-яА-ЯёЁіІїЇєЄ]/.test(text)
      console.log(`📋 [HTML Processor] Найдена кириллица: ${hasCyrillic}`)
    }
    
    const jsonData = parseHtmlTableToJson(text)
    console.log(`✅ [HTML Processor] Извлечено ${jsonData.length} строк из локального HTML`)

    // Используем тот же процессор, что и для Excel - processJsonData
    return processJsonData(jsonData)
  } catch (error: any) {
    console.error('Ошибка обработки локального HTML файла:', error)
    throw new Error(`Ошибка обработки HTML файла: ${error?.message || 'Неизвестная ошибка'}`)
  }
}
