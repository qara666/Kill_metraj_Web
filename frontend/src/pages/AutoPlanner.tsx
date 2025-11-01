import React, { useCallback, useMemo, useState, useEffect, useRef } from 'react'
import { clsx } from 'clsx'
import { useTheme } from '../contexts/ThemeContext'
import { processExcelFile, ProcessedExcelData } from '../utils/excelProcessor'
import { googleMapsLoader } from '../utils/googleMapsLoader'
import { localStorageUtils } from '../utils/localStorage'
import { combineOrders, splitLargeRoute, type Order as OptimizationOrder } from '../utils/routeOptimization'
import { generateRouteNotifications, formatNotificationForDisplay, type Notification, type NotificationPreferences, type RouteInfo as NotificationRouteInfo } from '../utils/notifications'
import { TrafficHeatmap } from '../components/TrafficHeatmap'

// Компонент для визуализации маршрута на карте
const RouteMap: React.FC<{ route: any; onMarkerClick?: (order: any) => void }> = ({ route, onMarkerClick }) => {
  const { isDark } = useTheme()
  const mapRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<any>(null)
  const directionsRendererRef = useRef<any>(null)
  const markersRef = useRef<any[]>([]) // Храним маркеры для очистки
  const [isMapReady, setIsMapReady] = useState(false)

  useEffect(() => {
    // Очищаем предыдущие маркеры
    markersRef.current.forEach(marker => marker.setMap(null))
    markersRef.current = []
    if (!mapRef.current || !route) return

    const initMap = async () => {
      try {
        await googleMapsLoader.load()
        const gmaps = (window as any).google?.maps
        if (!gmaps) return

        // Создаём карту
        const map = new gmaps.Map(mapRef.current!, {
          zoom: 12,
          center: { lat: 50.4501, lng: 30.5234 }, // Киев по умолчанию
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
        })

        mapInstanceRef.current = map

        // Создаём рендерер маршрутов БЕЗ стандартных маркеров для старта и финиша
        // Создадим кастомные маркеры только для заказов
        const directionsRenderer = new gmaps.DirectionsRenderer({
          map,
          suppressMarkers: true, // Отключаем стандартные маркеры A, B, C, D, E
          polylineOptions: {
            strokeColor: '#2563eb', // Яркий синий для лучшей видимости
            strokeWeight: 5, // Толще для четкости
            strokeOpacity: 0.9,
          },
          preserveViewport: true, // Не изменяем вид при обновлении маршрута
        })
        directionsRendererRef.current = directionsRenderer

        // Получаем координаты точек для построения маршрута
        const geocoder = new gmaps.Geocoder()
        const city = localStorageUtils.getAllSettings().cityBias || 'Киев'
        const cityAppend = `, ${city}, Украина`

        const geocodeAddress = (address: string): Promise<any> => {
          return new Promise((resolve) => {
            geocoder.geocode(
              {
                address: address.includes(city) ? address : `${address}${cityAppend}`,
                region: 'ua',
              },
              (results: any, status: any) => {
                if (status === 'OK' && results && results.length > 0) {
                  resolve(results[0].geometry.location)
                } else {
                  resolve(null)
                }
              }
            )
          })
        }

        // Собираем только заказы (без старта и финиша)
        const orderAddresses = route.routeChain || route.waypoints?.map((w: any) => w.address) || []
        
        // Для построения маршрута нужны старт и финиш
        const fullAddresses = [
          route.startAddress,
          ...orderAddresses,
          route.endAddress
        ].filter(Boolean)

        if (fullAddresses.length > 0 && orderAddresses.length > 0) {
          // Геокодируем все адреса (включая старт и финиш для маршрута)
          const allLocations = []
          for (const addr of fullAddresses) {
            const loc = await geocodeAddress(addr)
            if (loc) allLocations.push(loc)
          }
          
          if (allLocations.length >= 2) {
            // Устанавливаем центр карты на первый заказ
            if (allLocations.length > 1) {
              map.setCenter(allLocations[1]) // первый заказ после старта
            }
            
            // Создаём маршрут через DirectionsService (со стартом и финишем)
            const directionsService = new gmaps.DirectionsService()
            const origin = allLocations[0] // стартовый адрес
            const destination = allLocations[allLocations.length - 1] // конечный адрес
            const waypoints = allLocations.slice(1, -1).map((loc: any) => ({
              location: loc,
              stopover: true,
            }))

            directionsService.route(
              {
                origin,
                destination,
                waypoints: waypoints.length > 0 ? waypoints : undefined,
                travelMode: gmaps.TravelMode.DRIVING,
                optimizeWaypoints: false, // Сохраняем порядок
                unitSystem: gmaps.UnitSystem.METRIC,
              },
              (result: any, status: any) => {
                if (status === 'OK' && result) {
                  directionsRenderer.setDirections(result)
                  
                  // Создаём кастомные маркеры только для заказов (A, B, C, D, E)
                  // НЕ создаём маркеры для старта и финиша
                  const routeData = result.routes[0]
                  const legs = routeData.legs || []
                  const orderNumbers = route.orderNumbers || []
                  
                  // Структура legs: [start->order1, order1->order2, ..., orderN->end]
                  // Для waypoints: waypoint[0] = первый заказ (должен быть в end_location legs[0])
                  //                waypoint[1] = второй заказ (должен быть в end_location legs[1])
                  //                и т.д.
                  
                  waypoints.forEach((_wp: any, idx: number) => {
                    // leg[idx] содержит путь К заказу idx (для первого заказа это leg[0]: start->order1)
                    if (idx < legs.length) {
                      const leg = legs[idx]
                      const endLocation = leg.end_location
                      
                      // Нормальные круглые маркеры с номерами заказов
                      const orderNum = orderNumbers[idx] || String(idx + 1)
                      const markerLabel = String(idx + 1) // 1, 2, 3 вместо A, B, C
                      
                      const marker = new gmaps.Marker({
                        position: endLocation,
                        map,
                        label: {
                          text: markerLabel,
                          color: '#ffffff',
                          fontSize: '14px',
                          fontWeight: 'bold',
                        },
                        icon: {
                          path: gmaps.SymbolPath.CIRCLE,
                          scale: 12,
                          fillColor: '#3b82f6',
                          fillOpacity: 1,
                          strokeColor: '#ffffff',
                          strokeWeight: 3,
                          labelOrigin: new gmaps.Point(0, 0),
                        },
                        title: `Заказ ${orderNum}: ${orderAddresses[idx]}`,
                        zIndex: gmaps.Marker.MAX_ZINDEX + idx,
                      })
                      
                      // Добавляем обработчик клика на маркер для показа информации о заказе
                      if (onMarkerClick) {
                        const fullOrder = route.routeChainFull?.[idx]
                        if (fullOrder) {
                          marker.addListener('click', () => {
                            onMarkerClick(fullOrder)
                          })
                        }
                      }
                      
                      markersRef.current.push(marker)
                    }
                  })
                  
                  // Подгоняем границы карты под маршрут с отступом (только при первой загрузке)
                  if (!isMapReady) {
                    const bounds = routeData.bounds
                    if (bounds) {
                      map.fitBounds(bounds, {
                        top: 50,
                        right: 50,
                        bottom: 50,
                        left: 50,
                      })
                    }
                  }
                  
                  setIsMapReady(true)
                }
              }
            )
          } else if (allLocations.length === 3 && orderAddresses.length === 1) {
            // Если только один заказ, показываем маршрут от старта до заказа до финиша
            map.setCenter(allLocations[1]) // центр на заказе
            map.setZoom(13)
            setIsMapReady(true)
          }
        }
      } catch (error) {
        console.error('Ошибка инициализации карты:', error)
      }
    }

    initMap()

    return () => {
      // Очищаем маркеры при размонтировании
      markersRef.current.forEach(marker => marker.setMap(null))
      markersRef.current = []
      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null)
      }
    }
  }, [route])

  return (
    <div className="mt-4" onClick={(e) => e.stopPropagation()}>
      <div className={clsx('text-xs font-medium mb-2', isDark ? 'text-gray-200' : 'text-gray-700')}>
        Визуализация маршрута:
      </div>
      <div
        ref={mapRef}
        className="w-full h-64 rounded-lg border overflow-hidden"
        style={{ minHeight: '256px' }}
        onClick={(e) => e.stopPropagation()} // Предотвращаем всплытие кликов с карты
      />
      {!isMapReady && (
        <div className={clsx('text-xs mt-2', isDark ? 'text-gray-400' : 'text-gray-500')}>
          Загрузка карты...
        </div>
      )}
    </div>
  )
}

export const AutoPlanner: React.FC = () => {
  const { isDark } = useTheme()
  const [excelData, setExcelData] = useState<ProcessedExcelData | null>(null)
  const [fileName, setFileName] = useState('')
  const [selectedOrder, setSelectedOrder] = useState<any>(null) // Выбранный заказ для модального окна
  const [isProcessing, setIsProcessing] = useState(false)
  const [isPlanning, setIsPlanning] = useState(false)
  const [plannedRoutes, setPlannedRoutes] = useState<any[]>([])
  const [excludedOutsideSector, setExcludedOutsideSector] = useState<number>(0)
  const [maxRouteDurationMin, setMaxRouteDurationMin] = useState<number>(180)
  const [maxRouteDistanceKm, setMaxRouteDistanceKm] = useState<number>(120)
  const [maxWaitPerStopMin, setMaxWaitPerStopMin] = useState<number>(15)
  const [maxStopsPerRoute, setMaxStopsPerRoute] = useState<number>(6)
  const [errorMsg, setErrorMsg] = useState<string>('')
  const [selectedRoute, setSelectedRoute] = useState<any>(null)
  
  // Настройки объединения заказов
  const [enableOrderCombining, setEnableOrderCombining] = useState<boolean>(true)
  const [combineMaxDistanceMeters, setCombineMaxDistanceMeters] = useState<number>(500)
  const [combineMaxTimeWindowMinutes, setCombineMaxTimeWindowMinutes] = useState<number>(30)
  
  // Настройки уведомлений
  const [enableNotifications, setEnableNotifications] = useState<boolean>(true)
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>({
    enableWarnings: true,
    enableTrafficWarnings: true
  })
  const [routeNotifications, setRouteNotifications] = useState<Map<string, Notification[]>>(new Map())
  
  // Данные о трафике и секторе (trafficData может использоваться для будущих предупреждений)
  const [_trafficData, setTrafficData] = useState<any>(null)
  const [sectorPathState, setSectorPathState] = useState<Array<{ lat: number; lng: number }> | null>(null)

  const ordersCount = useMemo(() => excelData?.orders?.length ?? 0, [excelData])

  const handleFile = useCallback(async (file: File) => {
    setIsProcessing(true)
    try {
      const data = await processExcelFile(file)
      setExcelData(data)
      setFileName(file.name)
    } catch (e) {
      console.error('Excel parse error', e)
      alert('Ошибка чтения Excel файла')
    } finally {
      setIsProcessing(false)
    }
  }, [])

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) void handleFile(f)
  }, [handleFile])

  const planRoutes = useCallback(async () => {
    if (!excelData || (excelData.orders?.length ?? 0) === 0) {
      alert('Сначала загрузите заказы из Excel')
      return
    }
    setIsPlanning(true)
    setErrorMsg('')
    setPlannedRoutes([])
    setExcludedOutsideSector(0)
    
    try {
      console.log('🚀 Начало автопланирования...')
      
      // Quick check for API key to avoid silent failure
      if (!localStorageUtils.hasApiKey()) {
        const msg = 'Нет Google Maps API ключа. Добавьте ключ в Настройках и попробуйте снова.'
        setErrorMsg(msg)
        console.error('❌', msg)
        setIsPlanning(false)
        return
      }
      
      console.log('✅ API ключ найден, загружаем Google Maps...')
      await googleMapsLoader.load()
      
      const gmaps: any = (window as any).google?.maps
      if (!gmaps) {
        const msg = 'Google Maps не инициализирован. Попробуйте обновить страницу.'
        console.error('❌', msg)
        throw new Error(msg)
      }
      console.log('✅ Google Maps загружен')

      const settings = localStorageUtils.getAllSettings()
      const city = (settings.cityBias || '') as '' | 'Киев' | 'Харьков' | 'Полтава' | 'Одесса'
      const cityAppend = city ? `, ${city}, Украина` : ', Украина'
      const region = 'UA'
      
      // Получаем начальный и конечный адреса из настроек
      const defaultStartAddress = settings.defaultStartAddress || 'Макеевская 7, Киев, Украина'
      const defaultEndAddress = settings.defaultEndAddress || 'Макеевская 7, Киев, Украина'
      
      console.log(`📍 Начальный адрес: ${defaultStartAddress}`)
      console.log(`📍 Конечный адрес: ${defaultEndAddress}`)
      
      // Очистка адреса от лишней информации
      const cleanAddress = (address: string) => {
        if (!address) return address
        return address
          .replace(/,\s*(под\.|подъезд|д\/ф|эт|этаж|эт\.|под|кв|квартира|оф|офис).*$/i, '')
          .replace(/,\s*\d+\s*(под\.|подъезд|д\/ф|эт|этаж|эт\.|под|кв|квартира|оф|офис).*$/i, '')
          .trim()
      }
      
      const normalizeAddr = (a: string) => {
        const base = cleanAddress(a).trim()
        if (!base) return base
        const lower = base.toLowerCase()
        const hasCity = city && lower.includes(city.toLowerCase())
        const hasCountry = lower.includes('украина') || lower.includes('україна') || lower.includes('ukraine')
        if (!hasCity && !hasCountry) return `${base}${cityAppend}`
        if (!hasCountry) return `${base}, Украина`
        return base
      }

      const now = Date.now()
      const orders = (excelData.orders || []).map((o: any) => ({ ...o }))

      // Build sector polygon and bounds if available
      let sectorPolygon: any = null
      let sectorBounds: any = null
      const sectorPath = city && settings.citySectors && settings.citySectors[city]
        ? settings.citySectors[city]
        : null
      if (sectorPath && window.google?.maps?.Polygon) {
        sectorPolygon = new window.google.maps.Polygon({ paths: sectorPath })
        // Создаём bounds для bias при геокодировании
        if (sectorPath.length >= 3) {
          const b = new window.google.maps.LatLngBounds()
          sectorPath.forEach((pt: any) => b.extend(new window.google.maps.LatLng(pt.lat, pt.lng)))
          sectorBounds = b
        }
        // Сохраняем путь сектора для тепловой карты
        setSectorPathState(sectorPath)
      } else {
        setSectorPathState(null)
      }

      // Генерируем альтернативные варианты записи улицы
      const generateStreetVariants = (raw: string): string[] => {
        const base = normalizeAddr(raw)
        const variants = new Set<string>()
        variants.add(base)
        
        const tokenPairs: Array<[RegExp, string]> = [
          [/\bвулиця\b/iu, 'вул.'],
          [/\bвул\.?\b/iu, 'вулиця'],
          [/\bулица\b/iu, 'ул.'],
          [/\bул\.?\b/iu, 'улица'],
          [/\bпровулок\b/iu, 'пров.'],
          [/\bпров\.?\b/iu, 'провулок'],
          [/\bпроспект\b/iu, 'просп.'],
          [/\bпросп\.?\b/iu, 'проспект'],
          [/\bлиния\b/iu, 'лінія'],
          [/\bлінія\b/iu, 'лін.'],
          [/\bлін\.?\b/iu, 'лінія']
        ]
        
        tokenPairs.forEach(([from, to]) => {
          try { variants.add(base.replace(from, to)) } catch {}
        })
        
        // Нормализация номера линии
        const lineForms = [
          base.replace(/\b(\d+)-(а|я)\b/iu, '$1$2'),
          base.replace(/\b(\d+)\s*(а|я)\b/iu, '$1-$2'),
          base.replace(/\b(\d+)-?(а|я)\b/iu, '$1'),
          base.replace(/\bперша\b/iu, '1-а'),
          base.replace(/\bпервая\b/iu, '1-я')
        ]
        lineForms.forEach(v => variants.add(v))
        
        // Если "1 лінія" без префикса типа улицы — добавим префиксы
        if (/\b(лінія|линия)\b/iu.test(base) && !/\b(вулиця|вул\.|улица|ул\.)\b/iu.test(base)) {
          variants.add(`вулиця ${base}`)
          variants.add(`вул. ${base}`)
          variants.add(`улица ${base}`)
          variants.add(`ул. ${base}`)
        }
        
        return Array.from(variants).filter(v => v && v !== base)
      }

      // Получаем центр сектора для использования как hintPoint
      const getSectorCenter = (): any => {
        if (!sectorPath || sectorPath.length === 0) return null
        let latSum = 0
        let lngSum = 0
        for (const pt of sectorPath) {
          latSum += pt.lat
          lngSum += pt.lng
        }
        return new window.google.maps.LatLng(latSum / sectorPath.length, lngSum / sectorPath.length)
      }

      // Helper: check address is inside sector polygon with improved geocoding
      const isInsideSector = async (addr: string): Promise<boolean> => {
        if (!sectorPolygon) return true
        
        const geocoder = new window.google.maps.Geocoder()
        const address = normalizeAddr(addr)
        
        // Первая попытка: базовый запрос с bounds
        const request: any = {
          address,
          region,
          componentRestrictions: { country: 'ua' }
        }
        if (sectorBounds) request.bounds = sectorBounds
        
        let results: any = await new Promise((resolve) => {
          geocoder.geocode(request, (res: any, status: any) => resolve(status === 'OK' ? res : []))
        })
        
        if (!results || results.length === 0) results = []
        
        // Проверяем, есть ли кандидаты внутри сектора
        let inside = results.filter((r: any) => {
          try {
            return window.google.maps.geometry.poly.containsLocation(r.geometry.location, sectorPolygon)
          } catch {
            return false
          }
        })
        
        // Если нет кандидатов внутри — пробуем альтернативные формы улицы
        if (inside.length === 0) {
          const alts = generateStreetVariants(addr)
          for (const alt of alts) {
            // eslint-disable-next-line no-await-in-loop
            const altRes: any = await new Promise((resolve) => {
              geocoder.geocode({ ...request, address: alt }, (res: any, status: any) => resolve(status === 'OK' ? res : []))
            })
            if (altRes && altRes.length > 0) {
              const insideAlt = altRes.filter((r: any) => {
                try {
                  return window.google.maps.geometry.poly.containsLocation(r.geometry.location, sectorPolygon)
                } catch {
                  return false
                }
              })
              if (insideAlt.length > 0) {
                inside = insideAlt
                break
              }
            }
          }
        }
        
        // Если всё ещё нет — пробуем reverse geocoding для получения sublocality
        if (inside.length === 0) {
          const sectorCenter = getSectorCenter()
          if (sectorCenter) {
            // Получаем sublocality из центра сектора
            const rev: any = await new Promise((resolve) => {
              geocoder.geocode({ location: sectorCenter }, (res: any, status: any) => resolve(status === 'OK' ? res : []))
            })
            if (rev && rev.length > 0) {
              const sub = (() => {
                for (const r of rev) {
                  const comp = (r.address_components || []).find((c: any) => 
                    c.types?.includes('sublocality') || 
                    c.types?.includes('neighborhood') ||
                    c.types?.includes('sublocality_level_1')
                  )
                  if (comp?.long_name) return comp.long_name
                }
                return null
              })()
              
              if (sub) {
                // Пробуем адрес с sublocality
                const withSub = `${address}, ${sub}`
                const subRes: any = await new Promise((resolve) => {
                  geocoder.geocode({ ...request, address: withSub }, (res: any, status: any) => resolve(status === 'OK' ? res : []))
                })
                if (subRes && subRes.length > 0) {
                  const insideSub = subRes.filter((r: any) => {
                    try {
                      return window.google.maps.geometry.poly.containsLocation(r.geometry.location, sectorPolygon)
                    } catch {
                      return false
                    }
                  })
                  if (insideSub.length > 0) {
                    inside = insideSub
                  }
                }
              }
            }
          }
        }
        
        // Если всё ещё нет — возвращаем false
        if (inside.length === 0) {
          console.warn(`❌ Адрес не найден внутри сектора: "${addr}" → "${address}"`)
          return false
        }
        
        // Возвращаем true если есть хотя бы один кандидат внутри сектора
        return true
      }

      // Helpers: parse times
      const parseTime = (val: any): number | null => {
        if (!val) return null
        const s = String(val).trim()
        // Try HH:mm
        const m = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
        if (m) {
          const base = new Date()
          base.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0)
          return base.getTime()
        }
        // Try date-time
        const d = new Date(s)
        if (!isNaN(d.getTime())) return d.getTime()
        return null
      }
      const getKitchenTime = (o: any): number | null => {
        // Сначала проверяем точные совпадения
        const exactFields = [
          'время на кухню', 'время_на_кухню', 'Время на кухню', 'Время_на_кухню', 'ВРЕМЯ НА КУХНЮ',
          'kitchen_time', 'kitchenTime', 'KitchenTime', 'KITCHEN_TIME',
          'kitchen', 'Kitchen', 'KITCHEN',
          'Kitchen Time', 'kitchen time', 'KITCHEN TIME',
          'Время готовности', 'время готовности', 'ВРЕМЯ ГОТОВНОСТИ',
          'Готовность', 'готовность', 'ГОТОВНОСТЬ'
        ]
        
        for (const field of exactFields) {
          if (o[field]) {
            const parsed = parseTime(o[field])
            if (parsed) return parsed
          }
        }
        
        // Затем проверяем регистронезависимо все ключи объекта на наличие полных фраз
        const searchPhrases = [
          'время на кухню', 'время_на_кухню', 'времянакухню',
          'kitchen_time', 'kitchentime', 'kitchen time',
          'время готовности', 'время_готовности', 'времязаготовности',
          'готовность'
        ]
        for (const key in o) {
          const lowerKey = key.toLowerCase().trim()
          // Ищем полные фразы в названии поля
          for (const phrase of searchPhrases) {
            if (lowerKey === phrase || lowerKey.includes(phrase)) {
              const parsed = parseTime(o[key])
              if (parsed) return parsed
            }
          }
        }
        
        return null
      }
      
      const getPlannedTime = (o: any): number | null => {
        // Сначала проверяем точные совпадения
        const exactFields = [
          'плановое время', 'плановое_время', 'Плановое время', 'Плановое_время', 'ПЛАНОВОЕ ВРЕМЯ',
          'plannedTime', 'planned_time', 'PlannedTime', 'PLANNED_TIME',
          'Planned Time', 'planned time', 'PLANNED TIME',
          'Дедлайн', 'дедлайн', 'ДЕДЛАЙН', 'deadline', 'Deadline', 'DEADLINE',
          'deadlineAt', 'deadline_at',
          'Время доставки', 'время доставки', 'ВРЕМЯ ДОСТАВКИ',
          'delivery_time', 'deliveryTime', 'DeliveryTime'
        ]
        
        for (const field of exactFields) {
          if (o[field]) {
            const parsed = parseTime(o[field])
            if (parsed) return parsed
          }
        }
        
        // Затем проверяем регистронезависимо все ключи объекта на наличие полных фраз (исключая поля связанные с кухней)
        const searchPhrases = [
          'плановое время', 'плановое_время', 'плановоевремя',
          'planned_time', 'plannedtime', 'planned time',
          'дедлайн', 'deadline',
          'время доставки', 'время_доставки', 'времядодоставки',
          'delivery_time', 'deliverytime', 'delivery time'
        ]
        for (const key in o) {
          const lowerKey = key.toLowerCase().trim()
          // Пропускаем поля связанные с кухней
          if (lowerKey.includes('кухню') || lowerKey.includes('kitchen')) continue
          
          // Ищем полные фразы в названии поля
          for (const phrase of searchPhrases) {
            if (lowerKey === phrase || lowerKey.includes(phrase)) {
              const parsed = parseTime(o[key])
              if (parsed) return parsed
            }
          }
        }
        
        // Если не нашли специальные поля, пробуем общее поле "время" или "time" (но не кухня)
        const generalFields = ['время', 'Время', 'ВРЕМЯ', 'time', 'Time', 'TIME']
        for (const field of generalFields) {
          if (o[field]) {
            // Проверяем что это не поле кухни
            if (!o[`${field}_на_кухню`] && !o[`${field} на кухню`] && !o[`kitchen_${field}`]) {
              const parsed = parseTime(o[field])
              if (parsed) return parsed
            }
          }
        }
        
        return null
      }

      // Функция для валидации адреса - проверяем, что это действительно адрес
      const isValidAddress = (str: string): boolean => {
        if (!str || str.trim().length < 5) return false
        
        // Исключаем инструкции, комментарии и ложные адреса
        const invalidPatterns = [
          /зателефонувати|зателефоновать|позвонить|call|звон/i,
          /хвилин|минут|minutes/i,
          /до доставки|перед доставкой|before delivery/i,
          /примітка|примечание|note|комментарий|коментар/i,
          /инструкция|інструкція|instruction/i,
          /упаковка|packaging/i,
          /коментар|комментарий|comment/i,
          /примечание|примітка|note/i,
          /^только|only|тільки/i,
          /^без |без$|without/i
        ]
        
        // Проверяем, что это не инструкция/комментарий
        for (const pattern of invalidPatterns) {
          if (pattern.test(str)) {
            return false
          }
        }
        
        // Адрес должен содержать хотя бы один из маркеров адреса:
        // - название улицы/проспекта/бульвара
        // - номер дома (цифра)
        // - название города
        const addressMarkers = [
          /\b(вул|вулиця|улица|ул\.?|проспект|просп\.?|провулок|пров\.?|бульвар|бул\.?|линия|лінія|лін\.?|площа|площадь|пл\.?)\b/i,
          /\b\d+[а-я]?\b/, // номер дома (например, "14", "14а", "14-а")
          /\b(киев|київ|kiev|kyiv|одесса|одеса|харьков|харків|полтава)\b/i,
          /\b(под\.|подъезд|эт\.|этаж|кв\.|квартира|оф\.|офис)\b/i // части адреса
        ]
        
        // Должен содержать хотя бы один маркер адреса
        const hasAddressMarker = addressMarkers.some(pattern => pattern.test(str))
        
        // Не должен быть только телефоном, email или числом
        const isNotPhone = !/^[\d\+\-\(\)\s]+$/.test(str)
        const isNotEmail = !/^[\w\.-]+@[\w\.-]+\.\w+$/.test(str)
        const isNotOnlyNumber = !/^\d+$/.test(str)
        
        // Должен быть достаточно длинным и содержать кириллицу/латиницу
        const hasText = str.length > 10 && /[а-яА-ЯёЁіІїЇєЄa-zA-Z]/.test(str)
        
        return hasAddressMarker && isNotPhone && isNotEmail && isNotOnlyNumber && hasText
      }

      // Filter orders by sector if polygon defined
      console.log(`📋 Фильтрация ${orders.length} заказов по сектору и валидация адресов...`)
      console.log('📋 Примеры адресов из Excel:', orders.slice(0, 5).map(o => `${o.orderNumber || '?'}: "${o.address}"`))
      
      const filteredOrders: any[] = []
      const excludedAddresses: string[] = []
      let excluded = 0
      
      for (let i = 0; i < orders.length; i++) {
        const o = orders[i]
        // Проверяем все возможные поля с адресом
        const addr = o.address || o['адрес'] || o['address'] || o['адрес_доставки'] || o['address_delivery'] || ''
        
        if (!addr || !String(addr).trim()) {
          excluded++
          excludedAddresses.push(`${i + 1}. (пустой адрес) | orderNumber: ${o.orderNumber || '?'}`)
          console.warn(`⚠️ Заказ ${i + 1}: пустой адрес`)
          continue
        }
        
        const addrStr = String(addr).trim()
        
        // ВАЛИДАЦИЯ АДРЕСА - проверяем, что это действительно адрес, а не инструкция
        if (!isValidAddress(addrStr)) {
          excluded++
          excludedAddresses.push(`${i + 1}. (невалидный адрес: "${addrStr.substring(0, 50)}...") | orderNumber: ${o.orderNumber || '?'}`)
          console.warn(`⚠️ Заказ ${i + 1} (${o.orderNumber || '?'}): невалидный адрес (инструкция/комментарий): "${addrStr.substring(0, 60)}"`)
          continue
        }
        
        // eslint-disable-next-line no-await-in-loop
        const inside = await isInsideSector(addrStr)
        if (inside) {
          filteredOrders.push(o)
        } else {
          excluded++
          excludedAddresses.push(`${i + 1}. ${addrStr}`)
          if (excludedAddresses.length <= 10) {
            console.log(`⚠️ Заказ ${i + 1} (${o.orderNumber || '?'}) вне сектора: "${addrStr}"`)
          }
        }
        
        // Показываем прогресс каждые 50 заказов
        if ((i + 1) % 50 === 0) {
          console.log(`  Проверено ${i + 1}/${orders.length}, прошло: ${filteredOrders.length}, исключено: ${excluded}`)
        }
      }
      
      setExcludedOutsideSector(excluded)
      console.log(`✅ Прошло фильтр: ${filteredOrders.length}, исключено: ${excluded}`)
      
      if (excluded > 0 && excluded <= 20) {
        console.log('📋 Исключённые адреса:', excludedAddresses.slice(0, 20))
        if (excluded > 20) {
          console.log(`  ... и ещё ${excluded - 20} адресов`)
        }
      }
      
      if (filteredOrders.length === 0) {
        const msg = `Нет заказов внутри сектора города. Исключено: ${excluded}${excluded > 0 ? `. Проверьте границы сектора в Настройках и формат адресов.` : ''}`
        setErrorMsg(msg)
        console.warn('⚠️', msg)
        if (excludedAddresses.length > 0) {
          console.log('Первые исключённые адреса:', excludedAddresses.slice(0, 10))
        }
        setIsPlanning(false)
        return
      }

      // Enrich orders with scheduling info
      const enriched = filteredOrders.map((o: any, idx: number) => {
        const ready = getKitchenTime(o)
        const readyWithPack = ready ? ready + 4 * 60 * 1000 : null // +4 мин упаковка
        const deadline = getPlannedTime(o)
        
        // Отладочная информация для первого заказа
        if (idx === 0) {
          console.log('🔍 Пример обогащения заказа:', {
            orderNumber: o.orderNumber,
            address: o.address,
            'время на кухню из Excel': o['время на кухню'] || o['время_на_кухню'] || o.kitchen_time || o.kitchenTime,
            'плановое время из Excel': o['плановое время'] || o['плановое_время'] || o.plannedTime || o.planned_time,
            ready: ready,
            readyWithPack: readyWithPack,
            deadline: deadline,
            'все ключи объекта': Object.keys(o)
          })
        }
        
        return {
          idx,
          address: o.address || '',
          raw: { ...o }, // Создаем копию объекта, чтобы сохранить все поля из Excel
          orderNumber: o.orderNumber || o.raw?.orderNumber || `#${idx + 1}`, // Сохраняем номер заказа
          readyAt: readyWithPack, // earliest pickup
          deadlineAt: deadline,   // must arrive before this
          // Также сохраняем все поля напрямую, чтобы они были доступны везде
          ...o, // Распространяем все поля из исходного объекта
          // Сохраняем также исходные значения для отладки
          'время на кухню': o['время на кухню'] || o['время_на_кухню'] || o.kitchen_time || o.kitchenTime || null,
          'плановое время': o['плановое время'] || o['плановое_время'] || o.plannedTime || o.planned_time || null,
        }
      })
      // Sort primarily by deadline, then by ready time
      enriched.sort((a, b) => {
        const da = a.deadlineAt ?? Number.POSITIVE_INFINITY
        const db = b.deadlineAt ?? Number.POSITIVE_INFINITY
        if (da !== db) return da - db
        const ra = a.readyAt ?? Number.NEGATIVE_INFINITY
        const rb = b.readyAt ?? Number.NEGATIVE_INFINITY
        return ra - rb
      })

      // Получаем координаты для всех заказов (для объединения)
      console.log('📍 Получаю координаты для объединения заказов...')
      const enrichedWithCoords = await Promise.all(enriched.map(async (order) => {
        const geocoder = new gmaps.Geocoder()
        const normalizedAddr = normalizeAddr(order.address)
        const coords: any = await new Promise((resolve) => {
          geocoder.geocode({
            address: normalizedAddr,
            region,
            componentRestrictions: { country: 'ua' }
          }, (res: any, status: any) => {
            if (status === 'OK' && res && res.length > 0) {
              const loc = res[0].geometry.location
              resolve({ lat: loc.lat(), lng: loc.lng() })
            } else {
              resolve(null)
            }
          })
        })
        return { ...order, coords }
      }))

      // Автоматическое объединение заказов (если включено)
      let ordersToPlan: OptimizationOrder[] = enrichedWithCoords.map(o => ({
        idx: o.idx,
        address: o.address,
        raw: o.raw,
        orderNumber: o.orderNumber,
        readyAt: o.readyAt,
        deadlineAt: o.deadlineAt,
        coords: o.coords
      }))

      if (enableOrderCombining && ordersToPlan.length > 1) {
        console.log(`🔗 Объединяю заказы (макс. расстояние: ${combineMaxDistanceMeters}м, окно времени: ${combineMaxTimeWindowMinutes}мин)...`)
        const combinedGroups = combineOrders(ordersToPlan, {
          maxDistanceMeters: combineMaxDistanceMeters,
          maxTimeWindowMinutes: combineMaxTimeWindowMinutes,
          maxOrdersPerGroup: 3 // Максимум 3 заказа в одну группу
        })

        // Преобразуем группы обратно в отдельные заказы, но помечаем объединенные
        const combinedCount = combinedGroups.filter(g => g.length > 1).reduce((sum, g) => sum + g.length, 0)
        const originalCount = ordersToPlan.length
        if (combinedCount > originalCount || combinedGroups.some(g => g.length > 1)) {
          console.log(`✅ Объединено заказов: найдено ${combinedGroups.filter(g => g.length > 1).length} групп с объединенными заказами`)
          // Пока оставляем заказы как есть, но помечаем объединенные для отображения
          // В будущем можно реализовать визуальную группировку
        }

        // Распаковываем группы обратно в массив заказов для планирования
        // (пока не реализуем полное объединение, т.к. это требует изменений в логике планирования)
        ordersToPlan = combinedGroups.flat()
      }

      const directionsService = new gmaps.DirectionsService()

      // Константы для буферов времени (используются во всех расчетах)
      const FORCE_MAJEURE_MINUTES = 9 // Форс-мажор на каждый заказ
      const DELIVERY_TIME_MINUTES = 5 // Время на отдачу заказа курьером
      const FORCE_MAJEURE_MS = FORCE_MAJEURE_MINUTES * 60 * 1000
      const DELIVERY_TIME_MS = DELIVERY_TIME_MINUTES * 60 * 1000

      // Быстрая оценка расстояния через Haversine (для предварительной фильтрации)
      const haversineDistance = (lat1: number, lng1: number, lat2: number, lng2: number): number => {
        const R = 6371 // радиус Земли в км
        const dLat = (lat2 - lat1) * Math.PI / 180
        const dLng = (lng2 - lng1) * Math.PI / 180
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLng / 2) * Math.sin(dLng / 2)
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
        return R * c
      }

      // Получаем координаты адреса (без кэширования)
      const getCoordinates = async (address: string): Promise<{ lat: number; lng: number } | null> => {
        const geocoder = new gmaps.Geocoder()
        const normalizedAddr = normalizeAddr(address)
        const result: any = await new Promise((resolve) => {
          geocoder.geocode({
            address: normalizedAddr,
            region,
            componentRestrictions: { country: 'ua' }
          }, (res: any, status: any) => {
            if (status === 'OK' && res && res.length > 0) {
              const loc = res[0].geometry.location
              resolve({ lat: loc.lat(), lng: loc.lng() })
            } else {
              resolve(null)
            }
          })
        })
        return result
      }

      // Предварительная оценка кандидата (быстрая, без Directions API)
      const quickEvaluateCandidate = async (
        candidate: any,
        lastOrderCoords: { lat: number; lng: number } | null
      ): Promise<{ score: number; distanceKm: number; reason: string }> => {
        if (!lastOrderCoords) {
          // Если нет координат последнего заказа, берём стартовый адрес
          const startCoords = await getCoordinates(defaultStartAddress)
          if (!startCoords) return { score: 0, distanceKm: Infinity, reason: 'Не удалось получить координаты старта' }
          lastOrderCoords = startCoords
        }

        const candidateCoords = await getCoordinates(candidate.address)
        if (!candidateCoords) {
          return { score: 0, distanceKm: Infinity, reason: 'Не удалось получить координаты кандидата' }
        }

        const distanceKm = haversineDistance(
          lastOrderCoords.lat, lastOrderCoords.lng,
          candidateCoords.lat, candidateCoords.lng
        )

        // Оценка с приоритетом на своевременную доставку:
        // 1. ПРИОРИТЕТ: Время доставки (готовность + плановое время) - макс 150 баллов
        //    - Чем раньше заказ готов, тем выше приоритет
        //    - Чем ближе дедлайн, тем выше приоритет
        // 2. ВТОРИЧНО: Близость (меньше расстояние = выше оценка, макс 50 баллов)
        let score = 0
        const now = Date.now()
        
        // Приоритет 1: Готовность заказа (время на кухню)
        // Чем раньше заказ готов, тем выше приоритет
        if (candidate.readyAt) {
          const hoursUntilReady = (candidate.readyAt - now) / (1000 * 60 * 60)
          if (hoursUntilReady >= 0 && hoursUntilReady < 24) {
            // Заказ готов или скоро будет готов - высший приоритет
            score += 100 * (1 - Math.min(hoursUntilReady, 24) / 24)
          } else if (hoursUntilReady < 0) {
            // Заказ уже готов - максимальный приоритет
            score += 100
          }
        } else {
          // Если нет времени готовности, считаем что заказ готов сейчас
          score += 100
        }

        // Приоритет 2: Плановое время доставки (дедлайн)
        // Чем ближе дедлайн, тем выше приоритет
        if (candidate.deadlineAt) {
          const hoursUntilDeadline = (candidate.deadlineAt - now) / (1000 * 60 * 60)
          if (hoursUntilDeadline > 0 && hoursUntilDeadline < 48) {
            // Близкий дедлайн - высокий приоритет
            score += 50 * (1 - Math.min(hoursUntilDeadline, 48) / 48)
          } else if (hoursUntilDeadline <= 0) {
            // Просроченный заказ - критический приоритет, но ниже чем готовые заказы
            score += 30
          }
        }

        // Вторичный фактор: Близость (для минимизации времени/расстояния)
        // Учитывается только если заказы уже приоритетны по времени
        const maxDistKm = 30 // Максимальное расстояние для оценки
        if (score > 50) { // Только для приоритетных заказов
          score += Math.max(0, 50 * (1 - Math.min(distanceKm, maxDistKm) / maxDistKm))
        } else {
          // Для неприоритетных заказов расстояние всё равно учитывается, но меньше
          score += Math.max(0, 20 * (1 - Math.min(distanceKm, maxDistKm) / maxDistKm))
        }

        return {
          score,
          distanceKm,
          reason: `Готов: ${candidate.readyAt ? new Date(candidate.readyAt).toLocaleTimeString() : 'сейчас'}, Дедлайн: ${candidate.deadlineAt ? new Date(candidate.deadlineAt).toLocaleTimeString() : 'нет'}, Расстояние: ${distanceKm.toFixed(1)} км`
        }
      }

      // Check ETA feasibility of a chain using Google durations
      // chain - это массив заказов (без начального и конечного адресов)
      // Функция рассчитывает: startAddress -> заказы -> endAddress
      const checkChainFeasible = async (chain: any[], includeStartEnd: boolean = true): Promise<{ feasible: boolean, legs?: any, totalDuration?: number, totalDistance?: number }> => {
        if (chain.length === 0) {
          // Если нет заказов, считаем путь от старта до финиша
          if (!includeStartEnd) return { feasible: true, totalDuration: 0, totalDistance: 0 }
          const origin = normalizeAddr(defaultStartAddress)
          const destination = normalizeAddr(defaultEndAddress)
          const req: any = {
            origin,
            destination,
            travelMode: gmaps.TravelMode.DRIVING,
            unitSystem: gmaps.UnitSystem.METRIC,
            region
          }
          const res: any = await new Promise((resolve) => {
            directionsService.route(req, (r: any, status: any) => {
              if (status === gmaps.DirectionsStatus.OK) resolve(r); else resolve(null)
            })
          })
        if (!res) return { feasible: false }
        const legs = res.routes?.[0]?.legs || []
        // Используем duration_in_traffic если доступно (учитывает трафик), иначе duration
        const totalDuration = legs.reduce((acc: number, leg: any) => {
          const duration = leg.duration_in_traffic?.value || leg.duration?.value || 0
          return acc + duration
        }, 0)
        const totalDistance = legs.reduce((acc: number, leg: any) => acc + (leg.distance?.value || 0), 0)
        return { feasible: true, legs, totalDuration, totalDistance }
        }
        
        // Формируем полный маршрут: startAddress -> заказы -> endAddress
        const origin = includeStartEnd ? normalizeAddr(defaultStartAddress) : normalizeAddr(chain[0].address)
        const destination = includeStartEnd ? normalizeAddr(defaultEndAddress) : normalizeAddr(chain[chain.length - 1].address)
        const waypoints = includeStartEnd 
          ? chain.map(n => ({ location: normalizeAddr(n.address), stopover: true }))
          : chain.slice(1, chain.length - 1).map(n => ({ location: normalizeAddr(n.address), stopover: true }))
        
        const req: any = {
          origin,
          destination,
          waypoints: waypoints.length > 0 ? waypoints : undefined,
          travelMode: gmaps.TravelMode.DRIVING,
          optimizeWaypoints: false, // Сохраняем порядок заказов как есть
          unitSystem: gmaps.UnitSystem.METRIC,
          region
        }
        const res: any = await new Promise((resolve) => {
          directionsService.route(req, (r: any, status: any) => {
            if (status === gmaps.DirectionsStatus.OK) resolve(r); else resolve(null)
          })
        })
        if (!res) return { feasible: false }
        const legs = res.routes?.[0]?.legs || []
        // Используем duration_in_traffic если доступно (учитывает трафик), иначе duration
        const totalDuration = legs.reduce((acc: number, leg: any) => {
          const duration = leg.duration_in_traffic?.value || leg.duration?.value || 0
          return acc + duration
        }, 0)
        const totalDistance = legs.reduce((acc: number, leg: any) => acc + (leg.distance?.value || 0), 0)
        return { feasible: true, legs, totalDuration, totalDistance }
      }

      console.log(`📊 Начинаем формирование маршрутов из ${ordersToPlan.length} заказов...`)
      
      // Преобразуем ordersToPlan обратно в формат enriched для совместимости
      const enrichedForPlanning = ordersToPlan.map(o => ({
        idx: o.idx,
        address: o.address,
        raw: o.raw,
        orderNumber: o.orderNumber,
        readyAt: o.readyAt,
        deadlineAt: o.deadlineAt,
        coords: o.coords,
        'время на кухню': o.raw?.['время на кухню'] || null,
        'плановое время': o.raw?.['плановое время'] || null
      }))
      
      // Сортируем заказы по приоритету: готовность > дедлайн > близость
      // Приоритет 1: Готовые заказы (readyAt <= now) или скоро готовые
      // Приоритет 2: Близкие дедлайны
      enrichedForPlanning.sort((a: any, b: any) => {
        const now = Date.now()
        
        // 1. Готовые заказы всегда выше неприготовленных
        const aReady = a.readyAt ? (a.readyAt <= now ? 1 : 0) : 1 // Нет readyAt = готов
        const bReady = b.readyAt ? (b.readyAt <= now ? 1 : 0) : 1
        if (aReady !== bReady) return bReady - aReady
        
        // 2. Среди готовых/неготовых сортируем по времени готовности
        if (a.readyAt && b.readyAt) {
          const aReadyTime = a.readyAt
          const bReadyTime = b.readyAt
          if (aReadyTime !== bReadyTime) return aReadyTime - bReadyTime
        } else if (a.readyAt && !b.readyAt) {
          return a.readyAt <= now ? -1 : 1 // Готовый a выше
        } else if (!a.readyAt && b.readyAt) {
          return b.readyAt <= now ? 1 : -1 // Готовый b выше
        }
        
        // 3. Если готовность одинаковая, сортируем по дедлайну
        if (a.deadlineAt && b.deadlineAt) {
          return a.deadlineAt - b.deadlineAt // Ближе дедлайн = выше приоритет
        } else if (a.deadlineAt && !b.deadlineAt) {
          return -1 // Есть дедлайн выше
        } else if (!a.deadlineAt && b.deadlineAt) {
          return 1
        }
        
        return 0
      })
      
      const routes: any[] = []
      let remaining = enrichedForPlanning.slice()

      while (remaining.length > 0) {
        // Start route from the highest priority order (готовый + ранний дедлайн)
        const seed = remaining.shift()!
        let routeChain = [seed] // routeChain содержит только заказы (без старта и финиша)
        console.log(`🔄 Создаём маршрут #${routes.length + 1}, первый заказ: ${seed.address}`)

        // Сохраняем подробную информацию о логике формирования маршрута
        const routeReasons: string[] = []
        const seedReadyInfo = seed.readyAt 
          ? (seed.readyAt <= Date.now() ? 'готов' : `готов через ${Math.round((seed.readyAt - Date.now()) / 60000)} мин`)
          : 'готов'
        const seedDeadlineInfo = seed.deadlineAt 
          ? `дедлайн: ${new Date(seed.deadlineAt).toLocaleTimeString()}`
          : 'дедлайн: нет'
        routeReasons.push(`🚀 Начало маршрута: "${seed.address.substring(0, 50)}..." | 
          Готовность: ${seedReadyInfo} | ${seedDeadlineInfo} | 
          Выбран как первый, т.к. имеет наивысший приоритет (готовность + ранний дедлайн)`)
        
        // Получаем координаты последнего заказа в цепочке для быстрой оценки
        let lastOrderCoords: { lat: number; lng: number } | null = null
        if (routeChain.length > 0) {
          lastOrderCoords = await getCoordinates(routeChain[routeChain.length - 1].address)
        }
        
        // Предварительная оценка всех кандидатов (быстрая фильтрация)
        const candidateEvaluations = await Promise.all(
          remaining.slice(0, Math.min(remaining.length, 50)).map(async (candidate, idx) => {
            const evaluation = await quickEvaluateCandidate(candidate, lastOrderCoords)
            return { candidate, originalIndex: idx, ...evaluation }
          })
        )
        
        // Сортируем по оценке (лучшие первыми) и фильтруем явно неподходящие
        candidateEvaluations.sort((a, b) => b.score - a.score)
        const promisingCandidates = candidateEvaluations.filter(e => 
          e.score > 0 && 
          e.distanceKm <= maxRouteDistanceKm * 1.5 // Грубая проверка дистанции
        )
        
        console.log(`📊 Оценено кандидатов: ${candidateEvaluations.length}, перспективных: ${promisingCandidates.length}`)

        // Greedy add next orders by score (близость + дедлайн)
        // Максимум заказов = maxStopsPerRoute (от 1 до указанного значения)
        let processedCount = 0
        for (const evalItem of promisingCandidates) {
          if (routeChain.length >= maxStopsPerRoute) break
          if (processedCount >= 30) break // Лимит проверок для производительности
          
          const candidate = evalItem.candidate
          const trialChain: any[] = [...routeChain, candidate]
          
          try {
            // Проверяем маршрут с учётом стартового и конечного адресов
            const result = await checkChainFeasible(trialChain, true)
            const feasible = result.feasible
            const legs = result.legs
            
            if (!feasible || !legs || legs.length === 0) {
              console.log(`⚠️ Кандидат "${candidate.address.substring(0, 40)}..." не подходит (не удалось построить маршрут)`)
              processedCount++
              continue
            }

          // Compute ETAs per stop relative to a start time that respects readyAt
          // Структура legs: [start->order1, order1->order2, ..., orderN->end]
          // Всего legs = количество заказов + 1 (старт->первый заказ) + 1 (последний заказ->финиш)
          const startTime = Math.max(now, (trialChain[0].readyAt ?? now))
          let currentEta = startTime
          let totalWaitMs = 0
          let ok = true
          
          // Проверяем каждый заказ по порядку
          // leg[0] = путь от стартового адреса к первому заказу
          // leg[1..n-1] = пути между заказами
          // leg[n] = путь от последнего заказа к финишу (не проверяем дедлайны для него)
          for (let j = 0; j < trialChain.length; j++) {
            const legIndex = j // leg[j] - путь к заказу j (или от start, или от предыдущего заказа)
            if (legIndex >= legs.length - 1) break // -1 потому что последний leg это путь к финишу
            
            const leg = legs[legIndex]
            // Используем duration_in_traffic если доступно (учитывает трафик), иначе duration
            const travelSeconds = leg.duration_in_traffic?.value || leg.duration?.value || 0
            const travel = travelSeconds * 1000
            currentEta += travel
            
            const node = trialChain[j] // текущий заказ
            // If node has readyAt in future, we allow waiting (courier can wait), but enforce deadline if present
            const deadline = node.deadlineAt
            const readyAt = node.readyAt
            if (readyAt && currentEta < readyAt) {
              const wait = readyAt - currentEta
              const waitMin = wait / 60000
              if (waitMin > maxWaitPerStopMin) { ok = false; break }
              totalWaitMs += wait
              currentEta = readyAt
            }
            
            // Добавляем время на отдачу заказа (+5 минут) после прибытия
            currentEta += DELIVERY_TIME_MS
            
            // Проверяем дедлайн: форс-мажор (+9 минут) расширяет дедлайн (не добавляется к ETA)
            // Плановое время 10:00 -> с форс-мажором дедлайн становится 10:09
            if (deadline) {
              const deadlineWithForceMajeure = deadline + FORCE_MAJEURE_MS
              if (currentEta > deadlineWithForceMajeure) { 
                ok = false
                break
              }
            }
          }
          // Hard limits by route totals
          // legs включает: [start->order1, order1->order2, ..., orderN->end]
          // При проверке лимитов используем только время до последнего заказа (без возврата)
          // legs.slice(0, trialChain.length) = все legs кроме последнего (пути к финишу)
          const timeToLastOrder = legs.slice(0, trialChain.length).reduce((acc: number, leg: any) => {
            // Используем duration_in_traffic если доступно (учитывает трафик)
            return acc + (leg.duration_in_traffic?.value || leg.duration?.value || 0)
          }, 0)
          const distanceToLastOrder = legs.slice(0, trialChain.length).reduce((acc: number, leg: any) => {
            return acc + (leg.distance?.value || 0)
          }, 0)
          
          // Добавляем только время на отдачу для каждого заказа (форс-мажор расширяет дедлайн, не добавляется к времени)
          const deliveryTimeSeconds = trialChain.length * DELIVERY_TIME_MINUTES * 60
          
          // Проверяем лимиты только по времени/дистанции до последнего заказа (без возврата)
          const totalMin = (timeToLastOrder + totalWaitMs / 1000 + deliveryTimeSeconds) / 60
          const totalKm = distanceToLastOrder / 1000
          
          if (ok && totalMin <= maxRouteDurationMin && totalKm <= maxRouteDistanceKm) {
            routeChain = trialChain
            // Удаляем кандидата из remaining по оригинальному индексу
            const removeIndex = remaining.findIndex(r => r.address === candidate.address && 
              (r.orderNumber === candidate.orderNumber || r.raw?.orderNumber === candidate.raw?.orderNumber))
            if (removeIndex !== -1) {
              remaining.splice(removeIndex, 1)
            }
            
            // Обновляем координаты последнего заказа для следующей итерации
            lastOrderCoords = await getCoordinates(candidate.address)
            
            // Сохраняем подробную причину добавления
            const candidateReadyInfo = candidate.readyAt 
              ? (candidate.readyAt <= Date.now() ? 'готов' : `готов через ${Math.round((candidate.readyAt - Date.now()) / 60000)} мин`)
              : 'готов'
            const candidateDeadlineInfo = candidate.deadlineAt 
              ? `дедлайн: ${new Date(candidate.deadlineAt).toLocaleTimeString()}`
              : 'дедлайн: нет'
            const arrivalTime = new Date(currentEta).toLocaleTimeString()
            const reason = `✅ Добавлен заказ "${candidate.address.substring(0, 40)}..." | 
              Готовность: ${candidateReadyInfo} | ${candidateDeadlineInfo} | 
              Прибытие курьера: ~${arrivalTime} | 
              Время в пути: ${totalMin.toFixed(1)} мин | Дистанция: ${totalKm.toFixed(1)} км | 
              Оценка приоритета: ${evalItem.score.toFixed(0)}/200 (готовность+дедлайн+близость)`
            routeReasons.push(reason)
            console.log(`✅ Добавлен заказ в маршрут, точек: ${routeChain.length}`)
            
            // Прерываем цикл, так как нашли подходящий заказ
            break
          } else {
            if (!ok) console.log(`⚠️ Кандидат "${candidate.address.substring(0, 40)}..." не подходит (нарушает дедлайн или лимит ожидания)`)
            else console.log(`⚠️ Кандидат "${candidate.address.substring(0, 40)}..." не подходит (превышает лимиты: ${totalMin.toFixed(1)}мин/${totalKm.toFixed(1)}км)`)
            processedCount++
          }
          } catch (err) {
            console.error(`❌ Ошибка при проверке кандидата:`, err)
            processedCount++
          }
        }

        // Пересчитываем финальный маршрут для получения актуальных данных (с учётом старта и финиша)
        const finalCheck = await checkChainFeasible(routeChain, true)
        let finalLegs = finalCheck.legs || []
        let finalTotalDuration = finalCheck.totalDuration ?? 0
        let finalTotalDistance = finalCheck.totalDistance ?? 0
        
        // Локальная оптимизация: проверяем перестановки соседних заказов (2-opt)
        // Это может улучшить маршрут без изменения количества заказов
        if (routeChain.length >= 2) {
          console.log(`🔧 Проверяю локальную оптимизацию для ${routeChain.length} заказов...`)
          let improved = true
          let iterations = 0
          const maxIterations = 3 // Ограничиваем количество итераций
          
          while (improved && iterations < maxIterations) {
            improved = false
            iterations++
            
            // Пробуем переставить соседние пары заказов
            for (let i = 0; i < routeChain.length - 1; i++) {
              const testChain: any[] = [...routeChain]
              // Меняем местами заказы i и i+1
              const temp = testChain[i]
              testChain[i] = testChain[i + 1]
              testChain[i + 1] = temp
              
              const testResult = await checkChainFeasible(testChain, true)
              if (testResult.feasible && testResult.legs) {
                const testDuration = testResult.totalDuration ?? 0
                const testDistance = testResult.totalDistance ?? 0
                
                // Проверяем, лучше ли новый маршрут и соблюдает ли дедлайны
                const testStartTime = Math.max(now, (testChain[0].readyAt ?? now))
                let testEta = testStartTime
                let testOk = true
                
                for (let j = 0; j < testChain.length && j < testResult.legs.length - 1; j++) {
                  const leg = testResult.legs[j]
                  // Используем duration_in_traffic если доступно (учитывает трафик)
                  const travelSeconds = leg.duration_in_traffic?.value || leg.duration?.value || 0
                  testEta += travelSeconds * 1000
                  
                  const node = testChain[j]
                  
                  if (node.readyAt && testEta < node.readyAt) {
                    const wait = (node.readyAt - testEta) / 60000
                    if (wait > maxWaitPerStopMin) {
                      testOk = false
                      break
                    }
                    testEta = node.readyAt
                  }
                  
                  // Добавляем время на отдачу заказа (+5 минут)
                  testEta += DELIVERY_TIME_MS
                  
                  // Проверяем дедлайн: форс-мажор (+9 минут) расширяет дедлайн
                  if (node.deadlineAt) {
                    const deadlineWithForceMajeure = node.deadlineAt + FORCE_MAJEURE_MS
                    if (testEta > deadlineWithForceMajeure) {
                      testOk = false
                      break
                    }
                  }
                }
                
                // Если новый маршрут лучше по времени ИЛИ расстоянию (но главное - соблюдает дедлайны)
                // Приоритет: соблюдение дедлайнов важнее сокращения расстояния
                const timeBetter = testDuration < finalTotalDuration
                const distanceBetter = testDistance < finalTotalDistance
                const timeNotMuchWorse = testDuration <= finalTotalDuration * 1.1
                
                // Применяем оптимизацию только если:
                // 1. Соблюдает дедлайны (testOk)
                // 2. Лучше по расстоянию ИЛИ времени
                // 3. Не увеличивает время более чем на 10% (если сокращаем расстояние)
                if (testOk && (distanceBetter || timeBetter) && timeNotMuchWorse) {
                  const savedDistance = finalTotalDistance - testDistance
                  const savedTime = (finalTotalDuration - testDuration) / 60
                  routeChain = testChain
                  finalLegs = testResult.legs
                  finalTotalDuration = testDuration
                  finalTotalDistance = testDistance
                  improved = true
                  const improvement = []
                  if (savedTime > 0) improvement.push(`время уменьшено на ${savedTime.toFixed(1)} мин`)
                  if (savedDistance > 0) improvement.push(`дистанция уменьшена на ${(savedDistance / 1000).toFixed(1)} км`)
                  routeReasons.push(`🔧 Локальная оптимизация (2-opt): улучшен порядок заказов | ${improvement.join(', ')} | 
                    Все дедлайны соблюдены`)
                  console.log(`✅ Локальная оптимизация улучшила маршрут (итерация ${iterations})`)
                  break // Начнём заново с нового порядка
                }
              }
            }
          }
        }
        
        // Общее время включает возврат, но это только для информации
        
        // Finalize routeChain into a route object
        // Старт и финиш - это defaultStartAddress и defaultEndAddress
        const waypoints = routeChain.map(n => ({ address: n.address }))
        
        // Сохраняем номера заказов для отображения
        const orderNumbers = routeChain.map((n, idx) => n.orderNumber || n.raw?.orderNumber || `#${idx + 1}`)
        
        routes.push({
          id: `auto-${now}-${routes.length + 1}`,
          name: `Авто-маршрут (${fileName || 'Excel'}) ${routes.length + 1}`,
          startAddress: defaultStartAddress,
          endAddress: defaultEndAddress,
          waypoints,
          createdAt: now,
          // Метаданные маршрута
          routeChain: routeChain.map(n => n.address), // только заказы, без старта и финиша
          routeChainWithNumbers: routeChain.map((n, idx) => ({
            address: n.address,
            orderNumber: n.orderNumber || n.raw?.orderNumber || `#${idx + 1}`
          })),
          routeChainFull: routeChain.map(n => ({
            ...n, // Сохраняем все поля, включая raw
            raw: n.raw || n, // Убеждаемся, что raw существует и содержит все данные
          })), // Полные данные заказов для показа информации
          orderNumbers, // номера заказов для отображения
          totalDuration: finalTotalDuration,
          totalDistance: finalTotalDistance,
          totalDurationMin: (finalTotalDuration / 60).toFixed(1),
          totalDistanceKm: (finalTotalDistance / 1000).toFixed(1),
          stopsCount: routeChain.length, // количество заказов (точек доставки)
          reasons: routeReasons,
          directionsLegs: finalLegs,
        })
        console.log(`✅ Маршрут #${routes.length} создан, точек: ${routeChain.length}, ${(finalTotalDuration / 60).toFixed(1)} мин, ${(finalTotalDistance / 1000).toFixed(1)} км`)
      }

      // Автоматическое разделение слишком больших маршрутов
      let finalRoutes: any[] = []
      for (const route of routes) {
        if (route.stopsCount > maxStopsPerRoute) {
          console.log(`✂️ Разделяю маршрут ${route.name} (${route.stopsCount} заказов > ${maxStopsPerRoute})`)
          const subRoutes = splitLargeRoute(
            {
              routeChain: route.routeChainFull || [],
              maxStopsPerRoute,
              maxRouteDurationMin,
              maxRouteDistanceKm
            },
            {
              checkFeasibility: async (chain: any[]) => {
                return await checkChainFeasible(chain, true)
              }
            }
          )

          // Создаем отдельные маршруты из подмаршрутов
          for (let i = 0; i < subRoutes.length; i++) {
            const subChain = subRoutes[i]
            const subCheck = await checkChainFeasible(subChain, true)
            if (subCheck.feasible && subCheck.legs) {
              const subOrderNumbers = subChain.map((n: any, idx: number) => 
                n.orderNumber || n.raw?.orderNumber || `#${idx + 1}`
              )
              finalRoutes.push({
                id: `${route.id}-split-${i + 1}`,
                name: `${route.name} (часть ${i + 1}/${subRoutes.length})`,
                startAddress: route.startAddress,
                endAddress: route.endAddress,
                waypoints: subChain.map((n: any) => ({ address: n.address })),
                createdAt: route.createdAt,
                routeChain: subChain.map((n: any) => n.address),
                routeChainFull: subChain,
                orderNumbers: subOrderNumbers,
                totalDuration: subCheck.totalDuration ?? 0,
                totalDistance: subCheck.totalDistance ?? 0,
                totalDurationMin: ((subCheck.totalDuration ?? 0) / 60).toFixed(1),
                totalDistanceKm: ((subCheck.totalDistance ?? 0) / 1000).toFixed(1),
                stopsCount: subChain.length,
                reasons: [`Разделен из большого маршрута: ${route.name}`],
                directionsLegs: subCheck.legs
              })
            }
          }
        } else {
          finalRoutes.push(route)
        }
      }

      // Генерация уведомлений для маршрутов
      const notificationsMap = new Map<string, Notification[]>()
      if (enableNotifications) {
        console.log('🔔 Генерирую уведомления для маршрутов...')
        for (const route of finalRoutes) {
          const routeInfo: NotificationRouteInfo = {
            id: route.id,
            name: route.name,
            routeChain: (route.routeChainFull || []).map((o: any) => ({
              orderNumber: o.orderNumber || o.raw?.orderNumber || '',
              address: o.address,
              customerName: o.raw?.customerName || o.raw?.['Имя клиента'] || '',
              customerPhone: o.raw?.phone || o.raw?.телефон || '',
              readyAt: o.readyAt,
              deadlineAt: o.deadlineAt,
              estimatedArrivalTime: null, // Будет вычислено в generateRouteNotifications
              raw: o.raw
            })),
            startAddress: route.startAddress,
            endAddress: route.endAddress,
            estimatedStartTime: Date.now(),
            directionsLegs: route.directionsLegs
          }
          
          const notifications = generateRouteNotifications(routeInfo, notificationPreferences)
          if (notifications.length > 0) {
            notificationsMap.set(route.id, notifications)
            console.log(`✅ Сгенерировано ${notifications.length} уведомлений для маршрута ${route.name}`)
          }
        }
      }

      // Keep results isolated in this page only
      console.log(`✅ Автопланирование завершено. Создано маршрутов: ${finalRoutes.length}`)
      setPlannedRoutes(finalRoutes)
      setRouteNotifications(notificationsMap)
      
      if (finalRoutes.length === 0) {
        const msg = 'Не удалось создать маршруты. Проверьте фильтры и убедитесь, что заказы могут быть объединены.'
        setErrorMsg(msg)
        console.warn('⚠️', msg)
      }
    } catch (e: any) {
      const errorMsg = e?.message || 'Неизвестная ошибка'
      console.error('❌ Ошибка автопланирования:', e)
      setErrorMsg(`Ошибка автопланирования: ${errorMsg}. Проверьте ключ Google Maps и корректность адресов.`)
      setPlannedRoutes([])
    } finally {
      setIsPlanning(false)
      console.log('🏁 Планирование завершено (успешно или с ошибкой)')
    }
  }, [excelData, fileName, maxRouteDurationMin, maxRouteDistanceKm, maxWaitPerStopMin, maxStopsPerRoute, enableOrderCombining, combineMaxDistanceMeters, combineMaxTimeWindowMinutes, enableNotifications, notificationPreferences])

  // Callback для загрузки данных о трафике
  const handleTrafficDataLoad = useCallback((data: { congestedAreas: Array<any>; averageSpeed: number; totalDelay: number }) => {
    setTrafficData(data)
    console.log('📊 Данные о трафике загружены:', data)
    if (data && data.congestedAreas.length > 0) {
      console.log(`⚠️ Обнаружено ${data.congestedAreas.length} зон с задержками. Общая задержка: ${data.totalDelay} минут`)
      // Используем trafficData для будущих предупреждений
      if (data.totalDelay > 30) {
        console.warn(`🔴 Высокая общая задержка: ${data.totalDelay} минут`)
      }
    }
  }, [])

  return (
    <div className="space-y-6">
      <div className={clsx(
        'rounded-2xl p-6 shadow-lg border',
        isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-white border-gray-200'
      )}>
        <h2 className={clsx('text-lg font-semibold mb-4', isDark ? 'text-white' : 'text-gray-900')}>Автопланирование</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className={clsx('rounded-xl p-4 border', isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-gray-50')}>
            <div className="text-sm mb-2">Загрузить Excel</div>
            <input type="file" accept=".xlsx,.xls" onChange={onFileChange} disabled={isProcessing} />
            <div className={clsx('mt-2 text-sm', isDark ? 'text-gray-300' : 'text-gray-600')}>
              {isProcessing ? 'Чтение файла...' : fileName ? `Файл: ${fileName}` : 'Файл не выбран'}
            </div>
            <div className={clsx('mt-1 text-sm', isDark ? 'text-gray-300' : 'text-gray-600')}>
              Заказы: {ordersCount}
            </div>
          </div>

          <div className={clsx('rounded-xl p-4 border space-y-3', isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-gray-50')}>
            <div className="text-sm font-medium">Фильтры маршрута</div>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Макс. длительность маршрута (мин)</span>
              <input
                type="number"
                min={30}
                max={600}
                step={5}
                value={maxRouteDurationMin}
                onChange={(e) => setMaxRouteDurationMin(Math.max(30, Math.min(600, Number(e.target.value) || 0)))}
                className={clsx('w-28 rounded-lg p-2 text-right', isDark ? 'bg-gray-800 text-gray-100 border border-gray-700' : 'bg-white text-gray-900 border border-gray-300')}
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Макс. дистанция маршрута (км)</span>
              <input
                type="number"
                min={10}
                max={300}
                step={5}
                value={maxRouteDistanceKm}
                onChange={(e) => setMaxRouteDistanceKm(Math.max(10, Math.min(300, Number(e.target.value) || 0)))}
                className={clsx('w-28 rounded-lg p-2 text-right', isDark ? 'bg-gray-800 text-gray-100 border border-gray-700' : 'bg-white text-gray-900 border border-gray-300')}
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Макс. ожидание готовности (мин)</span>
              <input
                type="number"
                min={0}
                max={60}
                step={1}
                value={maxWaitPerStopMin}
                onChange={(e) => setMaxWaitPerStopMin(Math.max(0, Math.min(60, Number(e.target.value) || 0)))}
                className={clsx('w-28 rounded-lg p-2 text-right', isDark ? 'bg-gray-800 text-gray-100 border border-gray-700' : 'bg-white text-gray-900 border border-gray-300')}
              />
            </label>
            <label className="flex items-center justify-between gap-3 text-sm">
              <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Макс. точек в маршруте</span>
              <input
                type="number"
                min={1}
                max={6}
                step={1}
                value={maxStopsPerRoute}
                onChange={(e) => setMaxStopsPerRoute(Math.max(1, Math.min(6, Number(e.target.value) || 1)))}
                className={clsx('w-28 rounded-lg p-2 text-right', isDark ? 'bg-gray-800 text-gray-100 border border-gray-700' : 'bg-white text-gray-900 border border-gray-300')}
              />
            </label>
          </div>

          <div className={clsx('rounded-xl p-4 border space-y-3', isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-gray-50')}>
            <div className="text-sm font-medium">Объединение заказов</div>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={enableOrderCombining}
                onChange={(e) => setEnableOrderCombining(e.target.checked)}
                className="rounded"
              />
              <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Автоматически объединять близкие заказы</span>
            </label>
            {enableOrderCombining && (
              <>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Макс. расстояние (м)</span>
                  <input
                    type="number"
                    min={100}
                    max={2000}
                    step={50}
                    value={combineMaxDistanceMeters}
                    onChange={(e) => setCombineMaxDistanceMeters(Math.max(100, Math.min(2000, Number(e.target.value) || 500)))}
                    className={clsx('w-28 rounded-lg p-2 text-right', isDark ? 'bg-gray-800 text-gray-100 border border-gray-700' : 'bg-white text-gray-900 border border-gray-300')}
                  />
                </label>
                <label className="flex items-center justify-between gap-3 text-sm">
                  <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Окно времени (мин)</span>
                  <input
                    type="number"
                    min={5}
                    max={120}
                    step={5}
                    value={combineMaxTimeWindowMinutes}
                    onChange={(e) => setCombineMaxTimeWindowMinutes(Math.max(5, Math.min(120, Number(e.target.value) || 30)))}
                    className={clsx('w-28 rounded-lg p-2 text-right', isDark ? 'bg-gray-800 text-gray-100 border border-gray-700' : 'bg-white text-gray-900 border border-gray-300')}
                  />
                </label>
              </>
            )}
          </div>

          <div className={clsx('rounded-xl p-4 border space-y-3', isDark ? 'border-gray-700 bg-gray-800/30' : 'border-gray-200 bg-gray-50')}>
            <div className="text-sm font-medium">Предупреждения</div>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={enableNotifications}
                onChange={(e) => setEnableNotifications(e.target.checked)}
                className="rounded"
              />
              <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Включить предупреждения о рисках</span>
            </label>
            {enableNotifications && (
              <>
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={notificationPreferences.enableWarnings}
                    onChange={(e) => setNotificationPreferences({ ...notificationPreferences, enableWarnings: e.target.checked })}
                    className="rounded"
                  />
                  <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Предупреждения о рисках опоздания</span>
                </label>
                <label className="flex items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={notificationPreferences.enableTrafficWarnings}
                    onChange={(e) => setNotificationPreferences({ ...notificationPreferences, enableTrafficWarnings: e.target.checked })}
                    className="rounded"
                  />
                  <span className={clsx(isDark ? 'text-gray-300' : 'text-gray-700')}>Предупреждения о пробках</span>
                </label>
              </>
            )}
          </div>
        </div>

        <div className="mt-6">
          {errorMsg && (
            <div className={clsx('mb-3 rounded-lg px-3 py-2 text-sm', isDark ? 'bg-red-900/40 text-red-200 border border-red-700/50' : 'bg-red-50 text-red-700 border border-red-200')}>
              {errorMsg}
            </div>
          )}
          <button
            onClick={planRoutes}
            disabled={isPlanning || (ordersCount === 0)}
            className={clsx(
              'px-4 py-2 rounded-lg font-medium transition-colors',
              isPlanning || ordersCount === 0
                ? (isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-400')
                : (isDark ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white')
            )}
          >
            {isPlanning ? 'Планирование...' : 'Автосоздать маршруты'}
          </button>
        </div>

        {/* Тепловая карта трафика */}
        {sectorPathState && sectorPathState.length > 0 && (
          <div className="mt-6">
            <TrafficHeatmap 
              key={`heatmap-${sectorPathState?.map(p => `${p.lat},${p.lng}`).join('|') || 'default'}`}
              sectorPath={sectorPathState}
              onTrafficDataLoad={handleTrafficDataLoad}
            />
          </div>
        )}

        {(plannedRoutes.length > 0 || (isPlanning === false && excelData && ordersCount > 0 && plannedRoutes.length === 0)) && (
          <div className="mt-6">
            <div className={clsx('text-sm mb-2', isDark ? 'text-gray-300' : 'text-gray-700')}>
              {plannedRoutes.length > 0 
                ? `Сформировано маршрутов: ${plannedRoutes.length}${excludedOutsideSector > 0 ? ` (исключено вне сектора: ${excludedOutsideSector})` : ''}`
                : 'Маршруты не созданы. Проверьте фильтры и логи в консоли браузера (F12).'}
            </div>
            <ul className="space-y-3">
              {plannedRoutes.map((r) => (
                <li 
                  key={r.id} 
                  className={clsx(
                    'rounded-xl p-5 border-2 transition-all shadow-sm',
                    selectedRoute?.id === r.id
                      ? (isDark ? 'border-blue-500 bg-blue-900/30 ring-2 ring-blue-500 shadow-lg' : 'border-blue-500 bg-blue-50 ring-2 ring-blue-500 shadow-lg')
                      : (isDark ? 'border-gray-700 bg-gray-800/40 hover:border-gray-600 hover:shadow-md' : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-md')
                  )}
                >
                  {/* Заголовок маршрута - кликабельная область */}
                  <div 
                    className="flex items-start justify-between cursor-pointer"
                    onClick={() => setSelectedRoute(selectedRoute?.id === r.id ? null : r)}
                  >
                    <div className="flex-1">
                      <div className={clsx('text-base font-semibold mb-3', isDark ? 'text-white' : 'text-gray-900')}>{r.name}</div>
                      <div className={clsx('grid grid-cols-3 gap-3 mb-3', isDark ? 'text-gray-300' : 'text-gray-700')}>
                        <div className={clsx('rounded-lg p-2', isDark ? 'bg-gray-900/50' : 'bg-gray-50')}>
                          <div className="text-xs text-gray-500 mb-1">Точек</div>
                          <div className={clsx('text-sm font-bold', isDark ? 'text-white' : 'text-gray-900')}>{r.stopsCount || (1 + (r.waypoints?.length || 0))}</div>
                        </div>
                        <div className={clsx('rounded-lg p-2', isDark ? 'bg-gray-900/50' : 'bg-gray-50')}>
                          <div className="text-xs text-gray-500 mb-1">Длительность</div>
                          <div className={clsx('text-sm font-bold', isDark ? 'text-white' : 'text-gray-900')}>{r.totalDurationMin || '?'} мин</div>
                        </div>
                        <div className={clsx('rounded-lg p-2', isDark ? 'bg-gray-900/50' : 'bg-gray-50')}>
                          <div className="text-xs text-gray-500 mb-1">Дистанция</div>
                          <div className={clsx('text-sm font-bold', isDark ? 'text-white' : 'text-gray-900')}>{r.totalDistanceKm || '?'} км</div>
                        </div>
                      </div>
                        {r.orderNumbers && r.orderNumbers.length > 0 ? (
                          <div onClick={(e) => e.stopPropagation()}>
                            <span className={clsx('font-medium', isDark ? 'text-gray-300' : 'text-gray-700')}>Заказы: </span>
                            {r.orderNumbers.map((orderNum: string, idx: number) => (
                              <React.Fragment key={idx}>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    const fullOrder = r.routeChainFull?.[idx]
                                    if (fullOrder) {
                                      // Используем raw из fullOrder, если есть, иначе сам fullOrder
                                      // Также проверяем, что raw содержит все поля из Excel
                                      const orderRaw = fullOrder.raw || fullOrder
                                      
                                      // Дополнительно проверяем: если raw не содержит нужные поля, но они есть в fullOrder
                                      // объединяем данные
                                      const combinedData = orderRaw === fullOrder ? fullOrder : { ...fullOrder, ...orderRaw }
                                      
                                      // Функции для парсинга времени
                                      const getKitchenTime = (o: any): number | null => {
                                        const parseTime = (val: any): number | null => {
                                          if (!val && val !== 0) return null
                                          const s = String(val).trim()
                                          if (!s || s === '') return null
                                          
                                          // Проверяем формат HH:mm или H:mm
                                          const m = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
                                          if (m) {
                                            const base = new Date()
                                            base.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0)
                                            return base.getTime()
                                          }
                                          
                                          // Проверяем формат HH:mm:ss
                                          const m2 = s.match(/^([01]?\d|2[0-3]):([0-5]\d):([0-5]\d)$/)
                                          if (m2) {
                                            const base = new Date()
                                            base.setHours(parseInt(m2[1], 10), parseInt(m2[2], 10), parseInt(m2[3], 10))
                                            return base.getTime()
                                          }
                                          
                                          // Пробуем распарсить как Date
                                          const d = new Date(s)
                                          if (!isNaN(d.getTime())) return d.getTime()
                                          
                                          return null
                                        }
                                        
                                        // Ищем время во всех возможных полях, проверяя как точные совпадения, так и регистронезависимо
                                        const possibleFields = [
                                          'время на кухню', 'время_на_кухню', 'Время на кухню', 'Время_на_кухню', 'ВРЕМЯ НА КУХНЮ',
                                          'Время на кухню', 'ВРЕМЯ_НА_КУХНЮ',
                                          'kitchen_time', 'kitchenTime', 'KitchenTime', 'KITCHEN_TIME',
                                          'kitchen', 'Kitchen', 'KITCHEN',
                                          'Kitchen Time', 'kitchen time', 'KITCHEN TIME',
                                          'Время готовности', 'время готовности', 'ВРЕМЯ ГОТОВНОСТИ',
                                          'Готовность', 'готовность', 'ГОТОВНОСТЬ',
                                          'время готов', 'Время готов', 'ВРЕМЯ ГОТОВ',
                                          'готов', 'Готов', 'ГОТОВ'
                                        ]
                                        
                                        // Сначала проверяем точные совпадения
                                        for (const field of possibleFields) {
                                          if (o[field]) {
                                            const parsed = parseTime(o[field])
                                            if (parsed) return parsed
                                          }
                                        }
                                        
                                        // Затем проверяем регистронезависимо все ключи объекта на наличие полных фраз
                                        // Расширенный поиск по ключевым словам
                                        const searchPhrases = [
                                          'время на кухню', 'время_на_кухню', 'времянакухню', 'времянакухню',
                                          'kitchen_time', 'kitchentime', 'kitchen time', 'kitchentime',
                                          'время готовности', 'время_готовности', 'времяготовности',
                                          'готовность', 'ready time', 'ready_time', 'readytime',
                                          'time to kitchen', 'timetokitchen'
                                        ]
                                        
                                        // Сначала ищем по полному совпадению фразы
                                        for (const key in o) {
                                          const lowerKey = key.toLowerCase().trim()
                                          for (const phrase of searchPhrases) {
                                            if (lowerKey === phrase || lowerKey.includes(phrase)) {
                                              const parsed = parseTime(o[key])
                                              if (parsed) return parsed
                                            }
                                          }
                                        }
                                        
                                        // Если не нашли, пробуем найти по отдельным ключевым словам
                                        const keywords = ['кухню', 'kitchen', 'готовности', 'ready']
                                        for (const key in o) {
                                          const lowerKey = key.toLowerCase().trim()
                                          // Пропускаем поля, связанные с плановым временем
                                          if (lowerKey.includes('планов') || lowerKey.includes('planned') || 
                                              lowerKey.includes('дедлайн') || lowerKey.includes('deadline')) continue
                                          
                                          // Проверяем, содержит ли название поля ключевые слова
                                          for (const keyword of keywords) {
                                            if (lowerKey.includes(keyword)) {
                                              const parsed = parseTime(o[key])
                                              if (parsed) return parsed
                                            }
                                          }
                                        }
                                        
                                        return null
                                      }
                                      
                                      const getPlannedTime = (o: any): number | null => {
                                        const parseTime = (val: any): number | null => {
                                          if (!val && val !== 0) return null
                                          const s = String(val).trim()
                                          if (!s || s === '') return null
                                          
                                          // Проверяем формат HH:mm или H:mm
                                          const m = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
                                          if (m) {
                                            const base = new Date()
                                            base.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0)
                                            return base.getTime()
                                          }
                                          
                                          // Проверяем формат HH:mm:ss
                                          const m2 = s.match(/^([01]?\d|2[0-3]):([0-5]\d):([0-5]\d)$/)
                                          if (m2) {
                                            const base = new Date()
                                            base.setHours(parseInt(m2[1], 10), parseInt(m2[2], 10), parseInt(m2[3], 10))
                                            return base.getTime()
                                          }
                                          
                                          // Пробуем распарсить как Date
                                          const d = new Date(s)
                                          if (!isNaN(d.getTime())) return d.getTime()
                                          
                                          return null
                                        }
                                        
                                        // Ищем время во всех возможных полях
                                        const possibleFields = [
                                          'плановое время', 'плановое_время', 'Плановое время', 'Плановое_время', 'ПЛАНОВОЕ ВРЕМЯ',
                                          'Плановое время', 'ПЛАНОВОЕ_ВРЕМЯ',
                                          'plannedTime', 'planned_time', 'PlannedTime', 'PLANNED_TIME',
                                          'Planned Time', 'planned time', 'PLANNED TIME',
                                          'время', 'Время', 'ВРЕМЯ', 'time', 'Time', 'TIME',
                                          'Дедлайн', 'дедлайн', 'ДЕДЛАЙН', 'deadline', 'Deadline', 'DEADLINE',
                                          'deadlineAt', 'deadline_at',
                                          'Время доставки', 'время доставки', 'ВРЕМЯ ДОСТАВКИ',
                                          'время доставки', 'время_доставки',
                                          'delivery_time', 'deliveryTime', 'DeliveryTime'
                                        ]
                                        
                                        // Сначала проверяем точные совпадения
                                        for (const field of possibleFields) {
                                          if (o[field]) {
                                            const parsed = parseTime(o[field])
                                            if (parsed) return parsed
                                          }
                                        }
                                        
                                        // Затем проверяем регистронезависимо все ключи объекта на наличие полных фраз (исключая поля связанные с кухней)
                                        const searchPhrases = [
                                          'плановое время', 'плановое_время', 'плановоевремя', 'плановоевремя',
                                          'planned_time', 'plannedtime', 'planned time', 'plannedtime',
                                          'дедлайн', 'deadline', 'deadline_time',
                                          'время доставки', 'время_доставки', 'времядодоставки',
                                          'delivery_time', 'deliverytime', 'delivery time', 'deliverytime'
                                        ]
                                        
                                        // Сначала ищем по полному совпадению фразы
                                        for (const key in o) {
                                          const lowerKey = key.toLowerCase().trim()
                                          // Пропускаем поля связанные с кухней
                                          if (lowerKey.includes('кухню') || lowerKey.includes('kitchen') || 
                                              lowerKey.includes('готовности') || lowerKey.includes('ready')) continue
                                          
                                          // Ищем полные фразы в названии поля
                                          for (const phrase of searchPhrases) {
                                            if (lowerKey === phrase || lowerKey.includes(phrase)) {
                                              const parsed = parseTime(o[key])
                                              if (parsed) return parsed
                                            }
                                          }
                                        }
                                        
                                        // Если не нашли, пробуем найти по отдельным ключевым словам
                                        const keywords = ['планов', 'planned', 'дедлайн', 'deadline', 'доставки', 'delivery']
                                        for (const key in o) {
                                          const lowerKey = key.toLowerCase().trim()
                                          // Пропускаем поля связанные с кухней
                                          if (lowerKey.includes('кухню') || lowerKey.includes('kitchen') ||
                                              lowerKey.includes('готовности') || lowerKey.includes('ready')) continue
                                          
                                          // Проверяем, содержит ли название поля ключевые слова
                                          for (const keyword of keywords) {
                                            if (lowerKey.includes(keyword)) {
                                              const parsed = parseTime(o[key])
                                              if (parsed) return parsed
                                            }
                                          }
                                        }
                                        
                                        return null
                                      }
                                      
                                      // Используем данные из fullOrder (которые уже вычислены при планировании)
                                      // fullOrder содержит readyAt и deadlineAt, которые были вычислены при планировании маршрута
                                      let readyAt = fullOrder.readyAt
                                      let deadlineAt = fullOrder.deadlineAt
                                      
                                      // Пробуем извлечь из combinedData (объединенные данные)
                                      if ((!readyAt || readyAt === null)) {
                                        // Сначала из combinedData
                                        const ready = getKitchenTime(combinedData)
                                        if (ready) {
                                          readyAt = ready + 4 * 60 * 1000 // +4 мин упаковка
                                          console.log('✅ Найдено время на кухню в combinedData:', ready, '→', readyAt)
                                        } else if (orderRaw && orderRaw !== fullOrder) {
                                          // Затем из orderRaw отдельно
                                          const ready2 = getKitchenTime(orderRaw)
                                          if (ready2) {
                                            readyAt = ready2 + 4 * 60 * 1000
                                            console.log('✅ Найдено время на кухню в orderRaw:', ready2, '→', readyAt)
                                          }
                                        }
                                        // И наконец из fullOrder напрямую
                                        if (!readyAt) {
                                          const ready3 = getKitchenTime(fullOrder)
                                          if (ready3) {
                                            readyAt = ready3 + 4 * 60 * 1000
                                            console.log('✅ Найдено время на кухню в fullOrder:', ready3, '→', readyAt)
                                          }
                                        }
                                      }
                                      
                                      if ((!deadlineAt || deadlineAt === null)) {
                                        // Сначала из combinedData
                                        const deadline = getPlannedTime(combinedData)
                                        if (deadline) {
                                          deadlineAt = deadline
                                          console.log('✅ Найдено плановое время в combinedData:', deadline)
                                        } else if (orderRaw && orderRaw !== fullOrder) {
                                          // Затем из orderRaw отдельно
                                          const deadline2 = getPlannedTime(orderRaw)
                                          if (deadline2) {
                                            deadlineAt = deadline2
                                            console.log('✅ Найдено плановое время в orderRaw:', deadline2)
                                          }
                                        }
                                        // И наконец из fullOrder напрямую
                                        if (!deadlineAt) {
                                          const deadline3 = getPlannedTime(fullOrder)
                                          if (deadline3) {
                                            deadlineAt = deadline3
                                            console.log('✅ Найдено плановое время в fullOrder:', deadline3)
                                          }
                                        }
                                      }
                                      
                                      // Отладочная информация - показываем все поля для диагностики
                                      const allKeysRaw = orderRaw ? Object.keys(orderRaw) : []
                                      const allKeysFull = Object.keys(fullOrder)
                                      const allKeysCombined = Object.keys(combinedData)
                                      
                                      const timeRelatedKeys = [...allKeysRaw, ...allKeysFull, ...allKeysCombined]
                                        .filter((key, index, self) => self.indexOf(key) === index) // уникальные
                                        .filter(key => {
                                          const lowerKey = key.toLowerCase()
                                          return lowerKey.includes('время') || lowerKey.includes('time') || 
                                                 lowerKey.includes('кухню') || lowerKey.includes('kitchen') ||
                                                 lowerKey.includes('планов') || lowerKey.includes('planned') ||
                                                 lowerKey.includes('дедлайн') || lowerKey.includes('deadline')
                                        })
                                      
                                      console.log('🔍 Отладка данных заказа:', {
                                        orderNumber: orderNum,
                                        'fullOrder.readyAt': fullOrder.readyAt,
                                        'fullOrder.deadlineAt': fullOrder.deadlineAt,
                                        'computed readyAt': readyAt,
                                        'computed deadlineAt': deadlineAt,
                                        'Все ключи orderRaw': allKeysRaw,
                                        'Все ключи fullOrder': allKeysFull,
                                        'Все ключи combinedData': allKeysCombined,
                                        'Ключи связанные со временем': timeRelatedKeys,
                                        'Значения временных полей из combinedData': timeRelatedKeys.reduce((acc, key) => {
                                          acc[key] = combinedData[key]
                                          return acc
                                        }, {} as Record<string, any>),
                                        'Значения временных полей из orderRaw': orderRaw ? timeRelatedKeys.reduce((acc, key) => {
                                          acc[key] = orderRaw[key]
                                          return acc
                                        }, {} as Record<string, any>) : {},
                                        'Значения временных полей из fullOrder': timeRelatedKeys.reduce((acc, key) => {
                                          acc[key] = fullOrder[key]
                                          return acc
                                        }, {} as Record<string, any>)
                                      })
                                      
                                      setSelectedOrder({
                                        orderNumber: orderNum,
                                        address: fullOrder.address || combinedData?.address || orderRaw?.address || '',
                                        readyAt: readyAt, // Используем вычисленные данные
                                        deadlineAt: deadlineAt, // Используем вычисленные данные
                                        raw: combinedData || orderRaw || fullOrder // Сохраняем объединенные данные
                                      })
                                    }
                                  }}
                                  className={clsx(
                                    'underline hover:no-underline cursor-pointer transition-colors',
                                    isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-800'
                                  )}
                                >
                                  {orderNum}
                                </button>
                                {idx < r.orderNumbers.length - 1 && <span>, </span>}
                              </React.Fragment>
                            ))}
                          </div>
                        ) : (
                          <div><span className="font-medium">-</span></div>
                        )}
                    </div>
                    <div className={clsx('text-xs ml-2', isDark ? 'text-gray-400' : 'text-gray-500')}>
                      {selectedRoute?.id === r.id ? '▼' : '▶'}
                    </div>
                  </div>
                  
                  {selectedRoute?.id === r.id && (
                    <div 
                      className={clsx('mt-4 pt-4 border-t space-y-4', isDark ? 'border-gray-700' : 'border-gray-200')}
                      onClick={(e) => e.stopPropagation()} // Предотвращаем всплытие кликов
                    >
                      {/* Логика формирования маршрута */}
                      <div onClick={(e) => e.stopPropagation()}>
                        <div className={clsx('text-sm font-semibold mb-3 flex items-center gap-2', isDark ? 'text-gray-200' : 'text-gray-800')}>
                          <span>📋</span>
                          <span>Логика формирования маршрута</span>
                        </div>
                        <div className={clsx('text-xs space-y-3 max-h-80 overflow-y-auto p-4 rounded-lg', isDark ? 'bg-gray-900/50 text-gray-300' : 'bg-gray-50 text-gray-700')}>
                          {r.reasons?.map((reason: string, idx: number) => (
                            <div key={idx} className={clsx('whitespace-pre-line border-b pb-3 last:border-b-0 last:pb-0', isDark ? 'border-gray-700' : 'border-gray-200')}>
                              {reason}
                            </div>
                          )) || <div>Информация недоступна</div>}
                        </div>
                      </div>
                      
                      {/* Порядок адресов */}
                      {r.routeChain && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <div className={clsx('text-sm font-semibold mb-2', isDark ? 'text-gray-200' : 'text-gray-800')}>
                            Порядок доставки
                          </div>
                          <div className={clsx('rounded-lg p-4', isDark ? 'bg-gray-900/30' : 'bg-gray-50')}>
                            <ol className="space-y-2">
                              {r.routeChain.map((addr: string, idx: number) => (
                                <li key={idx} className="flex items-start gap-2">
                                  <span className={clsx('flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold', isDark ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white')}>
                                    {idx + 1}
                                  </span>
                                  <span className={clsx('text-sm flex-1', isDark ? 'text-gray-300' : 'text-gray-700')}>
                                    {addr}
                                  </span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        </div>
                      )}
                      
                      {/* Уведомления */}
                      {enableNotifications && routeNotifications.has(r.id) && (
                        <div onClick={(e) => e.stopPropagation()}>
                          <div className={clsx('text-sm font-semibold mb-3 flex items-center gap-2', isDark ? 'text-gray-200' : 'text-gray-800')}>
                            <span>🔔</span>
                            <span>Уведомления ({routeNotifications.get(r.id)?.length || 0})</span>
                          </div>
                          <div className={clsx('rounded-lg p-4 space-y-2 max-h-60 overflow-y-auto', isDark ? 'bg-gray-900/50' : 'bg-gray-50')}>
                            {routeNotifications.get(r.id)?.map((notification) => {
                              const formatted = formatNotificationForDisplay(notification)
                              return (
                                <div
                                  key={notification.id}
                                  className={clsx(
                                    'flex items-start gap-3 p-3 rounded-lg border-l-4',
                                    isDark ? 'bg-gray-800/50 border-gray-600' : 'bg-white border-gray-300',
                                    notification.priority === 'critical' ? 'border-red-500' :
                                    notification.priority === 'high' ? 'border-orange-500' :
                                    notification.priority === 'medium' ? 'border-blue-500' : 'border-gray-400'
                                  )}
                                >
                                  <span className="text-xl">{formatted.icon}</span>
                                  <div className="flex-1">
                                    <div className={clsx('text-xs font-medium mb-1', isDark ? 'text-gray-300' : 'text-gray-700')}>
                                      {formatted.title}
                                    </div>
                                    <div className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-600')}>
                                      {formatted.message}
                                    </div>
                                    <div className={clsx('text-xs mt-1', isDark ? 'text-gray-500' : 'text-gray-500')}>
                                      {new Date(notification.timestamp).toLocaleString('ru-RU', {
                                        day: '2-digit',
                                        month: '2-digit',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                      })}
                                    </div>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Карта */}
                      <RouteMap 
                        route={r} 
                        onMarkerClick={(fullOrder) => {
                          // Находим индекс заказа в маршруте
                          const orderIdx = r.routeChainFull?.findIndex((o: any) => 
                            o.address === fullOrder.address && 
                            (o.orderNumber === fullOrder.orderNumber || o.raw?.orderNumber === fullOrder.raw?.orderNumber)
                          ) ?? -1
                          
                          if (orderIdx >= 0 && r.orderNumbers) {
                            const orderNum = r.orderNumbers[orderIdx]
                            
                            // Используем ту же логику, что и при клике на номер заказа
                            const orderRaw = fullOrder.raw || fullOrder
                            
                            // Объединяем данные из fullOrder и orderRaw
                            const combinedData = orderRaw === fullOrder ? fullOrder : { ...fullOrder, ...orderRaw }
                            
                            // Функции для парсинга времени
                            const getKitchenTime = (o: any): number | null => {
                              const parseTime = (val: any): number | null => {
                                if (!val && val !== 0) return null
                                const s = String(val).trim()
                                const m = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
                                if (m) {
                                  const base = new Date()
                                  base.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0)
                                  return base.getTime()
                                }
                                const d = new Date(s)
                                if (!isNaN(d.getTime())) return d.getTime()
                                return null
                              }
                              // Сначала проверяем точные совпадения
                              const exactFields = [
                                'время на кухню', 'время_на_кухню', 'Время на кухню', 'Время_на_кухню', 'ВРЕМЯ НА КУХНЮ',
                                'kitchen_time', 'kitchenTime', 'KitchenTime', 'KITCHEN_TIME',
                                'kitchen', 'Kitchen', 'KITCHEN',
                                'Kitchen Time', 'kitchen time',
                                'Время готовности', 'время готовности', 'Готовность', 'готовность'
                              ]
                              
                              for (const field of exactFields) {
                                if (o[field]) {
                                  const parsed = parseTime(o[field])
                                  if (parsed) return parsed
                                }
                              }
                              
                              // Затем проверяем регистронезависимо на наличие полных фраз
                              const searchPhrases = [
                                'время на кухню', 'время_на_кухню', 'времянакухню',
                                'kitchen_time', 'kitchentime', 'kitchen time',
                                'время готовности', 'время_готовности',
                                'готовность'
                              ]
                              for (const key in o) {
                                const lowerKey = key.toLowerCase().trim()
                                for (const phrase of searchPhrases) {
                                  if (lowerKey === phrase || lowerKey.includes(phrase)) {
                                    const parsed = parseTime(o[key])
                                    if (parsed) return parsed
                                  }
                                }
                              }
                              
                              return null
                            }
                            
                            const getPlannedTime = (o: any): number | null => {
                              const parseTime = (val: any): number | null => {
                                if (!val && val !== 0) return null
                                const s = String(val).trim()
                                const m = s.match(/^([01]?\d|2[0-3]):([0-5]\d)$/)
                                if (m) {
                                  const base = new Date()
                                  base.setHours(parseInt(m[1], 10), parseInt(m[2], 10), 0, 0)
                                  return base.getTime()
                                }
                                const d = new Date(s)
                                if (!isNaN(d.getTime())) return d.getTime()
                                return null
                              }
                              // Сначала проверяем точные совпадения
                              const exactFields = [
                                'плановое время', 'плановое_время', 'Плановое время', 'Плановое_время', 'ПЛАНОВОЕ ВРЕМЯ',
                                'plannedTime', 'planned_time', 'PlannedTime', 'PLANNED_TIME',
                                'Planned Time', 'planned time',
                                'Дедлайн', 'дедлайн', 'ДЕДЛАЙН', 'deadline', 'Deadline', 'DEADLINE',
                                'deadlineAt', 'deadline_at',
                                'Время доставки', 'время доставки', 'delivery_time', 'deliveryTime'
                              ]
                              
                              for (const field of exactFields) {
                                if (o[field]) {
                                  const parsed = parseTime(o[field])
                                  if (parsed) return parsed
                                }
                              }
                              
                              // Затем проверяем регистронезависимо на наличие полных фраз (исключая поля связанные с кухней)
                              const searchPhrases = [
                                'плановое время', 'плановое_время', 'плановоевремя',
                                'planned_time', 'plannedtime', 'planned time',
                                'дедлайн', 'deadline',
                                'время доставки', 'время_доставки', 'времядодоставки',
                                'delivery_time', 'deliverytime', 'delivery time'
                              ]
                              for (const key in o) {
                                const lowerKey = key.toLowerCase().trim()
                                // Пропускаем поля связанные с кухней
                                if (lowerKey.includes('кухню') || lowerKey.includes('kitchen')) continue
                                
                                for (const phrase of searchPhrases) {
                                  if (lowerKey === phrase || lowerKey.includes(phrase)) {
                                    const parsed = parseTime(o[key])
                                    if (parsed) return parsed
                                  }
                                }
                              }
                              
                              return null
                            }
                            
                            let readyAt = fullOrder.readyAt
                            let deadlineAt = fullOrder.deadlineAt
                            
                            // Пробуем извлечь из combinedData (объединенные данные)
                            if ((!readyAt || readyAt === null)) {
                              // Сначала из combinedData
                              const ready = getKitchenTime(combinedData)
                              if (ready) {
                                readyAt = ready + 4 * 60 * 1000 // +4 мин упаковка
                                console.log('✅ Найдено время на кухню в combinedData (маркер):', ready, '→', readyAt)
                              } else if (orderRaw && orderRaw !== fullOrder) {
                                  // Затем из orderRaw отдельно
                                  const ready2 = getKitchenTime(orderRaw)
                                  if (ready2) {
                                    readyAt = ready2 + 4 * 60 * 1000
                                    console.log('✅ Найдено время на кухню в orderRaw (маркер):', ready2, '→', readyAt)
                                  }
                                }
                              // И наконец из fullOrder напрямую
                              if (!readyAt) {
                                const ready3 = getKitchenTime(fullOrder)
                                if (ready3) {
                                  readyAt = ready3 + 4 * 60 * 1000
                                  console.log('✅ Найдено время на кухню в fullOrder (маркер):', ready3, '→', readyAt)
                                }
                              }
                            }
                            
                            if ((!deadlineAt || deadlineAt === null)) {
                              // Сначала из combinedData
                              const deadline = getPlannedTime(combinedData)
                              if (deadline) {
                                deadlineAt = deadline
                                console.log('✅ Найдено плановое время в combinedData (маркер):', deadline)
                              } else if (orderRaw && orderRaw !== fullOrder) {
                                // Затем из orderRaw отдельно
                                const deadline2 = getPlannedTime(orderRaw)
                                if (deadline2) {
                                  deadlineAt = deadline2
                                  console.log('✅ Найдено плановое время в orderRaw (маркер):', deadline2)
                                }
                              }
                              // И наконец из fullOrder напрямую
                              if (!deadlineAt) {
                                const deadline3 = getPlannedTime(fullOrder)
                                if (deadline3) {
                                  deadlineAt = deadline3
                                  console.log('✅ Найдено плановое время в fullOrder (маркер):', deadline3)
                                }
                              }
                            }
                            
                            setSelectedOrder({
                              orderNumber: orderNum,
                              address: fullOrder.address || combinedData?.address || orderRaw?.address || '',
                              readyAt: readyAt,
                              deadlineAt: deadlineAt,
                              raw: combinedData || orderRaw || fullOrder // Сохраняем объединенные данные
                            })
                          }
                        }}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        
        {isPlanning && (
          <div className={clsx('mt-6 rounded-lg p-4 border', isDark ? 'border-blue-700 bg-blue-900/20' : 'border-blue-200 bg-blue-50')}>
            <div className={clsx('text-sm', isDark ? 'text-blue-200' : 'text-blue-700')}>
              ⏳ Планирование маршрутов... Пожалуйста, подождите. Откройте консоль браузера (F12) для деталей.
            </div>
          </div>
        )}
      </div>

      {/* Модальное окно с информацией о заказе */}
      {selectedOrder && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
          onClick={() => setSelectedOrder(null)}
        >
          <div 
            className={clsx(
              'relative w-full max-w-md mx-4 rounded-xl shadow-2xl',
              isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
            )}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Заголовок */}
            <div className={clsx(
              'px-6 py-4 border-b flex items-center justify-between',
              isDark ? 'border-gray-700' : 'border-gray-200'
            )}>
              <h3 className={clsx('text-lg font-semibold', isDark ? 'text-white' : 'text-gray-900')}>
                Заказ {selectedOrder.orderNumber || '#'}
              </h3>
              <button
                onClick={() => setSelectedOrder(null)}
                className={clsx(
                  'text-2xl leading-none hover:opacity-70 transition-opacity',
                  isDark ? 'text-gray-400' : 'text-gray-600'
                )}
              >
                ×
              </button>
            </div>

            {/* Содержимое */}
            <div className="p-6 space-y-4">
              {/* Адрес */}
              <div>
                <div className={clsx('text-xs font-medium mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                  Адрес доставки
                </div>
                <div className={clsx('text-sm', isDark ? 'text-gray-200' : 'text-gray-700')}>
                  {selectedOrder.address || 'Не указан'}
                </div>
              </div>

              {/* Время на кухню */}
              <div>
                <div className={clsx('text-xs font-medium mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                  Время на кухню (готовность)
                </div>
                {selectedOrder.readyAt ? (
                  <div className={clsx('text-sm font-medium', isDark ? 'text-blue-400' : 'text-blue-600')}>
                    {new Date(selectedOrder.readyAt).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                ) : (
                  <div className={clsx('text-sm italic', isDark ? 'text-gray-500' : 'text-gray-400')}>
                    Не указано
                  </div>
                )}
              </div>

              {/* Плановое время доставки */}
              <div>
                <div className={clsx('text-xs font-medium mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                  Плановое время доставки (дедлайн)
                </div>
                {selectedOrder.deadlineAt ? (
                  <div className={clsx('text-sm font-medium', isDark ? 'text-red-400' : 'text-red-600')}>
                    {new Date(selectedOrder.deadlineAt).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                ) : (
                  <div className={clsx('text-sm italic', isDark ? 'text-gray-500' : 'text-gray-400')}>
                    Не указано
                  </div>
                )}
              </div>

              {/* Дополнительная информация */}
              {selectedOrder.raw && (
                <div className={clsx('pt-4 border-t', isDark ? 'border-gray-700' : 'border-gray-200')}>
                  {(selectedOrder.raw.clientName || selectedOrder.raw['Имя клиента']) && (
                    <div className="mb-2">
                      <div className={clsx('text-xs font-medium mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                        Клиент
                      </div>
                      <div className={clsx('text-sm', isDark ? 'text-gray-200' : 'text-gray-700')}>
                        {selectedOrder.raw.clientName || selectedOrder.raw['Имя клиента']}
                      </div>
                    </div>
                  )}
                  {(selectedOrder.raw.orderSum || selectedOrder.raw['Сумма заказа']) && (
                    <div>
                      <div className={clsx('text-xs font-medium mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                        Сумма заказа
                      </div>
                      <div className={clsx('text-sm font-medium', isDark ? 'text-green-400' : 'text-green-600')}>
                        {selectedOrder.raw.orderSum || selectedOrder.raw['Сумма заказа']} ₴
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Кнопка закрытия */}
            <div className={clsx(
              'px-6 py-4 border-t flex justify-end',
              isDark ? 'border-gray-700' : 'border-gray-200'
            )}>
              <button
                onClick={() => setSelectedOrder(null)}
                className={clsx(
                  'px-4 py-2 rounded-lg font-medium transition-colors',
                  isDark 
                    ? 'bg-blue-600 hover:bg-blue-500 text-white' 
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                )}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default AutoPlanner


