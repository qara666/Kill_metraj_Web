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
  let processedHtml = htmlText

  if (processedHtml.charCodeAt(0) === 0xFEFF) {
    processedHtml = processedHtml.slice(1)
  }

  const parser = new DOMParser()
  const doc = parser.parseFromString(processedHtml, 'text/html')

  const tables = doc.querySelectorAll('table')

  if (tables.length === 0) {
    throw new Error('В HTML странице не найдено таблиц')
  }

  // Ищем таблицу, которая наиболее вероятно содержит данные заказов
  // Критерии: наличие ключевых слов в заголовках или наибольшее количество ячеек
  let targetTable: HTMLTableElement | null = null
  let maxScore = -1

  tables.forEach((table) => {
    const rows = table.querySelectorAll('tr')
    const text = table.textContent?.toLowerCase() || ''

    // Оценка таблицы
    let score = rows.length * 2 // Базовые очки за количество строк

    // Бонус за ключевые слова
    const keywords = ['адрес', 'номер', 'заказ', 'время', 'курьер', 'сумма', 'телефон']
    keywords.forEach(kw => {
      if (text.includes(kw)) score += 50
    })

    // Штраф за слишком маленькие таблицы
    if (rows.length < 2) score -= 100

    if (score > maxScore) {
      maxScore = score
      targetTable = table as HTMLTableElement
    }
  })

  if (!targetTable) {
    throw new Error('Не удалось найти таблицу с данными в HTML')
  }

  const jsonData: any[][] = []
  const table: HTMLTableElement = targetTable
  const rows = Array.from(table.querySelectorAll('tr')) as HTMLTableRowElement[]

  // Матрица для отслеживания занятых ячеек (из-за rowspan и colspan)
  const occupied: { [key: string]: boolean } = {}

  rows.forEach((row, rowIndex) => {
    const cellsData: any[] = []
    let colIndex = 0

    const allCellsInRow = Array.from(row.querySelectorAll('th, td')) as HTMLTableCellElement[]

    allCellsInRow.forEach((cell) => {
      // Пропускаем уже занятые (из-за rowspan сверху) колонки
      while (occupied[`${rowIndex},${colIndex}`]) {
        cellsData[colIndex] = jsonData[rowIndex] ? jsonData[rowIndex][colIndex] : ''
        colIndex++
      }

      const cellText = extractCellText(cell)
      const rowspan = parseInt(cell.getAttribute('rowspan') || '1', 10)
      const colspan = parseInt(cell.getAttribute('colspan') || '1', 10)

      // Заполняем текущую ячейку и учитываем colspan/rowspan
      for (let r = 0; r < rowspan; r++) {
        for (let c = 0; c < colspan; c++) {
          const targetRow = rowIndex + r
          const targetCol = colIndex + c

          if (r === 0 && c === 0) {
            cellsData[targetCol] = cellText
          } else {
            // Для последующих строк/колонок помечаем как занятые
            occupied[`${targetRow},${targetCol}`] = true

            // Если мы в той же строке, но это colspan, добавляем пустую ячейку
            if (r === 0) {
              cellsData[targetCol] = ''
            }
          }
        }
      }

      colIndex += colspan
    })

    // Добавляем пустые значения для оставшихся занятых ячеек в конце строки
    // (на случай если rowspan идет до конца строки)
    // Но обычно в HTMLRowElement.cells это не нужно

    if (cellsData.length > 0 || Object.keys(cellsData).length > 0) {
      // Преобразуем разреженный массив в плотный для корректной работы процессора
      const denseRow: any[] = []
      const maxCol = Math.max(...Object.keys(cellsData).map(Number), -1)
      for (let i = 0; i <= maxCol; i++) {
        denseRow[i] = cellsData[i] || ''
      }

      if (denseRow.some(c => c !== '')) {
        jsonData[rowIndex] = denseRow
      }
    }
  })

  // Фильтруем пустые строки
  const finalJsonData = jsonData.filter(row => row && row.length > 0)

  if (finalJsonData.length < 2) {
    throw new Error('Таблица должна содержать заголовки и данные (минимум 2 строки)')
  }

  return finalJsonData
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
        return decoded
      }
    } catch (e) {
      // Пробуем следующую кодировку
      continue
    }
  }

  // Если ничего не помогло, пробуем UTF-8 с игнорированием ошибок
  console.warn(`️ [HTML Processor] Не удалось определить кодировку, используем UTF-8 с игнорированием ошибок`)
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

    const jsonData = parseHtmlTableToJson(text)

    // Используем тот же процессор, что и для Excel - processJsonData
    return processJsonData(jsonData)
  } catch (error: any) {
    console.error('Ошибка обработки локального HTML файла:', error)
    throw new Error(`Ошибка обработки HTML файла: ${error?.message || 'Неизвестная ошибка'}`)
  }
}
