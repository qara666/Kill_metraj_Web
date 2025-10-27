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
  const headers = jsonData[0] as string[]
  const rows = jsonData.slice(1) as any[][]
  
  const orders: any[] = []
  const couriers: any[] = []
  const paymentMethods: any[] = []
  const errors: any[] = []
  
  // Логируем заголовки для отладки
  console.log('Заголовки Excel:', headers)
  
  rows.forEach((row, index) => {
    try {
      const rowData = createRowData(row, headers)
      
      // Если есть номер заказа (7-значное число), считаем это заказом
      const orderNumber = findOrderNumber(rowData)
      if (orderNumber) {
        orders.push(createOrderFromData(rowData, orderNumber, index))
        return
      }
      
      if (isOrderRow(rowData)) {
        orders.push(createOrder(rowData, index))
      } else if (isCourierRow(rowData)) {
        couriers.push(createCourier(rowData, index))
      } else if (isPaymentMethodRow(rowData)) {
        paymentMethods.push(createPaymentMethod(rowData, index))
      } else {
        errors.push({
          row: index + 2,
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
  const address = Object.values(rowData).find((val: any) => 
    val && typeof val === 'string' && val.length > 10 && /[а-яА-Я]/.test(val)
  ) || ''
  
  return {
    id: `order_${Date.now()}_${index}`,
    orderNumber,
    address: String(address).trim(),
    courier: getValue(rowData, ['курьер', 'courier', 'курьер_имя']) || '',
    amount: parseFloat(getValue(rowData, ['сумма', 'amount', 'цена', 'price', 'стоимость'])) || 0,
    phone: getValue(rowData, ['телефон', 'phone', 'телефон_клиента']) || '',
    customerName: getValue(rowData, ['клиент', 'customer', 'имя_клиента', 'имя']) || '',
    plannedTime: getValue(rowData, ['время', 'time', 'плановое_время']) || '',
    isSelected: false,
    isInRoute: false
  }
}
