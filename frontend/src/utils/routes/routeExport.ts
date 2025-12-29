// Утилиты для экспорта маршрутов в разные форматы

export interface RouteExportData {
  route: any
  orders: any[]
  startAddress: string
  endAddress: string
}

// Экспорт в Google Maps
export const exportToGoogleMaps = (data: RouteExportData): string => {
  const { route, orders, startAddress, endAddress } = data
  
  // Формируем URL для Google Maps с waypoints
  const waypoints = orders
    .map((order, idx) => {
      const address = encodeURIComponent(order.address || route.routeChain?.[idx] || '')
      return address
    })
    .filter(Boolean)
    .join('/')

  const origin = encodeURIComponent(startAddress)
  const destination = encodeURIComponent(endAddress)
  
  // Google Maps Directions URL
  const url = `https://www.google.com/maps/dir/${origin}/${waypoints}/${destination}`
  return url
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

