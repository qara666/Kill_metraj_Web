import React, { useState, useEffect, useMemo } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import clsx from 'clsx'
import { 
  MapPinIcon, 
  ClockIcon, 
  UserGroupIcon, 
  TruckIcon,
  AdjustmentsHorizontalIcon,
  EyeIcon,
  EyeSlashIcon,
  DocumentArrowUpIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import { ZoneDetails } from '../components/ZoneDetails'
import { LoadingSpinner } from '../components/LoadingSpinner'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'react-hot-toast'
import * as XLSX from 'xlsx'

interface ZoneOrder {
  id: string
  orderNumber: string
  address: string
  plannedTime?: string
  courier: string
  amount: number
  paymentMethod: string
  phone: string
  customerName: string
  distance?: number
  priority: number
  confidence: number // Уровень уверенности в определении зоны
  kitchenTime?: number // Время на кухне в минутах
  deliveryTime?: string // Плановое время доставки
  courierType?: 'car' | 'motorcycle' // Рекомендуемый тип курьера
  routeId?: string // ID маршрута, если заказ уже в маршруте
}

interface Zone {
  id: string
  name: string
  center: { lat: number; lng: number }
  radius: number
  orders: ZoneOrder[]
  couriers: string[]
  totalAmount: number
  averageTime: number
  recommendedCourierType?: 'car' | 'motorcycle' // Рекомендуемый тип курьера для зоны
}

interface ZoneExcelData {
  orders: ZoneOrder[]
  couriers: string[]
  routes: any[]
  statistics: any
}

export const Zones: React.FC = () => {
  const { isDark } = useTheme()
  const [selectedZone, setSelectedZone] = useState<string | null>(null)
  const [zoneExcelData, setZoneExcelData] = useState<ZoneExcelData | null>(null)
  const [isProcessingFile, setIsProcessingFile] = useState(false)
  const [timeRange, setTimeRange] = useState<{ start: string; end: string }>({
    start: '08:00',
    end: '20:00'
  })
  const [maxDistance, setMaxDistance] = useState(5) // км
  const [minOrdersPerRoute, setMinOrdersPerRoute] = useState(3)
  const [routes, setRoutes] = useState<any[]>([])
  const [showOptimized, setShowOptimized] = useState(false)
  const [debugLog, setDebugLog] = useState<string[]>([])
  const [mapKey, setMapKey] = useState(0)
  const [routesDiag, setRoutesDiag] = useState<{ totalZones: number; zonesEligible: number; courierGroupsEligible: number; threshold: number }>({ totalZones: 0, zonesEligible: 0, courierGroupsEligible: 0, threshold: 3 })

  const addLog = (message: string) => {
    const ts = new Date().toLocaleTimeString()
    setDebugLog(prev => [...prev, `[${ts}] ${message}`])
  }

  // Функция обработки Excel файла (изолированная)
  const processExcelFile = async (file: File): Promise<ZoneExcelData> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      
      reader.onload = (e) => {
        try {
          const data = e.target?.result
          if (!data) {
            throw new Error('No data received from file')
          }
          
          console.log('Reading Excel file:', file.name, file.size, 'bytes')
          addLog(`Файл прочитан: ${file.name} (${file.size} байт)`) 
          
          const workbook = XLSX.read(data, { type: 'binary' })
          const sheetName = workbook.SheetNames[0]
          
          if (!sheetName) {
            throw new Error('No sheets found in Excel file')
          }
          
          const worksheet = workbook.Sheets[sheetName]
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 })
          
          console.log('Excel data converted to JSON:', jsonData.length, 'rows')
          addLog(`Конвертация Excel → JSON: ${jsonData.length} строк`) 
          
          if (!Array.isArray(jsonData) || jsonData.length < 2) {
            throw new Error('Invalid Excel file format or empty data')
          }
          
          // Обрабатываем данные (аналогично основной системе, но изолированно)
          const processedData = processZoneExcelData(jsonData)
          resolve(processedData)
        } catch (error) {
          console.error('Error processing Excel file:', error)
          addLog(`Ошибка при обработке Excel: ${(error as Error).message}`)
          reject(error)
        }
      }
      
      reader.onerror = () => {
        console.error('FileReader error')
        addLog('Ошибка чтения файла (FileReader)')
        reject(new Error('Failed to read file'))
      }
      
      reader.readAsBinaryString(file)
    })
  }

  // Обработка данных Excel для зон
  const processZoneExcelData = (rawData: any[]): ZoneExcelData => {
    const orders: ZoneOrder[] = []
    const couriers: string[] = []
    
    console.log('Processing Excel data:', rawData.length, 'rows')
    addLog(`Старт обработки Excel: ${rawData.length} строк`)

    const isLikelyAddress = (value: any): boolean => {
      if (typeof value !== 'string') return false
      const v = value.trim().toLowerCase()
      if (v.length < 5) return false
      // эвристики адреса
      return /[a-zа-яіїє]/i.test(v) && (
        v.includes('ул') || v.includes('вул') || v.includes('пр') || v.includes('просп') || v.includes('str') ||
        v.includes('улица') || v.includes('street') || v.includes('проспект') || v.includes('пл') || v.includes('площад')
      )
    }

    const extractAddress = (row: any[]): string => {
      // приоритетная колонка H (индекс 7)
      const primary = String(row[7] ?? '').trim()
      if (isLikelyAddress(primary)) return primary
      // альтернативы рядом
      const candidatesIdx = [6, 8, 5, 9, 4]
      for (const idx of candidatesIdx) {
        const cand = String(row[idx] ?? '').trim()
        if (isLikelyAddress(cand)) return cand
      }
      // перебор всей строки как последний шанс
      for (let i = 0; i < row.length; i++) {
        const cand = String(row[i] ?? '').trim()
        if (isLikelyAddress(cand)) return cand
      }
      return primary
    }

    let emptyAddressCount = 0
    
    // Пропускаем заголовок и обрабатываем данные
    for (let i = 1; i < rawData.length; i++) {
      const row = rawData[i]
      if (!row || !Array.isArray(row) || row.length < 5) {
        console.warn(`Skipping row ${i}: invalid format`, row)
        addLog(`Строка ${i} пропущена: неверный формат`)
        continue
      }
      
      try {
        // Безопасное извлечение данных с проверками
        const orderNumber = String(row[0] || '').trim()
        const address = extractAddress(row)
        const courier = String(row[15] || 'Не назначен').trim()
        const amount = parseFloat(String(row[13] || '0')) || 0
        const paymentMethod = String(row[14] || 'Неизвестно').trim()
        const phone = String(row[3] || '').trim()
        const customerName = String(row[4] || '').trim()
        const kitchenTimeStr = String(row[9] || '0').replace(/[^\d]/g, '')
        const kitchenTime = parseInt(kitchenTimeStr) || 0
        const deliveryTime = String(row[10] || '').trim()
        
        // Пропускаем заказы без адреса
        if (!address) {
          console.warn(`Skipping order ${orderNumber}: no address`)
          addLog(`Строка ${i} пропущена: пустой адрес (order ${orderNumber})`)
          emptyAddressCount++
          continue
        }
        
        const order: ZoneOrder = {
          id: `zone_order_${i}`,
          orderNumber,
          address,
          courier,
          amount,
          paymentMethod,
          phone,
          customerName,
          priority: Math.random() * 100,
          confidence: 0,
          kitchenTime,
          deliveryTime,
          courierType: determineCourierType(address, amount)
        }
        
        orders.push(order)
        
        if (courier && courier !== 'Не назначен' && !couriers.includes(courier)) {
          couriers.push(courier)
        }
      } catch (error) {
        console.warn(`Error processing row ${i}:`, error, row)
        addLog(`Ошибка строки ${i}: ${(error as Error).message}`)
      }
    }
    
    console.log(`Processed ${orders.length} orders, ${couriers.length} couriers`)
    addLog(`Итог: заказов ${orders.length}, курьеров ${couriers.length}, без адреса: ${emptyAddressCount}`)
    
    return {
      orders,
      couriers,
      routes: [],
      statistics: {
        totalOrders: orders.length,
        totalAmount: orders.reduce((sum, o) => sum + o.amount, 0),
        averageAmount: orders.length > 0 ? orders.reduce((sum, o) => sum + o.amount, 0) / orders.length : 0
      }
    }
  }

  // Определение типа курьера на основе адреса и суммы заказа
  const determineCourierType = (address: string, amount: number): 'car' | 'motorcycle' => {
    const addressLower = address.toLowerCase()
    
    // Если сумма заказа большая (>1000 грн) - автомобиль
    if (amount > 1000) return 'car'
    
    // Если адрес содержит ключевые слова для автомобиля
    if (addressLower.includes('центр') || addressLower.includes('хрещатик') || 
        addressLower.includes('майдан') || addressLower.includes('печерськ')) {
      return 'car'
    }
    
    // Если адрес содержит ключевые слова для мотоцикла
    if (addressLower.includes('героїв полку') || addressLower.includes('дубровицька') ||
        addressLower.includes('новокостянтинівська') || addressLower.includes('кирилівська')) {
      return 'motorcycle'
    }
    
    // По умолчанию - мотоцикл для небольших заказов
    return 'motorcycle'
  }

  // Мутация для обработки файла
  const processFileMutation = useMutation({
    mutationFn: processExcelFile,
    onSuccess: (data) => {
      setZoneExcelData(data)
      toast.success(`Обработано ${data.orders.length} заказов для анализа зон`)
      addLog(`Успех: получено заказов ${data.orders.length}`)
      setShowOptimized(true)
    },
    onError: (error) => {
      console.error('Error processing file:', error)
      toast.error('Ошибка обработки файла')
      addLog('Ошибка: файл не обработан')
    }
  })

  const handleFileUpload = (file: File) => {
    setIsProcessingFile(true)
    processFileMutation.mutate(file, {
      onSettled: () => setIsProcessingFile(false)
    })
  }

  // Определяем зоны на основе адресов заказов (изолированные данные)
  const zones = useMemo(() => {
    try {
      if (!zoneExcelData?.orders || !Array.isArray(zoneExcelData.orders)) {
        console.log('No zone orders data available')
        return []
      }

      const orders = zoneExcelData.orders.filter((order: ZoneOrder) => {
        try {
          return order && 
            typeof order === 'object' && 
            order.address && 
            typeof order.address === 'string' && 
            order.address.trim() !== ''
        } catch (error) {
          console.warn('Error filtering order:', error, order)
          return false
        }
      })

      console.log(`Processing ${orders.length} orders for zones`)
      addLog(`К зонеобразованию допущено заказов: ${orders.length}`)

      // Группируем заказы по районам/зонам
      const zoneGroups: { [key: string]: ZoneOrder[] } = {}
    
    orders.forEach((order: any) => {
      try {
        // Улучшенное определение зоны по ключевым словам в адресе
        const address = order.address.toLowerCase()
        let zoneKey = 'Другое'
        let confidence = 0
        
        // Зона Азов - Героїв полку "АЗОВ", Маршала Малиновського
        if (address.includes('героїв полку') || address.includes('малиновського') || 
            address.includes('азов') || address.includes('малиновського')) {
          zoneKey = 'Зона Азов'
          confidence = 0.9
        }
        // Зона Дубровицкая - Дубровицька, Дубровицкая
        else if (address.includes('дубровицька') || address.includes('дубровицкая') ||
                 address.includes('дубровиц') || address.includes('дубров')) {
          zoneKey = 'Зона Дубровицкая'
          confidence = 0.9
        }
        // Зона Новокостянтиновская - Новокостянтинівська
        else if (address.includes('новокостянтинівська') || address.includes('новокостянтинов') ||
                 address.includes('новокостянтин')) {
          zoneKey = 'Зона Новокостянтиновская'
          confidence = 0.9
        }
        // Зона Кириловская - Кирилівська, Фрунзе
        else if (address.includes('кирилівська') || address.includes('фрунзе') ||
                 address.includes('кирил') || address.includes('фрунз')) {
          zoneKey = 'Зона Кириловская'
          confidence = 0.9
        }
        // Зона Центр - центр, хрещатик, майдан
        else if (address.includes('центр') || address.includes('khreshchatyk') ||
                 address.includes('хрещатик') || address.includes('майдан') ||
                 address.includes('центральна') || address.includes('центральная')) {
          zoneKey = 'Зона Центр'
          confidence = 0.8
        }
        // Дополнительные проверки для более точного определения
        else if (address.includes('печерськ') || address.includes('печерск')) {
          zoneKey = 'Зона Печерск'
          confidence = 0.7
        }
        else if (address.includes('подільськ') || address.includes('подольск')) {
          zoneKey = 'Зона Подольск'
          confidence = 0.7
        }
        else if (address.includes('оболонь') || address.includes('оболон')) {
          zoneKey = 'Зона Оболонь'
          confidence = 0.7
        }
        else {
          // Попытка определить зону по району или улице
          if (address.includes('вул.') || address.includes('улица')) {
            zoneKey = 'Зона Другое'
            confidence = 0.3
          }
        }

        if (!zoneGroups[zoneKey]) {
          zoneGroups[zoneKey] = []
        }

        // Безопасное создание объекта заказа
        const safeOrder: ZoneOrder = {
          id: order?.id || `order_${order?.orderNumber || 'unknown'}`,
          orderNumber: order?.orderNumber || 'N/A',
          address: order?.address || '',
          plannedTime: order?.plannedTime,
          courier: order?.courier || 'Не назначен',
          amount: typeof order?.amount === 'number' ? order.amount : 0,
          paymentMethod: order?.paymentMethod || 'Неизвестно',
          phone: order?.phone || '',
          customerName: order?.customerName || '',
          priority: Math.random() * 100, // Временный приоритет
          confidence: confidence, // Уровень уверенности в определении зоны
          kitchenTime: order?.kitchenTime,
          deliveryTime: order?.deliveryTime,
          courierType: order?.courierType,
          routeId: order?.routeId
        }

        zoneGroups[zoneKey].push(safeOrder)
      } catch (error) {
        console.warn('Error processing order for zones:', error, order)
      }
    })

    // Создаем объекты зон с дополнительной защитой
    let zonesList: Zone[] = Object.entries(zoneGroups).map(([name, orders], index) => {
      try {
        // Безопасное извлечение курьеров
        const couriers = [...new Set(orders
          .map(o => o?.courier)
          .filter(c => c && c !== 'Не назначен')
          .filter(Boolean)
        )]
        
        // Безопасный расчет суммы
        const totalAmount = orders.reduce((sum, o) => {
          const amount = typeof o?.amount === 'number' ? o.amount : 0
          return sum + amount
        }, 0)
        
        // Анализируем качество определения зоны
        const validOrders = orders.filter(o => o && typeof o === 'object')
        const avgConfidence = validOrders.length > 0 
          ? validOrders.reduce((sum, o) => sum + (o.confidence || 0), 0) / validOrders.length 
          : 0
        const highConfidenceOrders = validOrders.filter(o => (o.confidence || 0) > 0.7).length
        const lowConfidenceOrders = validOrders.filter(o => (o.confidence || 0) < 0.5).length
        
        console.log(`Zone ${name}: ${validOrders.length} orders, avg confidence: ${avgConfidence.toFixed(2)}, high: ${highConfidenceOrders}, low: ${lowConfidenceOrders}`)
        
        return {
          id: `zone_${index}`,
          name,
          center: getZoneCenter(name),
          radius: 2, // км
          orders: validOrders.sort((a, b) => (b.priority || 0) - (a.priority || 0)),
          couriers,
          totalAmount,
          averageTime: validOrders.length * 15 // Примерное время в минутах
        }
      } catch (error) {
        console.warn(`Error creating zone ${name}:`, error)
        return {
          id: `zone_${index}`,
          name,
          center: getZoneCenter(name),
          radius: 2,
          orders: [],
          couriers: [],
          totalAmount: 0,
          averageTime: 0
        }
      }
    })
    if (zonesList.length === 0 && orders.length > 0) {
      // Фолбэк: если не распознали зоны, показываем все заказы одной зоной
      zonesList = [{
        id: 'zone_fallback_all',
        name: 'Все заказы',
        center: getZoneCenter('Другое'),
        radius: 2,
        orders: orders,
        couriers: [...new Set(orders.map(o => o.courier).filter(c => c && c !== 'Не назначен'))],
        totalAmount: orders.reduce((sum, o) => sum + (typeof o.amount === 'number' ? o.amount : 0), 0),
        averageTime: orders.length * 15
      }]
    }
    addLog(`Определено зон: ${zonesList.length}. Детали: ` + (zonesList.length ? zonesList.map(z => `${z.name}=${z.orders.length}`).join(', ') : 'нет'))
    return zonesList
    } catch (error) {
      console.error('Error processing zones:', error)
      return []
    }
  }, [zoneExcelData?.orders])

  // Получаем центр зоны по названию
  const getZoneCenter = (zoneName: string): { lat: number; lng: number } => {
    const centers: { [key: string]: { lat: number; lng: number } } = {
      'Зона Азов': { lat: 50.4501, lng: 30.5234 },
      'Зона Дубровицкая': { lat: 50.4501, lng: 30.5234 },
      'Зона Новокостянтиновская': { lat: 50.4501, lng: 30.5234 },
      'Зона Кириловская': { lat: 50.4501, lng: 30.5234 },
      'Зона Центр': { lat: 50.4501, lng: 30.5234 },
      'Другое': { lat: 50.4501, lng: 30.5234 }
    }
    return centers[zoneName] || centers['Другое']
  }

  // Алгоритм оптимизации маршрутов
  const optimizedRoutes = useMemo(() => {
    try {
      if (zones.length === 0) return []

      const routes: Array<{
        id: string
        courier: string
        zone: string
        orders: ZoneOrder[]
        totalDistance: number
        totalAmount: number
        estimatedTime: number
        efficiency: number
      }> = []

    let zonesEligible = 0
    let courierGroupsEligible = 0
    zones.forEach(zone => {
      if (zone.orders.length < minOrdersPerRoute) return
      zonesEligible++

      // Группируем заказы по курьерам
      const courierGroups: { [key: string]: ZoneOrder[] } = {}
      
      zone.orders.forEach(order => {
        const courier = order.courier === 'Не назначен' ? 'Автоматический' : order.courier
        if (!courierGroups[courier]) {
          courierGroups[courier] = []
        }
        courierGroups[courier].push(order)
      })

      // Создаем маршруты для каждого курьера
      Object.entries(courierGroups).forEach(([courier, orders]) => {
        if (orders.length >= minOrdersPerRoute) {
          courierGroupsEligible++
          const totalAmount = orders.reduce((sum, o) => sum + o.amount, 0)
          const estimatedTime = orders.length * 15 + orders.length * 5 // 15 мин на заказ + 5 мин на дорогу
          const efficiency = totalAmount / estimatedTime // Гривны в минуту

          routes.push({
            id: `route_${zone.id}_${courier}`,
            courier,
            zone: zone.name,
            orders: orders.slice(0, 8), // Максимум 8 заказов на маршрут
            totalDistance: orders.length * 2, // Примерное расстояние
            totalAmount,
            estimatedTime,
            efficiency
          })
        }
      })
    })

      const result = routes.sort((a, b) => b.efficiency - a.efficiency)
      if (result.length === 0) {
        addLog(`Маршруты не построены: зон с достаточным числом заказов ${zonesEligible}, групп по курьерам ${courierGroupsEligible}, порог ${minOrdersPerRoute}`)
      } else {
        addLog(`Построено маршрутов: ${result.length}`)
      }
      setRoutesDiag({ totalZones: zones.length, zonesEligible, courierGroupsEligible, threshold: minOrdersPerRoute })
      return result
    } catch (error) {
      console.error('Error optimizing routes:', error)
      return []
    }
  }, [zones, minOrdersPerRoute])

  const selectedZoneData = zones.find(z => z.id === selectedZone)

  const handleCreateRoute = (orders: ZoneOrder[], courier: string) => {
    console.log('Creating route:', { orders, courier })
    
    // Создаем маршрут с учетом времени на кухне и планового времени
    const route = {
      id: `route_${Date.now()}`,
      courier,
      orders: orders.map(order => ({
        ...order,
        routeId: `route_${Date.now()}`
      })),
      totalDistance: calculateRouteDistance(orders),
      totalAmount: orders.reduce((sum, o) => sum + o.amount, 0),
      estimatedTime: calculateRouteTime(orders),
      efficiency: calculateRouteEfficiency(orders),
      createdAt: new Date().toISOString(),
      status: 'created'
    }
    
    // Добавляем маршрут в локальное состояние (изолированно)
    setRoutes(prev => [...prev, route])
    
    // Обновляем заказы, помечая их как в маршруте
    setZoneExcelData(prev => {
      if (!prev) return prev
      
      const updatedOrders = prev.orders.map(order => {
        const routeOrder = orders.find(o => o.id === order.id)
        return routeOrder ? { ...order, routeId: route.id } : order
      })
      
      return {
        ...prev,
        orders: updatedOrders
      }
    })
    
    toast.success(`Создан маршрут для ${courier} с ${orders.length} заказами`)
  }

  // Расчет расстояния маршрута
  const calculateRouteDistance = (orders: ZoneOrder[]): number => {
    // Базовая логика расчета расстояния
    const baseDistance = 1.0 // 1км базовое расстояние
    const additionalDistance = orders.length * 0.5 // 500м за каждый заказ
    return baseDistance + additionalDistance
  }

  // Расчет времени маршрута
  const calculateRouteTime = (orders: ZoneOrder[]): number => {
    const kitchenTime = orders.reduce((sum, o) => sum + (o.kitchenTime || 0), 0)
    const deliveryTime = orders.length * 15 // 15 минут на доставку каждого заказа
    const travelTime = orders.length * 5 // 5 минут на дорогу между заказами
    return kitchenTime + deliveryTime + travelTime
  }

  // Расчет эффективности маршрута
  const calculateRouteEfficiency = (orders: ZoneOrder[]): number => {
    const totalAmount = orders.reduce((sum, o) => sum + o.amount, 0)
    const totalTime = calculateRouteTime(orders)
    return totalTime > 0 ? totalAmount / totalTime : 0
  }

  // Показываем состояние загрузки если нет данных
  if (!zoneExcelData) {
    return (
      <div className={clsx(
        'space-y-6 transition-colors duration-300',
        isDark ? 'text-gray-100' : 'text-gray-900'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className={clsx(
              'text-2xl font-bold',
              isDark ? 'text-gray-100' : 'text-gray-900'
            )}>
              Управление зонами
            </h1>
            <p className={clsx(
              'mt-1 text-sm',
              isDark ? 'text-gray-400' : 'text-gray-600'
            )}>
              Автоматическая оптимизация маршрутов по зонам доставки
            </p>
            <div className={clsx(
              'mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
              isDark ? 'bg-orange-900 text-orange-200' : 'bg-orange-100 text-orange-800'
            )}>
              <ExclamationTriangleIcon className="h-3 w-3 mr-1" />
              Альфа версия билда
            </div>
          </div>
        </div>

        {/* Excel Upload Section */}
        <div className={clsx(
          'rounded-lg shadow-sm border p-6',
          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
        )}>
          <div className="text-center">
            <DocumentArrowUpIcon className={clsx(
              'mx-auto h-12 w-12 mb-4',
              isDark ? 'text-gray-500' : 'text-gray-400'
            )} />
            <h3 className={clsx(
              'text-lg font-medium mb-2',
              isDark ? 'text-gray-200' : 'text-gray-900'
            )}>
              Загрузите Excel файл для анализа заказов по зонам
            </h3>
            <p className={clsx(
              'text-sm mb-6',
              isDark ? 'text-gray-400' : 'text-gray-600'
            )}>
              Система автоматически проанализирует заказы и распределит их по зонам доставки на основе адресов
            </p>
            
            {/* Custom File Upload */}
            <div className="max-w-md mx-auto">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  if (file) {
                    handleFileUpload(file)
                  }
                }}
                className="hidden"
                id="zone-file-upload"
                disabled={isProcessingFile}
              />
              <label
                htmlFor="zone-file-upload"
                className={clsx(
                  'flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors',
                  isProcessingFile
                    ? isDark
                      ? 'border-gray-600 bg-gray-700 cursor-not-allowed'
                      : 'border-gray-300 bg-gray-100 cursor-not-allowed'
                    : isDark
                      ? 'border-gray-600 bg-gray-800 hover:bg-gray-700'
                      : 'border-gray-300 bg-gray-50 hover:bg-gray-100'
                )}
              >
                {isProcessingFile ? (
                  <LoadingSpinner />
                ) : (
                  <>
                    <DocumentArrowUpIcon className={clsx(
                      'w-8 h-8 mb-2',
                      isDark ? 'text-gray-400' : 'text-gray-500'
                    )} />
                    <p className={clsx(
                      'text-sm',
                      isDark ? 'text-gray-400' : 'text-gray-500'
                    )}>
                      Нажмите для выбора файла
                    </p>
                  </>
                )}
              </label>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={clsx(
      'space-y-6 transition-colors duration-300',
      isDark ? 'text-gray-100' : 'text-gray-900'
    )}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className={clsx(
            'text-2xl font-bold',
            isDark ? 'text-gray-100' : 'text-gray-900'
          )}>
            Управление зонами
          </h1>
          <p className={clsx(
            'mt-1 text-sm',
            isDark ? 'text-gray-400' : 'text-gray-600'
          )}>
            Автоматическая оптимизация маршрутов по зонам доставки
          </p>
          <div className={clsx(
            'mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
            isDark ? 'bg-orange-900 text-orange-200' : 'bg-orange-100 text-orange-800'
          )}>
            <ExclamationTriangleIcon className="h-3 w-3 mr-1" />
            Альфа версия билда
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className={clsx(
        'card p-6',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <div className="flex items-center space-x-2 mb-4">
          <AdjustmentsHorizontalIcon className="h-5 w-5 text-blue-500" />
          <h3 className={clsx(
            'text-lg font-semibold',
            isDark ? 'text-gray-100' : 'text-gray-900'
          )}>
            Настройки оптимизации
          </h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className={clsx(
              'block text-sm font-medium mb-2',
              isDark ? 'text-gray-300' : 'text-gray-700'
            )}>
              Временной диапазон
            </label>
            <div className="flex space-x-2">
              <input
                type="time"
                value={timeRange.start}
                onChange={(e) => setTimeRange(prev => ({ ...prev, start: e.target.value }))}
                className={clsx(
                  'px-3 py-2 border rounded-lg text-sm',
                  isDark 
                    ? 'bg-gray-700 border-gray-600 text-gray-100' 
                    : 'bg-white border-gray-300 text-gray-900'
                )}
              />
              <input
                type="time"
                value={timeRange.end}
                onChange={(e) => setTimeRange(prev => ({ ...prev, end: e.target.value }))}
                className={clsx(
                  'px-3 py-2 border rounded-lg text-sm',
                  isDark 
                    ? 'bg-gray-700 border-gray-600 text-gray-100' 
                    : 'bg-white border-gray-300 text-gray-900'
                )}
              />
            </div>
          </div>
          
          <div>
            <label className={clsx(
              'block text-sm font-medium mb-2',
              isDark ? 'text-gray-300' : 'text-gray-700'
            )}>
              Максимальное расстояние (км)
            </label>
            <input
              type="range"
              min="1"
              max="10"
              value={maxDistance}
              onChange={(e) => setMaxDistance(Number(e.target.value))}
              className="w-full"
            />
            <div className="text-sm text-gray-500 mt-1">{maxDistance} км</div>
          </div>
          
          <div>
            <label className={clsx(
              'block text-sm font-medium mb-2',
              isDark ? 'text-gray-300' : 'text-gray-700'
            )}>
              Минимум заказов на маршрут
            </label>
            <input
              type="number"
              min="1"
              max="10"
              value={minOrdersPerRoute}
              onChange={(e) => setMinOrdersPerRoute(Number(e.target.value))}
              className={clsx(
                'w-full px-3 py-2 border rounded-lg text-sm',
                isDark 
                  ? 'bg-gray-700 border-gray-600 text-gray-100' 
                  : 'bg-white border-gray-300 text-gray-900'
              )}
            />
          </div>
        </div>
      </div>

      {/* Excel Upload Section */}
      <div className={clsx(
        'rounded-lg shadow-sm border p-6',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <div className="text-center">
          <DocumentArrowUpIcon className={clsx(
            'mx-auto h-12 w-12 mb-4',
            isDark ? 'text-gray-500' : 'text-gray-400'
          )} />
          <h3 className={clsx(
            'text-lg font-medium mb-2',
            isDark ? 'text-gray-200' : 'text-gray-900'
          )}>
            Загрузите Excel файл для анализа заказов по зонам
          </h3>
          <p className={clsx(
            'text-sm mb-6',
            isDark ? 'text-gray-400' : 'text-gray-600'
          )}>
            Система автоматически проанализирует заказы и распределит их по зонам доставки на основе адресов
          </p>
          {/* Панель статусов и подсказок */}
          <div className={clsx(
            'mt-6 text-left rounded-lg p-4 border',
            isDark ? 'bg-gray-900/50 border-gray-700' : 'bg-gray-50 border-gray-200'
          )}>
            <h4 className={clsx('font-semibold mb-2', isDark ? 'text-gray-100' : 'text-gray-900')}>Шаги обработки</h4>
            <ol className={clsx('list-decimal pl-5 space-y-1', isDark ? 'text-gray-300' : 'text-gray-700')}>
              <li>Загрузка Excel файла</li>
              <li>Чтение и конвертация в JSON</li>
              <li>Парсинг строк и фильтрация пустых адресов</li>
              <li>Группировка заказов по зонам</li>
              <li>Построение оптимизированных маршрутов</li>
            </ol>
            <div className={clsx('mt-3 text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>
              Подсказки: убедитесь, что адреса в колонке H, сумма в колонке N.
            </div>
            {/* Живой лог */}
            <div className={clsx('mt-3 max-h-36 overflow-auto rounded border text-xs', isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white')}>
              <pre className={clsx('p-2 whitespace-pre-wrap', isDark ? 'text-gray-300' : 'text-gray-700')}>
                {debugLog.length ? debugLog.join('\n') : 'Лог пуст — загрузите файл, чтобы увидеть шаги.'}
              </pre>
            </div>
          </div>
          {/* Кнопка переключения отображения оптимизированных маршрутов */}
          <button
            type="button"
            onClick={() => setShowOptimized(prev => !prev)}
            className={clsx(
              'mt-4 inline-flex items-center px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              showOptimized ? 'bg-blue-600 text-white hover:bg-blue-700' :
              isDark ? 'bg-gray-700 text-gray-100 hover:bg-gray-600' : 'bg-gray-100 text-gray-800 hover:bg-gray-200'
            )}
          >
            {showOptimized ? 'Скрыть оптимизированные маршруты' : 'Показать оптимизированные маршруты'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Zones List */}
        <div className="space-y-4">
          <h3 className={clsx(
            'text-lg font-semibold',
            isDark ? 'text-gray-100' : 'text-gray-900'
          )}>
            Зоны доставки ({zones.length})
          </h3>
          
          <div className="space-y-3">
            {zones && Array.isArray(zones) ? zones.map((zone) => {
              if (!zone || typeof zone !== 'object') {
                console.warn('Invalid zone object:', zone)
                return null
              }
              
              return (
                <div
                  key={zone.id || `zone_${Math.random()}`}
                  onClick={() => setSelectedZone(zone.id)}
                  className={clsx(
                    'card p-4 cursor-pointer transition-all duration-200 hover:shadow-lg',
                    selectedZone === zone.id
                      ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : isDark 
                        ? 'bg-gray-800 border-gray-700 hover:bg-gray-700' 
                        : 'bg-white border-gray-200 hover:bg-gray-50'
                  )}
                >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <MapPinIcon className="h-5 w-5 text-blue-500" />
                    <div>
                      <h4 className={clsx(
                        'font-semibold',
                        isDark ? 'text-gray-100' : 'text-gray-900'
                      )}>
                        {zone.name}
                      </h4>
                      <p className={clsx(
                        'text-sm',
                        isDark ? 'text-gray-400' : 'text-gray-600'
                      )}>
                        {zone.orders.length} заказов • {zone.couriers.length} курьеров
                      </p>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <div className={clsx(
                      'text-sm font-semibold',
                      isDark ? 'text-gray-100' : 'text-gray-900'
                    )}>
                      {zone.totalAmount.toLocaleString()} ₴
                    </div>
                    <div className={clsx(
                      'text-xs',
                      isDark ? 'text-gray-400' : 'text-gray-500'
                    )}>
                      ~{zone.averageTime} мин
                    </div>
                  </div>
                </div>
              </div>
              )
            }) : (
              <div className={clsx(
                'text-center py-8',
                isDark ? 'text-gray-400' : 'text-gray-500'
              )}>
                Нет данных о зонах
              </div>
            )}
          </div>
        </div>

        {/* Google Maps */}
        <div className="space-y-4">
          <h3 className={clsx(
            'text-lg font-semibold',
            isDark ? 'text-gray-100' : 'text-gray-900'
          )}>
            Карта зон
          </h3>
          
          <div className="card p-0 overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
              <span className={clsx('text-sm', isDark ? 'text-gray-300' : 'text-gray-700')}>Google карта зон</span>
              <div className="flex items-center gap-2">
                <a
                  href="https://www.google.com/maps/d/viewer?mid=1ylEgzXxEdNkh0zxDAb3iGCBBw2QM3xk"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-blue-600 hover:underline"
                >Открыть в новой вкладке</a>
                <button
                  type="button"
                  onClick={() => setMapKey(k => k + 1)}
                  className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600"
                >Обновить</button>
              </div>
            </div>
            <iframe
              key={mapKey}
              src="https://www.google.com/maps/d/embed?mid=1ylEgzXxEdNkh0zxDAb3iGCBBw2QM3xk&ehbc=2E312F"
              width="100%"
              height="400"
              style={{ border: 0 }}
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              className="rounded-lg"
            />
          </div>
        </div>
      </div>

      {/* Optimized Routes */}
      {showOptimized && (
        <div className="space-y-4">
          <h3 className={clsx(
            'text-lg font-semibold',
            isDark ? 'text-gray-100' : 'text-gray-900'
          )}>
            Оптимизированные маршруты ({optimizedRoutes.length})
          </h3>
          {optimizedRoutes.length === 0 && (
            <div className={clsx('text-sm rounded-lg p-4 border', isDark ? 'border-gray-700 bg-gray-800 text-gray-300' : 'border-gray-200 bg-gray-50 text-gray-700')}>
              <div className="font-medium mb-1">Маршруты пока не построены</div>
              <div>Проверки:</div>
              <ul className="list-disc pl-5 mt-1 space-y-1">
                <li>Всего зон: {routesDiag.totalZones}</li>
                <li>Зон с достаточным числом заказов (≥ {routesDiag.threshold}): {routesDiag.zonesEligible}</li>
                <li>Групп по курьерам, проходящих порог: {routesDiag.courierGroupsEligible}</li>
              </ul>
              <div className="mt-2">Рекомендации: снизьте порог до 2-3, проверьте назначение курьеров или оставьте "Не назначен".</div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {optimizedRoutes.map((route) => (
              <div
                key={route.id}
                className={clsx(
                  'card p-4',
                  isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                )}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center space-x-2">
                    <TruckIcon className="h-5 w-5 text-blue-500" />
                    <span className={clsx(
                      'font-semibold',
                      isDark ? 'text-gray-100' : 'text-gray-900'
                    )}>
                      {route.courier}
                    </span>
                  </div>
                  <div className={clsx(
                    'px-2 py-1 rounded-full text-xs font-medium',
                    route.efficiency > 50 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  )}>
                    {route.efficiency.toFixed(1)} ₴/мин
                  </div>
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className={clsx(isDark ? 'text-gray-400' : 'text-gray-600')}>
                      Зона:
                    </span>
                    <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>
                      {route.zone}
                    </span>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span className={clsx(isDark ? 'text-gray-400' : 'text-gray-600')}>
                      Заказов:
                    </span>
                    <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>
                      {route.orders.length}
                    </span>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span className={clsx(isDark ? 'text-gray-400' : 'text-gray-600')}>
                      Сумма:
                    </span>
                    <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>
                      {route.totalAmount.toLocaleString()} ₴
                    </span>
                  </div>
                  
                  <div className="flex justify-between text-sm">
                    <span className={clsx(isDark ? 'text-gray-400' : 'text-gray-600')}>
                      Время:
                    </span>
                    <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>
                      ~{route.estimatedTime} мин
                    </span>
                  </div>
                </div>
                
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                  <button className={clsx(
                    'w-full px-3 py-2 text-sm font-medium rounded-lg transition-colors',
                    'bg-blue-600 text-white hover:bg-blue-700'
                  )}>
                    Создать маршрут
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Zone Details Modal */}
      {selectedZoneData && selectedZoneData.id && (
        <ZoneDetails
          zone={selectedZoneData}
          onClose={() => setSelectedZone(null)}
          onCreateRoute={handleCreateRoute}
        />
      )}
    </div>
  )
}
