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
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    
    reader.onload = (e) => {
      try {
        const data = e.target?.result
        if (!data) {
          throw new Error('Не удалось прочитать файл')
        }

        // Читаем Excel файл
        const workbook = XLSX.read(data, { type: 'binary' })
        const sheetNames = workbook.SheetNames
        
        if (sheetNames.length === 0) {
          throw new Error('В файле нет листов')
        }

        // Обрабатываем первый лист
        const firstSheetName = sheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
        
        if (jsonData.length < 2) {
          throw new Error('Файл должен содержать заголовки и данные')
        }

        // Первая строка - заголовки
        const headers = jsonData[0] as string[]
        const rows = jsonData.slice(1) as any[][]
        
        console.log('Заголовки:', headers)
        console.log('Количество строк данных:', rows.length)

        // Обрабатываем данные
        const orders: any[] = []
        const couriers: any[] = []
        const paymentMethods: any[] = []
        const errors: any[] = []

        // Создаем карту индексов колонок (для будущего использования)
        // const columnMap = createColumnMap(headers)
        
        rows.forEach((row, index) => {
          try {
            const rowData = createRowData(row, headers)
            
            // Определяем тип записи по содержимому
            if (isOrderRow(rowData)) {
              orders.push(createOrder(rowData, index))
            } else if (isCourierRow(rowData)) {
              couriers.push(createCourier(rowData, index))
            } else if (isPaymentMethodRow(rowData)) {
              paymentMethods.push(createPaymentMethod(rowData, index))
            } else {
              errors.push({
                row: index + 2, // +2 потому что индексация с 0 и пропускаем заголовок
                message: 'Не удалось определить тип записи',
                data: rowData
              })
            }
          } catch (error) {
            errors.push({
              row: index + 2,
              message: `Ошибка обработки строки: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
              data: row
            })
          }
        })

        const result: ProcessedExcelData = {
          orders,
          couriers,
          paymentMethods,
          routes: [], // Маршруты создаются отдельно
          errors,
          summary: {
            totalRows: rows.length,
            successfulGeocoding: 0,
            failedGeocoding: 0,
            orders: orders.length,
            couriers: couriers.length,
            paymentMethods: paymentMethods.length,
            errors: errors
          }
        }

        console.log('Обработанные данные:', result)
        resolve(result)
        
      } catch (error) {
        console.error('Ошибка обработки Excel файла:', error)
        reject(error)
      }
    }
    
    reader.onerror = () => {
      reject(new Error('Ошибка чтения файла'))
    }
    
    // Читаем файл как бинарные данные
    reader.readAsBinaryString(file)
  })
}


// Создает объект данных строки
const createRowData = (row: any[], headers: string[]): Record<string, any> => {
  const rowData: Record<string, any> = {}
  
  headers.forEach((header, index) => {
    if (header && row[index] !== undefined) {
      rowData[header] = row[index]
    }
  })
  
  return rowData
}

// Проверяет, является ли строка заказом
const isOrderRow = (rowData: Record<string, any>): boolean => {
  const hasOrderNumber = hasValue(rowData, ['номер', 'number', 'orderNumber'])
  const hasAddress = hasValue(rowData, ['адрес', 'address'])
  const hasAmount = hasValue(rowData, ['сумма', 'amount', 'цена'])
  
  return hasOrderNumber && hasAddress && hasAmount
}

// Проверяет, является ли строка курьером
const isCourierRow = (rowData: Record<string, any>): boolean => {
  const hasName = hasValue(rowData, ['имя', 'name', 'курьер', 'courier'])
  const hasPhone = hasValue(rowData, ['телефон', 'phone'])
  
  return hasName && hasPhone && !isOrderRow(rowData)
}

// Проверяет, является ли строка способом оплаты
const isPaymentMethodRow = (rowData: Record<string, any>): boolean => {
  const hasPaymentType = hasValue(rowData, ['оплата', 'payment', 'способ'])
  
  return hasPaymentType && !isOrderRow(rowData) && !isCourierRow(rowData)
}

// Проверяет наличие значения в указанных полях
const hasValue = (rowData: Record<string, any>, fields: string[]): boolean => {
  return fields.some(field => {
    const value = rowData[field]
    return value !== undefined && value !== null && value !== ''
  })
}

// Создает объект заказа
const createOrder = (rowData: Record<string, any>, index: number): any => {
  return {
    id: `order_${Date.now()}_${index}`,
    orderNumber: getValue(rowData, ['номер', 'number', 'orderNumber']) || `ORD-${index + 1}`,
    address: getValue(rowData, ['адрес', 'address']) || '',
    courier: getValue(rowData, ['курьер', 'courier']) || '',
    amount: parseFloat(getValue(rowData, ['сумма', 'amount', 'цена']) || '0'),
    phone: getValue(rowData, ['телефон', 'phone']) || '',
    customerName: getValue(rowData, ['клиент', 'customer', 'имя', 'name']) || '',
    plannedTime: getValue(rowData, ['время', 'time']) || '',
    isSelected: false,
    isInRoute: false
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
  for (const field of fields) {
    const value = rowData[field]
    if (value !== undefined && value !== null && value !== '') {
      return String(value).trim()
    }
  }
  return ''
}
