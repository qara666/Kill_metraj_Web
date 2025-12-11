/**
 * Парсер HTML страниц для извлечения данных таблиц
 * Обрабатывает HTML так же, как Excel файлы
 */

import { ProcessedExcelData, processJsonData } from './excelProcessor'

// Общая функция парсинга HTML таблицы в структуру Excel
const parseHtmlTableToJson = (htmlText: string): any[][] => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(htmlText, 'text/html')

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
    const thCells = row.querySelectorAll('th') as NodeListOf<HTMLTableCellElement>
    const tdCells = row.querySelectorAll('td') as NodeListOf<HTMLTableCellElement>

    const allCells: NodeListOf<HTMLTableCellElement> = thCells.length > 0 ? thCells : tdCells

    allCells.forEach((cell: HTMLTableCellElement) => {
      let cellText = cell.textContent || cell.innerText || ''
      cellText = cellText.trim().replace(/\s+/g, ' ')

      const colspan = parseInt(cell.getAttribute('colspan') || '1', 10)
      cells.push(cellText)

      for (let i = 1; i < colspan; i++) {
        cells.push('')
      }
    })

    if (cells.length > 0 && cells.some(cell => cell !== '')) {
      jsonData.push(cells)
    }
  })

  if (jsonData.length < 2) {
    throw new Error('Таблица должна содержать заголовки и данные (минимум 2 строки)')
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
    
    const htmlText = await response.text()
    const jsonData = parseHtmlTableToJson(htmlText)

    console.log(`✅ [HTML Processor] Извлечено ${jsonData.length} строк из HTML таблицы`)
    console.log(`📋 [HTML Processor] Первые 3 строки:`, jsonData.slice(0, 3))

    return processJsonData(jsonData)
  } catch (error: any) {
    console.error('Ошибка обработки HTML:', error)
    const msg = error?.message || 'Неизвестная ошибка'
    // Для file:// поясняем ограничение браузера
    if (url.startsWith('file://')) {
      throw new Error(
        `Не удалось прочитать локальный файл. Браузер может блокировать доступ по file://. Попробуйте загрузить файл через кнопку "Загрузить" или откройте страницу в локальном окружении (http://localhost). Ошибка: ${msg}`,
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
 * Обработка локального HTML файла (через input/drag&drop)
 */
export const processHtmlFile = async (file: File): Promise<ProcessedExcelData> => {
  try {
    const text = await file.text()
    const jsonData = parseHtmlTableToJson(text)
    console.log(`✅ [HTML Processor] Извлечено ${jsonData.length} строк из локального HTML`)
    console.log(`📋 [HTML Processor] Первые 3 строки:`, jsonData.slice(0, 3))
    return processJsonData(jsonData)
  } catch (error: any) {
    console.error('Ошибка обработки локального HTML файла:', error)
    throw new Error(`Ошибка обработки HTML файла: ${error?.message || 'Неизвестная ошибка'}`)
  }
}
