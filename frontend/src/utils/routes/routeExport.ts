// Утилиты для экспорта маршрутов в разные форматы

export interface RouteExportData {
  route: any
  orders: any[]
  startAddress: string
  endAddress: string
  startCoords?: { lat: number, lng: number }
  endCoords?: { lat: number, lng: number }
}

// Очистка адреса от лишних деталей для карт
const cleanAddressForMaps = (address: string): string => {
  if (!address) return ''
  // Удаляем всё после ключевых слов: под., кв., эт. и т.д.
  return address
    .replace(/[,?\s]*(под\.|подъезд|кв\.|квартира|эт\.|этаж|оф\.|офис|д\/ф|код|вход|корп\.|корпус).*$/i, '')
    .trim()
}

// Экспорт в Google Maps
export const exportToGoogleMaps = (data: RouteExportData): string => {
  const { route, orders, startAddress, endAddress, startCoords, endCoords } = data
  
  const getPoint = (item: any, fallbackStr?: string): string => {
    if (item?.coords?.lat && item?.coords?.lng) {
      return `${item.coords.lat},${item.coords.lng}`
    }
    const addr = item?.address || fallbackStr || ''
    return encodeURIComponent(cleanAddressForMaps(addr))
  }

  // Helper to get valid coordinates
  const getCoordStr = (obj: any): string | null => {
    if (!obj) return null
    const lat = obj.lat ?? obj.latitude
    const lng = obj.lng ?? obj.lon ?? obj.longitude
    if (typeof lat === 'number' && typeof lng === 'number' && !isNaN(lat) && !isNaN(lng)) {
      return `${lat},${lng}`
    }
    return null
  }

  // v35.9.27: Using Google Maps Directions API URL format for better stability
  if (route.geoMeta) {
    const origin = getCoordStr(route.geoMeta.origin) || (startCoords ? `${startCoords.lat},${startCoords.lng}` : null)
    const destination = getCoordStr(route.geoMeta.destination) || (endCoords ? `${endCoords.lat},${endCoords.lng}` : null)
    
    if (!origin || !destination) {
      // Fallback to non-geoMeta path
    } else {
      const wpList = (route.geoMeta.waypoints || [])
        .map((wp: any) => getCoordStr(wp))
        .filter(Boolean)
        
      if (wpList.length > 0) {
        const waypoints = wpList.join('/')
        return `https://www.google.com/maps/dir/${origin}/${waypoints}/${destination}`
      } else {
        return `https://www.google.com/maps/dir/${origin}/${destination}`
      }
    }
  }

  // Fallback to addresses/coords if geoMeta is missing or invalid
  const origin = startCoords ? `${startCoords.lat},${startCoords.lng}` : getPoint(null, startAddress)
  const destination = endCoords ? `${endCoords.lat},${endCoords.lng}` : getPoint(null, endAddress)
  const waypoints = orders
    .map((order, idx) => getPoint(order, route.routeChain?.[idx]))
    .filter(Boolean)
    .join('/')
  
  return `https://www.google.com/maps/dir/${origin}/${waypoints}/${destination}`
}

// ЭКСПОРТ В GRAPHHOPPER (Ранее Valhalla/OSRM — GraphHopper лучше поддерживает параметры профиля в URL)
export const exportToValhalla = (data: RouteExportData): string => {
  const { route, orders, startCoords, endCoords } = data
  
  const locs: {lat: number, lon: number}[] = []
  
  // Helper to get valid coordinates from various sources
  const getValidCoord = (obj: any): { lat: number, lon: number } | null => {
    if (!obj) return null
    const lat = obj.lat ?? obj.latitude
    const lon = obj.lon ?? obj.lng ?? obj.longitude
    if (typeof lat === 'number' && typeof lon === 'number' && !isNaN(lat) && !isNaN(lon)) {
      return { lat, lon }
    }
    return null
  }
  
  // Add start point (prefer geoMeta.origin, fallback to startCoords)
  const startCoord = getValidCoord(route.geoMeta?.origin) || getValidCoord(startCoords)
  if (startCoord) {
    locs.push(startCoord)
  }

  // Add waypoints from geoMeta if available
  if (route.geoMeta?.waypoints && Array.isArray(route.geoMeta.waypoints)) {
    route.geoMeta.waypoints.forEach((wp: any) => {
      const coord = getValidCoord(wp)
      if (coord) locs.push(coord)
    })
  } else {
    // Fallback: add orders as waypoints
    orders.forEach(o => {
      const coord = getValidCoord(o.coords) || getValidCoord(o)
      if (coord) locs.push(coord)
    })
  }

  // Add end point (prefer geoMeta.destination, fallback to endCoords)
  const endCoord = getValidCoord(route.geoMeta?.destination) || getValidCoord(endCoords)
  if (endCoord) {
    locs.push(endCoord)
  }

  if (locs.length > 0) {
    // GraphHopper format: point=lat,lon&profile=car
    const locParams = locs.map(l => `point=${l.lat.toFixed(6)},${l.lon.toFixed(6)}`).join('&')
    return `https://graphhopper.com/maps/?${locParams}&profile=car&layer=Omniscale`
  }

  return 'https://graphhopper.com/maps/'
}

/**
 * Экспорт в Visicom Maps (самый точный картографический сервис для Украины)
 * Показывает номера домов там, где другие сервисы могут ошибаться.
 */
export const exportToVisicom = (data: RouteExportData): string => {
  const { route, orders, startCoords, endCoords } = data
  
  const locs: {lat: number, lon: number}[] = []

  // Helper to get valid coordinates from various sources
  const getValidCoord = (obj: any): { lat: number, lon: number } | null => {
    if (!obj) return null
    const lat = obj.lat ?? obj.latitude
    const lon = obj.lon ?? obj.lng ?? obj.longitude
    if (typeof lat === 'number' && typeof lon === 'number' && !isNaN(lat) && !isNaN(lon)) {
      return { lat, lon }
    }
    return null
  }
  
  // Add start point (prefer geoMeta.origin, fallback to startCoords)
  const startCoord = getValidCoord(route.geoMeta?.origin) || getValidCoord(startCoords)
  if (startCoord) {
    locs.push(startCoord)
  }

  // Add waypoints from geoMeta if available
  if (route.geoMeta?.waypoints && Array.isArray(route.geoMeta.waypoints)) {
    route.geoMeta.waypoints.forEach((wp: any) => {
      const coord = getValidCoord(wp)
      if (coord) locs.push(coord)
    })
  } else {
    // Fallback: add orders as waypoints
    orders.forEach(o => {
      const coord = getValidCoord(o.coords) || getValidCoord(o)
      if (coord) locs.push(coord)
    })
  }

  // Add end point (prefer geoMeta.destination, fallback to endCoords)
  const endCoord = getValidCoord(route.geoMeta?.destination) || getValidCoord(endCoords)
  if (endCoord) {
    locs.push(endCoord)
  }

  const validLocs = locs.filter(l => l.lat && l.lon)
  if (validLocs.length === 0) return 'https://maps.visicom.ua/'

  // Visicom использует формат: lon,lat;lon,lat (разделитель ;)
  const points = locs.map(l => `${l.lon.toFixed(6)},${l.lat.toFixed(6)}`).join(';')
  return `https://maps.visicom.ua/uk/route?points=${points}&engine=car`
}

// Экспорт в Waze
export const exportToWaze = (data: RouteExportData): string => {
  const { orders, startAddress } = data
  
  // Waze использует координаты, но можно использовать адрес первого заказа
  const firstOrder = orders[0]
  if (!firstOrder) return ''
  
  const address = firstOrder.address || startAddress
  const encodedAddress = encodeURIComponent(address)
  
  // Waze navigation URL
  const url = `https://www.waze.com/ul?q=${encodedAddress}&navigate=yes`
  return url
}

// Экспорт в текстовый формат для копирования
export const exportToText = (data: RouteExportData): string => {
  const { route, orders, startAddress, endAddress } = data
  
  let text = `МАРШРУТ: ${route.name || 'Без названия'}\n`
  text += `Дата: ${new Date().toLocaleString('ru-RU')}\n`
  text += `\nСТАРТ: ${startAddress}\n\n`
  
  orders.forEach((order, idx) => {
    const orderNum = order.orderNumber || route.orderNumbers?.[idx] || `${idx + 1}`
    text += `${idx + 1}. Заказ #${orderNum}\n`
    text += `   Адрес: ${order.address || route.routeChain?.[idx] || 'Не указан'}\n`
    
    if (order.readyAt) {
      text += `   Готовность: ${new Date(order.readyAt).toLocaleTimeString('ru-RU')}\n`
    }
    if (order.deadlineAt) {
      text += `   Дедлайн: ${new Date(order.deadlineAt).toLocaleTimeString('ru-RU')}\n`
    }
    text += `\n`
  })
  
  text += `\nФИНИШ: ${endAddress}\n`
  text += `\nОбщая информация:\n`
  text += `- Заказов: ${orders.length}\n`
  text += `- Расстояние: ${route.totalDistanceKm || '?'} км\n`
  text += `- Время: ${route.totalDurationMin || '?'} мин\n`
  
  return text
}

// Экспорт в JSON
export const exportToJSON = (data: RouteExportData): string => {
  const { route, orders, startAddress, endAddress } = data
  
  const exportData = {
    routeName: route.name,
    timestamp: new Date().toISOString(),
    startAddress,
    endAddress,
    orders: orders.map((order, idx) => ({
      orderNumber: order.orderNumber || route.orderNumbers?.[idx] || `${idx + 1}`,
      address: order.address || route.routeChain?.[idx] || '',
      readyAt: order.readyAt ? new Date(order.readyAt).toISOString() : null,
      deadlineAt: order.deadlineAt ? new Date(order.deadlineAt).toISOString() : null,
      position: idx + 1
    })),
    stats: {
      totalOrders: orders.length,
      totalDistance: route.totalDistanceKm,
      totalDuration: route.totalDurationMin,
      efficiency: route.routeEfficiency
    }
  }
  
  return JSON.stringify(exportData, null, 2)
}

// Экспорт в CSV
export const exportToCSV = (data: RouteExportData): string => {
  const { route, orders } = data
  
  let csv = 'Позиция,Номер заказа,Адрес,Готовность,Дедлайн\n'
  
  orders.forEach((order, idx) => {
    const orderNum = order.orderNumber || route.orderNumbers?.[idx] || `${idx + 1}`
    const address = (order.address || route.routeChain?.[idx] || '').replace(/"/g, '""')
    const readyAt = order.readyAt ? new Date(order.readyAt).toLocaleTimeString('ru-RU') : ''
    const deadlineAt = order.deadlineAt ? new Date(order.deadlineAt).toLocaleTimeString('ru-RU') : ''
    
    csv += `${idx + 1},"${orderNum}","${address}","${readyAt}","${deadlineAt}"\n`
  })
  
  return csv
}

// Скачать файл
export const downloadFile = (content: string, filename: string, mimeType: string = 'text/plain'): void => {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Экспорт в PDF (используя window.print или библиотеку)
export const exportToPDF = async (data: RouteExportData): Promise<void> => {
  // Простой вариант - открыть окно печати
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    alert('Не удалось открыть окно для печати. Разрешите всплывающие окна.')
    return
  }

  const html = generatePDFHTML(data)
  printWindow.document.write(html)
  printWindow.document.close()
  printWindow.focus()
  
  // Даем время на загрузку, затем печать
  setTimeout(() => {
    printWindow.print()
  }, 250)
}

const generatePDFHTML = (data: RouteExportData): string => {
  const { route, orders, startAddress, endAddress } = data
  
  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Маршрут: ${route.name || 'Без названия'}</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; }
        h1 { color: #2563eb; }
        .route-info { background: #f3f4f6; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        .order { margin: 15px 0; padding: 10px; border-left: 4px solid #3b82f6; }
        .stats { margin-top: 20px; padding: 15px; background: #eff6ff; border-radius: 8px; }
        @media print {
          body { padding: 10px; }
          .no-print { display: none; }
        }
      </style>
    </head>
    <body>
      <h1>Маршрут: ${route.name || 'Без названия'}</h1>
      <div class="route-info">
        <p><strong>Дата:</strong> ${new Date().toLocaleString('ru-RU')}</p>
        <p><strong>Старт:</strong> ${startAddress}</p>
        <p><strong>Финиш:</strong> ${endAddress}</p>
      </div>
      <h2>Заказы:</h2>
  `
  
  orders.forEach((order, idx) => {
    const orderNum = order.orderNumber || route.orderNumbers?.[idx] || `${idx + 1}`
    html += `
      <div class="order">
        <h3>${idx + 1}. Заказ #${orderNum}</h3>
        <p><strong>Адрес:</strong> ${order.address || route.routeChain?.[idx] || 'Не указан'}</p>
    `
    
    if (order.readyAt) {
      html += `<p><strong>Готовность:</strong> ${new Date(order.readyAt).toLocaleTimeString('ru-RU')}</p>`
    }
    if (order.deadlineAt) {
      html += `<p><strong>Дедлайн:</strong> ${new Date(order.deadlineAt).toLocaleTimeString('ru-RU')}</p>`
    }
    
    html += `</div>`
  })
  
  html += `
      <div class="stats">
        <h3>Статистика:</h3>
        <p>Заказов: ${orders.length}</p>
        <p>Расстояние: ${route.totalDistanceKm || '?'} км</p>
        <p>Время: ${route.totalDurationMin || '?'} мин</p>
        ${route.routeEfficiency ? `<p>Эффективность: ${(route.routeEfficiency * 100).toFixed(0)}%</p>` : ''}
      </div>
    </body>
    </html>
  `
  
  return html
}

