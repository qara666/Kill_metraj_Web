/**
 * Парсер HTML страниц для извлечения данных таблиц
 * Обрабатывает HTML так же, как Excel файлы
 */

import { ProcessedExcelData, processJsonData } from './excelProcessor'

/**
 * Обработка HTML страницы по URL
 * Извлекает таблицы и преобразует их в формат, совместимый с Excel процессором
 */
export const processHtmlUrl = async (url: string): Promise<ProcessedExcelData> => {
  try {
    // Загружаем HTML страницу
    const response = await fetch(url, {
      mode: 'cors',
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    })
    
    if (!response.ok) {
      throw new Error(`Ошибка загрузки HTML: ${response.status} ${response.statusText}`)
    }
    
    const htmlText = await response.text()
    
    // Парсим HTML
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
    
    // Преобразуем HTML таблицу в массив массивов (как Excel)
    const jsonData: any[][] = []
    
    const rows = targetTable.querySelectorAll('tr')
    rows.forEach((row) => {
      const cells: any[] = []
      const thCells = row.querySelectorAll('th')
      const tdCells = row.querySelectorAll('td')
      
      // Обрабатываем th (заголовки) и td (данные)
      const allCells = thCells.length > 0 ? thCells : tdCells
      
      allCells.forEach((cell) => {
        // Получаем текст ячейки, убираем лишние пробелы
        let cellText = cell.textContent || cell.innerText || ''
        cellText = cellText.trim().replace(/\s+/g, ' ')
        
        // Проверяем colspan и rowspan
        const colspan = parseInt(cell.getAttribute('colspan') || '1', 10)
        
        cells.push(cellText)
        
        // Добавляем пустые ячейки для colspan
        for (let i = 1; i < colspan; i++) {
          cells.push('')
        }
      })
      
      // Добавляем строку только если в ней есть данные
      if (cells.length > 0 && cells.some(cell => cell !== '')) {
        jsonData.push(cells)
      }
    })
    
    if (jsonData.length < 2) {
      throw new Error('Таблица должна содержать заголовки и данные (минимум 2 строки)')
    }
    
    console.log(`✅ [HTML Processor] Извлечено ${jsonData.length} строк из HTML таблицы`)
    console.log(`📋 [HTML Processor] Первые 3 строки:`, jsonData.slice(0, 3))
    
    // Используем существующий процессор Excel для обработки данных
    const result = processJsonData(jsonData)
    
    return result
  } catch (error: any) {
    console.error('Ошибка обработки HTML:', error)
    throw new Error(`Ошибка обработки HTML страницы: ${error.message || 'Неизвестная ошибка'}`)
  }
}

/**
 * Валидация URL
 */
export const isValidUrl = (urlString: string): boolean => {
  try {
    const url = new URL(urlString)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}
