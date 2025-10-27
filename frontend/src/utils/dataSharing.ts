import { compress, decompress } from 'lz-string'

export interface ShareableData {
  excelData: any
  routes: any[]
  timestamp: number
  version: string
}

export interface DataSharingUtils {
  encodeData: (data: ShareableData) => string
  decodeData: (encodedData: string) => ShareableData | null
  generateShareUrl: (data: ShareableData, baseUrl?: string) => string
  extractDataFromUrl: (url?: string) => ShareableData | null
  validateData: (data: any) => boolean
  createSimpleData: (data: ShareableData) => any
  isJsonSafe: (jsonString: string) => boolean
  isStringSafe: (str: string) => boolean
  encodeBase64: (str: string) => string
  createMinimalLink: (data: ShareableData) => string
}

// Создаем утилиты для обмена данными
export const dataSharingUtils: DataSharingUtils = {
  /**
   * Создает максимально упрощенную версию данных
   */
  createSimpleData: (data: ShareableData): any => {
    try {
      // Создаем только самые необходимые данные
      const simpleData = {
        o: data.excelData?.orders?.slice(0, 100).map((order: any) => ({
          i: String(order.id || '').substring(0, 50),
          n: String(order.orderNumber || '').substring(0, 20),
          a: String(order.address || '').substring(0, 100),
          c: String(order.courier || '').substring(0, 30),
          am: Number(order.amount) || 0,
          p: String(order.phone || '').substring(0, 20),
          cn: String(order.customerName || '').substring(0, 50),
          pt: String(order.plannedTime || '').substring(0, 20)
        })) || [],
        c: data.excelData?.couriers?.slice(0, 50).map((courier: any) => ({
          i: String(courier.id || '').substring(0, 50),
          n: String(courier.name || '').substring(0, 50),
          p: String(courier.phone || '').substring(0, 20),
          e: String(courier.email || '').substring(0, 50),
          vt: String(courier.vehicleType || 'car').substring(0, 10),
          ia: Boolean(courier.isActive)
        })) || [],
        r: data.routes?.slice(0, 50).map((route: any) => ({
          i: String(route.id || '').substring(0, 50),
          ci: String(route.courierId || '').substring(0, 50),
          o: (route.orders || []).slice(0, 20).map((order: any) => ({
            i: String(order.id || '').substring(0, 50),
            n: String(order.orderNumber || '').substring(0, 20),
            a: String(order.address || '').substring(0, 100)
          })),
          td: Number(route.totalDistance) || 0,
          tt: Number(route.totalTime) || 0
        })) || [],
        t: Date.now(),
        v: '2.0.0'
      }

      return simpleData
    } catch (error) {
      console.error('Ошибка создания простых данных:', error)
      return { t: Date.now(), v: '2.0.0' }
    }
  },

  /**
   * Проверяет безопасность JSON строки
   */
  isJsonSafe: (jsonString: string): boolean => {
    if (!jsonString || typeof jsonString !== 'string') return false
    
    // Проверяем на проблемные символы
    const dangerousChars = ['\u0000', '\uD800', '\uD801', '\uD802', '\uD803', '\uD804', '\uD805', '\uD806', '\uD807', '\uD808', '\uD809', '\uD80A', '\uD80B', '\uD80C', '\uD80D', '\uD80E', '\uD80F', '\uD810', '\uD811', '\uD812', '\uD813', '\uD814', '\uD815', '\uD816', '\uD817', '\uD818', '\uD819', '\uD81A', '\uD81B', '\uD81C', '\uD81D', '\uD81E', '\uD81F', '\uD820', '\uD821', '\uD822', '\uD823', '\uD824', '\uD825', '\uD826', '\uD827', '\uD828', '\uD829', '\uD82A', '\uD82B', '\uD82C', '\uD82D', '\uD82E', '\uD82F', '\uD830', '\uD831', '\uD832', '\uD833', '\uD834', '\uD835', '\uD836', '\uD837', '\uD838', '\uD839', '\uD83A', '\uD83B', '\uD83C', '\uD83D', '\uD83E', '\uD83F', '\uDFFF']
    
    for (const char of dangerousChars) {
      if (jsonString.includes(char)) {
        return false
      }
    }
    
    // Проверяем длину
    if (jsonString.length > 1000000) { // 1MB лимит
      return false
    }
    
    return true
  },

  /**
   * Проверяет безопасность строки
   */
  isStringSafe: (str: string): boolean => {
    if (!str || typeof str !== 'string') return false
    
    // Проверяем на ASCII символы и безопасные Unicode
    for (let i = 0; i < str.length; i++) {
      const charCode = str.charCodeAt(i)
      // Разрешаем только ASCII (0-127) и безопасные Unicode символы
      if (charCode < 32 || charCode > 126) {
        // Проверяем на безопасные Unicode диапазоны
        if (charCode < 160 || charCode > 1114111) {
          return false
        }
      }
    }
    
    return true
  },

  /**
   * Base64 кодирование с дополнительной защитой
   */
  encodeBase64: (str: string): string => {
    try {
      // Очищаем строку от проблемных символов
      const cleanStr = str
        .replace(/[^\x20-\x7E\u00A0-\u00FF\u0100-\u017F\u0180-\u024F\u1E00-\u1EFF]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
      
      // Кодируем в base64
      const base64 = btoa(unescape(encodeURIComponent(cleanStr)))
      return encodeURIComponent(base64)
    } catch (error) {
      console.error('Ошибка base64 кодирования:', error)
      throw new Error('Не удалось закодировать в base64')
    }
  },

  /**
   * Создает минимальную ссылку в случае полного провала
   */
  createMinimalLink: (data: ShareableData): string => {
    try {
      const minimalData = {
        t: Date.now(),
        v: '2.0.0',
        c: data.excelData?.orders?.length || 0,
        r: data.routes?.length || 0
      }
      
      const jsonString = JSON.stringify(minimalData)
      return dataSharingUtils.encodeBase64(jsonString)
    } catch (error) {
      console.error('Ошибка создания минимальной ссылки:', error)
      // Последний fallback - простая строка
      return encodeURIComponent('data=' + Date.now())
    }
  },

  /**
   * Кодирует данные в сжатую строку для URL (новая надежная версия)
   */
  encodeData: (data: ShareableData): string => {
    try {
      // Создаем максимально упрощенную версию данных
      const simpleData = dataSharingUtils.createSimpleData(data)
      
      // Конвертируем в JSON с дополнительной очисткой
      const jsonString = JSON.stringify(simpleData)
      
      // Проверяем JSON на безопасность
      if (!dataSharingUtils.isJsonSafe(jsonString)) {
        throw new Error('JSON небезопасен для кодирования')
      }
      
      // Пробуем сжатие
      try {
        const compressed = compress(jsonString, 9)
        if (compressed && dataSharingUtils.isStringSafe(compressed)) {
          return encodeURIComponent(compressed)
        }
      } catch (compressError) {
        console.log('Сжатие не удалось, используем base64')
      }
      
      // Fallback: base64 кодирование
      return dataSharingUtils.encodeBase64(jsonString)
      
    } catch (error) {
      console.error('Ошибка кодирования данных:', error)
      // Последний fallback: создаем минимальную ссылку
      return dataSharingUtils.createMinimalLink(data)
    }
  },

  /**
   * Декодирует данные из сжатой строки или base64
   */
  decodeData: (encodedData: string): ShareableData | null => {
    try {
      console.log('Начинаем декодирование данных...')
      
      // Декодируем из URL
      const decoded = decodeURIComponent(encodedData)
      console.log('Данные декодированы из URL, длина:', decoded.length)
      
      // Пробуем сначала распаковать как сжатые данные
      try {
        const jsonString = decompress(decoded)
        if (jsonString) {
          console.log('Данные распакованы, длина JSON:', jsonString.length)
          const data = JSON.parse(jsonString)
          console.log('JSON распарсен, структура:', Object.keys(data))
          const expandedData = dataSharingUtils.expandSimpleData(data)
          console.log('Данные расширены:', {
            orders: expandedData.excelData?.orders?.length || 0,
            couriers: expandedData.excelData?.couriers?.length || 0,
            routes: expandedData.routes?.length || 0
          })
          return expandedData
        }
      } catch (decompressError) {
        console.log('Не удалось распаковать как сжатые данные, пробуем base64:', decompressError)
      }
      
      // Если не получилось, пробуем как base64
      try {
        const jsonString = decodeURIComponent(escape(atob(decoded)))
        console.log('Данные декодированы как base64, длина JSON:', jsonString.length)
        const data = JSON.parse(jsonString)
        console.log('JSON распарсен, структура:', Object.keys(data))
        const expandedData = dataSharingUtils.expandSimpleData(data)
        console.log('Данные расширены:', {
          orders: expandedData.excelData?.orders?.length || 0,
          couriers: expandedData.excelData?.couriers?.length || 0,
          routes: expandedData.routes?.length || 0
        })
        return expandedData
      } catch (base64Error) {
        console.log('Не удалось декодировать как base64:', base64Error)
      }
      
      throw new Error('Не удалось декодировать данные ни одним методом')
    } catch (error) {
      console.error('Ошибка декодирования данных:', error)
      return null
    }
  },

  /**
   * Расширяет простые данные в полный формат
   */
  expandSimpleData: (simpleData: any): ShareableData => {
    // Если данные уже в полном формате, возвращаем как есть
    if (simpleData.excelData && simpleData.routes) {
      return simpleData
    }

    // Расширяем простые данные
    return {
      excelData: {
        orders: simpleData.o?.map((order: any) => ({
          id: order.i,
          orderNumber: order.n,
          address: order.a,
          courier: order.c,
          amount: order.am,
          phone: order.p,
          customerName: order.cn,
          plannedTime: order.pt,
          isSelected: false,
          isInRoute: false
        })) || [],
        couriers: simpleData.c?.map((courier: any) => ({
          id: courier.i,
          name: courier.n,
          phone: courier.p,
          email: courier.e,
          vehicleType: courier.vt,
          isActive: courier.ia
        })) || [],
        paymentMethods: [],
        errors: [],
        warnings: []
      },
      routes: simpleData.r?.map((route: any) => ({
        id: route.i,
        courierId: route.ci,
        orders: route.o?.map((order: any) => ({
          id: order.i,
          orderNumber: order.n,
          address: order.a,
          isSelected: false,
          isInRoute: true
        })) || [],
        totalDistance: route.td,
        totalTime: route.tt,
        createdAt: new Date().toISOString()
      })) || [],
      timestamp: simpleData.t,
      version: simpleData.v
    }
  },

  /**
   * Генерирует URL для обмена данными
   */
  generateShareUrl: (data: ShareableData, baseUrl?: string): string => {
    try {
      const encodedData = dataSharingUtils.encodeData(data)
      const url = new URL(baseUrl || window.location.origin + window.location.pathname)
      url.searchParams.set('shared_data', encodedData)
      return url.toString()
    } catch (error) {
      console.error('Ошибка генерации URL:', error)
      throw new Error('Не удалось создать ссылку для обмена')
    }
  },

  /**
   * Извлекает данные из URL
   */
  extractDataFromUrl: (url?: string): ShareableData | null => {
    try {
      const targetUrl = url || window.location.href
      const urlObj = new URL(targetUrl)
      const sharedData = urlObj.searchParams.get('shared_data')
      
      if (!sharedData) {
        return null
      }
      
      return dataSharingUtils.decodeData(sharedData)
    } catch (error) {
      console.error('Ошибка извлечения данных из URL:', error)
      return null
    }
  },

  /**
   * Валидирует данные
   */
  validateData: (data: any): boolean => {
    try {
      if (!data || typeof data !== 'object') {
        return false
      }
      
      // Проверяем наличие основных полей
      if (!data.excelData && !data.o) {
        return false
      }
      
      if (!Array.isArray(data.routes) && !Array.isArray(data.r)) {
        return false
      }
      
      return true
    } catch (error) {
      console.error('Ошибка валидации данных:', error)
      return false
    }
  }
}

// Хук для использования функций обмена данными
export const useDataSharing = () => {
  const shareData = (data: ShareableData): string => {
    return dataSharingUtils.generateShareUrl(data)
  }

  const importDataFromUrl = (url: string): ShareableData | null => {
    return dataSharingUtils.extractDataFromUrl(url)
  }

  const copyToClipboard = async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text)
        return true
      } else {
        // Fallback для старых браузеров
        const textArea = document.createElement('textarea')
        textArea.value = text
        textArea.style.position = 'fixed'
        textArea.style.left = '-999999px'
        textArea.style.top = '-999999px'
        document.body.appendChild(textArea)
        textArea.focus()
        textArea.select()
        const result = document.execCommand('copy')
        document.body.removeChild(textArea)
        return result
      }
    } catch (error) {
      console.error('Ошибка копирования в буфер обмена:', error)
      return false
    }
  }

  return {
    shareData,
    importDataFromUrl,
    copyToClipboard,
    validateData: dataSharingUtils.validateData
  }
}



