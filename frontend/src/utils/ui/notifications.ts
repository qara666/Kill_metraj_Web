/**
 * Система умных уведомлений для маршрутов
 */

export interface NotificationPreferences {
  enableWarnings: boolean // Включить предупреждения о рисках
  enableTrafficWarnings: boolean // Включить предупреждения о пробках
}

export interface OrderInfo {
  orderNumber: string | number
  address: string
  customerName?: string
  customerPhone?: string
  readyAt: number | null
  deadlineAt: number | null
  estimatedArrivalTime: number | null
  raw?: any
}

export interface RouteInfo {
  id: string
  name: string
  routeChain: OrderInfo[]
  startAddress: string
  endAddress: string
  estimatedStartTime: number
  directionsLegs?: any[]
}

export type NotificationType = 
  | 'route_delay_warning' // Предупреждение о задержке
  | 'deadline_risk' // Риск опоздания
  | 'traffic_warning' // Предупреждение о пробках
  | 'route_optimization_suggestion' // Предложение по оптимизации маршрута

export interface Notification {
  id: string
  type: NotificationType
  timestamp: number
  routeId: string
  orderNumber?: string | number
  message: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  sent: boolean
}

/**
 * Генерирует уведомления для маршрута
 */
export function generateRouteNotifications(
  route: RouteInfo,
  preferences: NotificationPreferences = {
    enableWarnings: true,
    enableTrafficWarnings: true
  }
): Notification[] {
  const notifications: Notification[] = []
  const now = Date.now()

  if (!route.directionsLegs || route.directionsLegs.length === 0) {
    return notifications
  }

  // Вычисляем ETA для каждого заказа
  const ordersWithETA = calculateOrderETAs(route)

  // Предупреждения о рисках (только если включено)
  if (!preferences.enableWarnings) {
    return notifications
  }

  // Константы для буферов времени
  const FORCE_MAJEURE_MINUTES = 9 // Форс-мажор на каждый заказ
  const FORCE_MAJEURE_MS = FORCE_MAJEURE_MINUTES * 60 * 1000

  ordersWithETA.forEach(order => {
    if (order.deadlineAt && order.estimatedArrivalTime) {
      // Форс-мажор расширяет дедлайн: плановое время + 9 минут
      const deadlineWithForceMajeure = order.deadlineAt + FORCE_MAJEURE_MS
      const timeToDeadline = deadlineWithForceMajeure - order.estimatedArrivalTime
      
      // Риск опоздания к дедлайну (с учетом форс-мажора)
      if (timeToDeadline < 5 * 60 * 1000 && timeToDeadline > 0) { // Меньше 5 минут до дедлайна с форс-мажором
        notifications.push({
          id: `deadline_risk_${route.id}_${order.orderNumber}`,
          type: 'deadline_risk',
          timestamp: now,
          routeId: route.id,
          orderNumber: order.orderNumber,
          message: generateDeadlineRiskMessage(order, timeToDeadline),
          priority: 'critical',
          sent: false
        })
      }

      // Предупреждение о задержке (если ETA больше дедлайна с учетом форс-мажора)
      if (order.estimatedArrivalTime > deadlineWithForceMajeure) {
        const delay = order.estimatedArrivalTime - deadlineWithForceMajeure
        notifications.push({
          id: `delay_warning_${route.id}_${order.orderNumber}`,
          type: 'route_delay_warning',
          timestamp: now,
          routeId: route.id,
          orderNumber: order.orderNumber,
          message: generateDelayWarningMessage(order, delay),
          priority: 'critical',
          sent: false
        })
      }
    }
  })

  // Сортируем по времени
  notifications.sort((a, b) => a.timestamp - b.timestamp)

  return notifications
}

/**
 * Вычисляет ETA для каждого заказа в маршруте
 */
function calculateOrderETAs(route: RouteInfo): OrderInfo[] {
  if (!route.directionsLegs || route.directionsLegs.length === 0) {
    return route.routeChain.map(order => ({
      ...order,
      estimatedArrivalTime: null
    }))
  }

  const now = Date.now()
  const startTime = route.estimatedStartTime || now
  let currentTime = startTime

  // legs структура: [start->order1, order1->order2, ..., orderN->end]
  const ordersWithETA: OrderInfo[] = []

  // Константы для буферов времени
  const DELIVERY_TIME_MINUTES = 5 // Время на отдачу заказа курьером
  const DELIVERY_TIME_MS = DELIVERY_TIME_MINUTES * 60 * 1000

  // Для каждого заказа находим соответствующий leg и вычисляем ETA
  route.routeChain.forEach((order, index) => {
    // leg[index] - путь к заказу index
    if (index < route.directionsLegs!.length) {
      const leg = route.directionsLegs![index]
      // Используем duration_in_traffic если доступно (учитывает трафик), иначе duration
      const travelSeconds = leg.duration_in_traffic?.value || leg.duration?.value || 0
      const travelDuration = travelSeconds * 1000 // в миллисекундах
      currentTime += travelDuration

      // Если заказ еще не готов, добавляем время ожидания
      if (order.readyAt && currentTime < order.readyAt) {
        currentTime = order.readyAt
      }

      // Добавляем время на отдачу заказа (+5 минут)
      currentTime += DELIVERY_TIME_MS
      
      // Форс-мажор (+9 минут) расширяет дедлайн, не добавляется к ETA

      ordersWithETA.push({
        ...order,
        estimatedArrivalTime: currentTime
      })
    } else {
      ordersWithETA.push({
        ...order,
        estimatedArrivalTime: null
      })
    }
  })

  return ordersWithETA
}

// ========== Генераторы сообщений ==========

function generateDeadlineRiskMessage(order: OrderInfo, timeToDeadline: number): string {
  const minutes = Math.round(timeToDeadline / (60 * 1000))
  return `⚠️ ВНИМАНИЕ: Заказ #${order.orderNumber} должен быть доставлен через ${minutes} минут! Адрес: ${order.address}`
}

function generateDelayWarningMessage(order: OrderInfo, delayMs: number): string {
  const minutes = Math.round(delayMs / (60 * 1000))
  return `🚨 ОПОЗДАНИЕ: Заказ #${order.orderNumber} будет доставлен с опозданием на ${minutes} минут. Адрес: ${order.address}`
}

/**
 * Планирует уведомления для отправки
 */
export function scheduleNotifications(
  notifications: Notification[],
  onNotify: (notification: Notification) => void | Promise<void>
): void {
  const now = Date.now()

  notifications.forEach(notification => {
    if (notification.sent) return
    if (notification.timestamp <= now) {
      // Отправляем немедленно
      const notifyResult = onNotify(notification)
      if (notifyResult && typeof notifyResult.catch === 'function') {
        notifyResult.catch(console.error)
      }
      notification.sent = true
    } else {
      // Планируем на будущее
      const delay = notification.timestamp - now
      setTimeout(() => {
        const notifyResult = onNotify(notification)
        if (notifyResult && typeof notifyResult.catch === 'function') {
          notifyResult.catch(console.error)
        }
        notification.sent = true
      }, delay)
    }
  })
}

/**
 * Экспорт уведомлений для отображения
 */
export function formatNotificationForDisplay(notification: Notification): {
  title: string
  message: string
  icon: string
  color: string
} {
  const icons: Record<NotificationType, string> = {
    route_delay_warning: '⚠️',
    deadline_risk: '🚨',
    traffic_warning: '🚦',
    route_optimization_suggestion: '💡'
  }

  const colors: Record<'low' | 'medium' | 'high' | 'critical', string> = {
    low: 'blue',
    medium: 'green',
    high: 'orange',
    critical: 'red'
  }

  const titles: Record<NotificationType, string> = {
    route_delay_warning: 'Предупреждение о задержке',
    deadline_risk: 'Риск опоздания',
    traffic_warning: 'Пробки на маршруте',
    route_optimization_suggestion: 'Предложение по оптимизации'
  }

  return {
    title: titles[notification.type],
    message: notification.message,
    icon: icons[notification.type],
    color: colors[notification.priority]
  }
}

