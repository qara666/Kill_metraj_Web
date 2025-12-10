import React, { useState, useMemo } from 'react'
import { clsx } from 'clsx'
import { useTheme } from '../contexts/ThemeContext'
import {
  InformationCircleIcon,
  CheckCircleIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline'

interface RouteDetailsTabsProps {
  reasons: string[]
}

interface ParsedReason {
  orderInfo?: {
    orderNumber: string
    address: string
    priority?: string
    readyTime?: string
    zone?: string
    deadline?: string
  }
  compatibility?: string
  why?: string[]
  alternatives?: Array<{
    orderNumber: string
    priority: string
    reason: string
  }>
  result?: string
  logic?: Array<{
    label: string
    value: string
    status: 'ok' | 'warning' | 'error'
  }>
  metrics?: {
    orders?: string
    distance?: string
    time?: string
  }
}

export const RouteDetailsTabs: React.FC<RouteDetailsTabsProps> = ({ reasons }) => {
  const { isDark } = useTheme()
  const [activeTab, setActiveTab] = useState<string>('overview')
  const [activeReasonIndex, setActiveReasonIndex] = useState<number>(0)

  const parsedReasons = useMemo(() => {
    return reasons.map((reason) => {
      const parts = reason.split(' | ')
      const parsed: ParsedReason = {}

      parts.forEach((part) => {
        const trimmedPart = part.trim()
        
        // Основная информация о заказе
        if (trimmedPart.includes('выбран как первый заказ') || trimmedPart.includes('объединен с заказами')) {
          const orderMatch = trimmedPart.match(/Заказ #([^\s"]+)/)
          const addressMatch = trimmedPart.match(/"([^"]+)"/)
          if (orderMatch) {
            parsed.orderInfo = { ...parsed.orderInfo, orderNumber: orderMatch[1].trim() }
          }
          if (addressMatch) {
            parsed.orderInfo = { ...parsed.orderInfo, address: addressMatch[1].trim() }
          }
        }

        if (trimmedPart.includes('Оценка приоритета:') || trimmedPart.includes('📊 Оценка приоритета:')) {
          const priorityMatch = trimmedPart.match(/Оценка приоритета:\s*([\d.]+)/)
          if (priorityMatch) {
            if (!parsed.orderInfo) parsed.orderInfo = {}
            parsed.orderInfo.priority = priorityMatch[1]
          }
        }

        if (trimmedPart.includes('Оценка совместимости:') || trimmedPart.includes('📊 Оценка совместимости:')) {
          const compatMatch = trimmedPart.match(/Оценка совместимости:\s*([\d.]+)/)
          if (compatMatch) parsed.compatibility = compatMatch[1]
        }

        if (trimmedPart.includes('Время готовности:') || trimmedPart.includes('⏰ Время готовности:')) {
          const timeMatch = trimmedPart.match(/Время готовности:\s*([^|]+)/)
          if (timeMatch) {
            if (!parsed.orderInfo) parsed.orderInfo = {}
            parsed.orderInfo.readyTime = timeMatch[1].trim()
          }
        }

        if (trimmedPart.includes('Зона доставки:') || trimmedPart.includes('🏘️ Зона доставки:')) {
          const zoneMatch = trimmedPart.match(/Зона доставки:\s*([^|]+)/)
          if (zoneMatch) {
            if (!parsed.orderInfo) parsed.orderInfo = {}
            parsed.orderInfo.zone = zoneMatch[1].trim()
          }
        }

        if (trimmedPart.includes('Дедлайн:') || trimmedPart.includes('⏱️ Дедлайн:')) {
          const deadlineMatch = trimmedPart.match(/Дедлайн:\s*([^|]+)/)
          if (deadlineMatch) {
            if (!parsed.orderInfo) parsed.orderInfo = {}
            parsed.orderInfo.deadline = deadlineMatch[1].trim()
          }
        }

        // Почему именно этот заказ
        if (trimmedPart.includes('Почему именно этот заказ:') || trimmedPart.includes('🎯 Почему именно этот заказ:')) {
          parsed.why = []
        } else if (trimmedPart.startsWith('•') && parsed.why !== undefined) {
          parsed.why.push(trimmedPart.substring(1).trim())
        }

        // Сравнение с альтернативами
        if (trimmedPart.includes('Сравнение с альтернативами:') || trimmedPart.includes('📊 Сравнение с альтернативами:')) {
          parsed.alternatives = []
        } else if (trimmedPart.startsWith('• Заказ #') && parsed.alternatives !== undefined) {
          const altMatch = trimmedPart.match(/Заказ #([^:]+):\s*(?:приоритет|оценка)\s*([\d.]+)/)
          if (altMatch) {
            const reasonMatch = trimmedPart.match(/\(([^)]+)\)/)
            parsed.alternatives.push({
              orderNumber: altMatch[1].trim(),
              priority: altMatch[2],
              reason: reasonMatch ? reasonMatch[1] : trimmedPart.substring(trimmedPart.indexOf(':') + 1).trim()
            })
          }
        }

        // Результат
        if (trimmedPart.includes('Результат:') || trimmedPart.includes('💡 Результат:')) {
          parsed.result = trimmedPart.replace(/^(💡\s*)?Результат:\s*/, '').trim()
        }

        // Логика формирования
        if (trimmedPart.includes('Логика формирования:') || trimmedPart.includes('🔍 Логика формирования:')) {
          parsed.logic = []
        } else if (trimmedPart.startsWith('•') && parsed.logic !== undefined) {
          const logicMatch = trimmedPart.match(/•\s*([^:]+):\s*(.+)/)
          if (logicMatch) {
            const label = logicMatch[1].trim()
            const value = logicMatch[2].trim()
            let status: 'ok' | 'warning' | 'error' = 'ok'
            
            if (value.includes('несовместимо') || value.includes('нарушен') || value.includes('превышает') || value.includes('не указан')) {
              status = 'error'
            } else if (value.includes('совместимо') || value.includes('соблюден') || value.includes('в пределах') || value.includes('выбран как')) {
              status = 'ok'
            } else {
              status = 'warning'
            }

            parsed.logic.push({ label, value, status })
          }
        }

        // Метрики
        if (trimmedPart.includes('→')) {
          if (!parsed.metrics) parsed.metrics = {}
          if (trimmedPart.includes('Заказов:') || trimmedPart.includes('заказов')) {
            parsed.metrics.orders = trimmedPart
          } else if (trimmedPart.includes('км') || trimmedPart.includes('Расстояние:')) {
            parsed.metrics.distance = trimmedPart
          } else if (trimmedPart.includes('мин') || trimmedPart.includes('Время:')) {
            parsed.metrics.time = trimmedPart
          }
        }
      })

      return parsed
    })
  }, [reasons])

  const currentReason = parsedReasons[activeReasonIndex] || parsedReasons[0]
  const tabs = [
    { id: 'overview', label: 'Обзор', icon: InformationCircleIcon },
    { id: 'why', label: 'Почему этот заказ', icon: CheckCircleIcon },
    { id: 'alternatives', label: 'Альтернативы', icon: ChartBarIcon },
    { id: 'logic', label: 'Логика', icon: Cog6ToothIcon },
    { id: 'metrics', label: 'Метрики', icon: ArrowPathIcon }
  ]

  return (
    <div className={clsx('rounded-xl border-2', isDark ? 'bg-gray-900/50 border-gray-700' : 'bg-gray-50 border-gray-200')}>
      {/* Заголовок с навигацией по заказам */}
      <div className={clsx('p-4 border-b', isDark ? 'border-gray-700' : 'border-gray-200')}>
        <div className="flex items-center justify-between mb-3">
          <h3 className={clsx('text-lg font-semibold flex items-center gap-2', isDark ? 'text-gray-200' : 'text-gray-800')}>
            <span>📋</span>
            <span>Детальная информация о формировании маршрута</span>
          </h3>
          {reasons.length > 1 && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveReasonIndex(Math.max(0, activeReasonIndex - 1))}
                disabled={activeReasonIndex === 0}
                className={clsx(
                  'px-3 py-1 rounded-lg text-sm font-medium transition-colors',
                  isDark 
                    ? 'bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed' 
                    : 'bg-white hover:bg-gray-100 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                ← Предыдущий
              </button>
              <span className={clsx('text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>
                {activeReasonIndex + 1} / {reasons.length}
              </span>
              <button
                onClick={() => setActiveReasonIndex(Math.min(reasons.length - 1, activeReasonIndex + 1))}
                disabled={activeReasonIndex === reasons.length - 1}
                className={clsx(
                  'px-3 py-1 rounded-lg text-sm font-medium transition-colors',
                  isDark 
                    ? 'bg-gray-800 hover:bg-gray-700 text-gray-300 disabled:opacity-50 disabled:cursor-not-allowed' 
                    : 'bg-white hover:bg-gray-100 text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed'
                )}
              >
                Следующий →
              </button>
            </div>
          )}
        </div>

        {/* Табы */}
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap',
                  isActive
                    ? isDark
                      ? 'bg-blue-600 text-white shadow-lg'
                      : 'bg-blue-600 text-white shadow-lg'
                    : isDark
                    ? 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                )}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Контент табов */}
      <div className="p-6 max-h-[60vh] overflow-y-auto">
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {currentReason.orderInfo && (
              <div className={clsx('p-4 rounded-lg', isDark ? 'bg-gray-800/50' : 'bg-white')}>
                <div className="flex items-start gap-3 mb-3">
                  <div className={clsx('p-2 rounded-lg', isDark ? 'bg-green-600/20' : 'bg-green-100')}>
                    <CheckCircleIcon className={clsx('w-5 h-5', isDark ? 'text-green-400' : 'text-green-600')} />
                  </div>
                  <div className="flex-1">
                    <h4 className={clsx('font-semibold mb-2', isDark ? 'text-white' : 'text-gray-900')}>
                      Заказ #{currentReason.orderInfo.orderNumber}
                    </h4>
                    <p className={clsx('text-sm mb-3', isDark ? 'text-gray-300' : 'text-gray-700')}>
                      {currentReason.orderInfo.address}
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {currentReason.orderInfo.priority && (
                        <div>
                          <span className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>Приоритет</span>
                          <div className={clsx('font-semibold', isDark ? 'text-white' : 'text-gray-900')}>
                            {currentReason.orderInfo.priority}/100
                          </div>
                        </div>
                      )}
                      {currentReason.orderInfo.readyTime && (
                        <div>
                          <span className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>Готовность</span>
                          <div className={clsx('font-semibold', isDark ? 'text-white' : 'text-gray-900')}>
                            {currentReason.orderInfo.readyTime}
                          </div>
                        </div>
                      )}
                      {currentReason.orderInfo.zone && (
                        <div>
                          <span className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>Зона</span>
                          <div className={clsx('font-semibold', isDark ? 'text-white' : 'text-gray-900')}>
                            {currentReason.orderInfo.zone}
                          </div>
                        </div>
                      )}
                      {currentReason.orderInfo.deadline && (
                        <div>
                          <span className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>Дедлайн</span>
                          <div className={clsx('font-semibold', isDark ? 'text-white' : 'text-gray-900')}>
                            {currentReason.orderInfo.deadline}
                          </div>
                        </div>
                      )}
                    </div>
                    {currentReason.compatibility && (
                      <div className="mt-3 pt-3 border-t" style={{ borderColor: isDark ? 'rgba(55, 65, 81, 0.5)' : 'rgba(229, 231, 235, 1)' }}>
                        <span className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>Оценка совместимости</span>
                        <div className={clsx('text-lg font-bold', isDark ? 'text-blue-400' : 'text-blue-600')}>
                          {currentReason.compatibility}/100
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
            {currentReason.result && (
              <div className={clsx('p-4 rounded-lg', isDark ? 'bg-blue-900/20 border border-blue-700/50' : 'bg-blue-50 border border-blue-200')}>
                <div className="flex items-start gap-2">
                  <span className="text-lg">💡</span>
                  <div>
                    <div className={clsx('text-sm font-semibold mb-1', isDark ? 'text-blue-300' : 'text-blue-800')}>Результат</div>
                    <div className={clsx('text-sm', isDark ? 'text-blue-200' : 'text-blue-700')}>{currentReason.result}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'why' && (
          <div className="space-y-3">
            {currentReason.why && currentReason.why.length > 0 ? (
              currentReason.why.map((item, idx) => (
                <div key={idx} className={clsx('p-4 rounded-lg', isDark ? 'bg-gray-800/50' : 'bg-white')}>
                  <div className="flex items-start gap-3">
                    <div className={clsx('p-1.5 rounded', isDark ? 'bg-green-600/20' : 'bg-green-100')}>
                      <CheckCircleIcon className={clsx('w-4 h-4', isDark ? 'text-green-400' : 'text-green-600')} />
                    </div>
                    <div className={clsx('text-sm flex-1', isDark ? 'text-gray-300' : 'text-gray-700')}>{item}</div>
                  </div>
                </div>
              ))
            ) : (
              <div className={clsx('p-4 rounded-lg text-center', isDark ? 'bg-gray-800/50 text-gray-400' : 'bg-white text-gray-500')}>
                Информация недоступна
              </div>
            )}
          </div>
        )}

        {activeTab === 'alternatives' && (
          <div className="space-y-3">
            {currentReason.alternatives && currentReason.alternatives.length > 0 ? (
              currentReason.alternatives.map((alt, idx) => (
                <div key={idx} className={clsx('p-4 rounded-lg', isDark ? 'bg-gray-800/50' : 'bg-white')}>
                  <div className="flex items-center justify-between mb-2">
                    <div className={clsx('font-semibold', isDark ? 'text-white' : 'text-gray-900')}>
                      Заказ #{alt.orderNumber}
                    </div>
                    <div className={clsx('px-2 py-1 rounded text-xs font-semibold', isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700')}>
                      {alt.priority}/100
                    </div>
                  </div>
                  {alt.reason && (
                    <div className={clsx('text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>{alt.reason}</div>
                  )}
                </div>
              ))
            ) : (
              <div className={clsx('p-4 rounded-lg text-center', isDark ? 'bg-gray-800/50 text-gray-400' : 'bg-white text-gray-500')}>
                Альтернативные кандидаты не найдены
              </div>
            )}
          </div>
        )}

        {activeTab === 'logic' && (
          <div className="space-y-3">
            {currentReason.logic && currentReason.logic.length > 0 ? (
              currentReason.logic.map((item, idx) => (
                <div key={idx} className={clsx('p-4 rounded-lg', isDark ? 'bg-gray-800/50' : 'bg-white')}>
                  <div className="flex items-start gap-3">
                    <div className={clsx(
                      'p-1.5 rounded',
                      item.status === 'ok' 
                        ? isDark ? 'bg-green-600/20' : 'bg-green-100'
                        : item.status === 'error'
                        ? isDark ? 'bg-red-600/20' : 'bg-red-100'
                        : isDark ? 'bg-yellow-600/20' : 'bg-yellow-100'
                    )}>
                      {item.status === 'ok' ? (
                        <CheckCircleIcon className={clsx('w-4 h-4', isDark ? 'text-green-400' : 'text-green-600')} />
                      ) : item.status === 'error' ? (
                        <span className={clsx('text-xs', isDark ? 'text-red-400' : 'text-red-600')}>⚠</span>
                      ) : (
                        <span className={clsx('text-xs', isDark ? 'text-yellow-400' : 'text-yellow-600')}>⚠</span>
                      )}
                    </div>
                    <div className="flex-1">
                      <div className={clsx('font-semibold mb-1', isDark ? 'text-white' : 'text-gray-900')}>{item.label}</div>
                      <div className={clsx(
                        'text-sm',
                        item.status === 'ok'
                          ? isDark ? 'text-green-300' : 'text-green-700'
                          : item.status === 'error'
                          ? isDark ? 'text-red-300' : 'text-red-700'
                          : isDark ? 'text-yellow-300' : 'text-yellow-700'
                      )}>
                        {item.value}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className={clsx('p-4 rounded-lg text-center', isDark ? 'bg-gray-800/50 text-gray-400' : 'bg-white text-gray-500')}>
                Информация недоступна
              </div>
            )}
          </div>
        )}

        {activeTab === 'metrics' && (
          <div className="space-y-4">
            {currentReason.metrics && (
              <div className={clsx('p-4 rounded-lg', isDark ? 'bg-gray-800/50' : 'bg-white')}>
                <h4 className={clsx('font-semibold mb-3', isDark ? 'text-white' : 'text-gray-900')}>Изменения метрик</h4>
                <div className="space-y-2">
                  {currentReason.metrics.orders && (
                    <div className="flex items-center justify-between">
                      <span className={clsx('text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>Заказов</span>
                      <span className={clsx('font-semibold', isDark ? 'text-white' : 'text-gray-900')}>
                        {currentReason.metrics.orders}
                      </span>
                    </div>
                  )}
                  {currentReason.metrics.distance && (
                    <div className="flex items-center justify-between">
                      <span className={clsx('text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>Расстояние</span>
                      <span className={clsx('font-semibold', isDark ? 'text-white' : 'text-gray-900')}>
                        {currentReason.metrics.distance}
                      </span>
                    </div>
                  )}
                  {currentReason.metrics.time && (
                    <div className="flex items-center justify-between">
                      <span className={clsx('text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>Время</span>
                      <span className={clsx('font-semibold', isDark ? 'text-white' : 'text-gray-900')}>
                        {currentReason.metrics.time}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
            {!currentReason.metrics && (
              <div className={clsx('p-4 rounded-lg text-center', isDark ? 'bg-gray-800/50 text-gray-400' : 'bg-white text-gray-500')}>
                Метрики недоступны
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

