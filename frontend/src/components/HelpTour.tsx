// Интерактивный тур по функциям приложения

import React, { useState, useEffect, useRef } from 'react'
import { clsx } from 'clsx'
import { useTheme } from '../contexts/ThemeContext'
import {
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline'

export interface TourStep {
  id: string
  title: string
  content: string
  target?: string // CSS selector для элемента
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center'
  image?: string // URL изображения для демонстрации
  action?: () => void // Действие перед показом шага
}

interface HelpTourProps {
  steps: TourStep[]
  isOpen: boolean
  onClose: () => void
  onComplete?: () => void
  startStep?: number
}

export const HelpTour: React.FC<HelpTourProps> = ({
  steps,
  isOpen,
  onClose,
  onComplete,
  startStep = 0
}) => {
  const { isDark } = useTheme()
  const [currentStep, setCurrentStep] = useState(startStep)
  const [overlayStyle, setOverlayStyle] = useState<React.CSSProperties>({})
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({})
  const [targetFound, setTargetFound] = useState<boolean>(false)
  const [demoState, setDemoState] = useState({
    courierCreated: false,
    fileUploaded: false,
    ordersAssigned: false,
    routesBuilt: false,
    settingsConfigured: false,
    routePlanned: false,
    analyticsViewed: false,
    routeExported: false
  })
  const overlayRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen || steps.length === 0) return

    const step = steps[currentStep]
    if (!step) return

    // Выполняем действие перед показом шага
    if (step.action) {
      step.action()
    }

    // Функция для поиска и позиционирования элемента
    const findAndPositionElement = () => {
      // Находим целевой элемент с небольшой задержкой для рендеринга
      const targetElement = step.target ? document.querySelector(step.target) : null

      if (targetElement) {
        setTargetFound(true)
        
        // Получаем точные координаты элемента с учетом всех скроллов
        const rect = targetElement.getBoundingClientRect()
        
        // Позиционируем overlay точно вокруг элемента используя fixed позиционирование
        // rect уже содержит координаты относительно viewport, поэтому используем их напрямую
        setOverlayStyle({
          top: `${rect.top}px`,
          left: `${rect.left}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`
        })

        // Позиционируем tooltip с учетом границ экрана
        const position = step.position || 'bottom'
        // Адаптивная ширина: 480px на больших экранах, но не больше чем calc(100vw - 40px)
        const tooltipWidth = Math.min(480, window.innerWidth - 40)
        const tooltipMaxHeight = Math.min(window.innerHeight * 0.85, 600) // максимум 85% или 600px
        const tooltipMinHeight = Math.min(300, window.innerHeight * 0.4) // минимум 300px или 40% экрана
        const padding = 20
        let tooltipTop = 0
        let tooltipLeft = 0
        let finalPosition = position

        // Определяем оптимальную позицию с учетом границ экрана
        const spaceTop = rect.top
        const spaceBottom = window.innerHeight - rect.bottom
        const spaceLeft = rect.left
        const spaceRight = window.innerWidth - rect.right
        const estimatedTooltipHeight = Math.max(tooltipMinHeight, Math.min(tooltipMaxHeight, 500))

        switch (position) {
          case 'top':
            if (spaceTop < estimatedTooltipHeight + padding) {
              finalPosition = 'bottom'
              tooltipTop = rect.bottom + padding
            } else {
              tooltipTop = rect.top - padding
            }
            tooltipLeft = rect.left + rect.width / 2
            break
          case 'bottom':
            if (spaceBottom < estimatedTooltipHeight + padding) {
              finalPosition = 'top'
              tooltipTop = rect.top - padding
            } else {
              tooltipTop = rect.bottom + padding
            }
            tooltipLeft = rect.left + rect.width / 2
            break
          case 'left':
            if (spaceLeft < tooltipWidth + padding) {
              finalPosition = 'right'
              tooltipLeft = rect.right + padding
            } else {
              tooltipLeft = rect.left - padding
            }
            tooltipTop = rect.top + rect.height / 2
            break
          case 'right':
            if (spaceRight < tooltipWidth + padding) {
              finalPosition = 'left'
              tooltipLeft = rect.left - padding
            } else {
              tooltipLeft = rect.right + padding
            }
            tooltipTop = rect.top + rect.height / 2
            break
          case 'center':
            tooltipTop = window.innerHeight / 2
            tooltipLeft = window.innerWidth / 2
            break
        }

        // Ограничиваем позицию границами экрана с учетом размеров tooltip
        // Для top/bottom учитываем высоту, для left/right - ширину
        if (finalPosition === 'top' || finalPosition === 'bottom') {
          tooltipLeft = Math.max(padding, Math.min(tooltipLeft, window.innerWidth - tooltipWidth - padding))
          // Убеждаемся, что tooltip не выходит за верхнюю границу
          if (finalPosition === 'top') {
            tooltipTop = Math.max(padding, tooltipTop)
          }
          // Убеждаемся, что tooltip не выходит за нижнюю границу
          if (finalPosition === 'bottom') {
            tooltipTop = Math.min(tooltipTop, window.innerHeight - estimatedTooltipHeight - padding)
          }
        } else if (finalPosition === 'left' || finalPosition === 'right') {
          tooltipTop = Math.max(padding, Math.min(tooltipTop, window.innerHeight - estimatedTooltipHeight - padding))
          tooltipLeft = Math.max(padding, Math.min(tooltipLeft, window.innerWidth - tooltipWidth - padding))
        } else if (finalPosition === 'center') {
          // Для center позиции центрируем с учетом размеров
          tooltipTop = Math.max(padding, Math.min(tooltipTop, window.innerHeight - estimatedTooltipHeight - padding))
          tooltipLeft = Math.max(padding, Math.min(tooltipLeft, window.innerWidth - tooltipWidth - padding))
        }

        // Финальная проверка: убеждаемся, что tooltip полностью виден
        let finalTop = tooltipTop
        let finalLeft = tooltipLeft
        
        // Проверяем границы после transform
        if (finalPosition === 'center') {
          finalTop = Math.max(padding, Math.min(finalTop, window.innerHeight - estimatedTooltipHeight - padding))
          finalLeft = Math.max(padding, Math.min(finalLeft, window.innerWidth - tooltipWidth - padding))
        } else if (finalPosition === 'top' || finalPosition === 'bottom') {
          // После translateX(-50%) левая граница будет tooltipLeft - tooltipWidth/2
          const leftAfterTransform = tooltipLeft - tooltipWidth / 2
          if (leftAfterTransform < padding) {
            finalLeft = padding + tooltipWidth / 2
          } else if (leftAfterTransform + tooltipWidth > window.innerWidth - padding) {
            finalLeft = window.innerWidth - padding - tooltipWidth / 2
          }
        } else if (finalPosition === 'left' || finalPosition === 'right') {
          // После translateY(-50%) верхняя граница будет tooltipTop - estimatedTooltipHeight/2
          const topAfterTransform = tooltipTop - estimatedTooltipHeight / 2
          if (topAfterTransform < padding) {
            finalTop = padding + estimatedTooltipHeight / 2
          } else if (topAfterTransform + estimatedTooltipHeight > window.innerHeight - padding) {
            finalTop = window.innerHeight - padding - estimatedTooltipHeight / 2
          }
        }
        
        setTooltipStyle({
          position: 'fixed',
          top: `${finalTop}px`,
          left: `${finalLeft}px`,
          minHeight: `${tooltipMinHeight}px`,
          maxHeight: `${tooltipMaxHeight}px`,
          transform: finalPosition === 'center' 
            ? 'translate(-50%, -50%)' 
            : finalPosition === 'left' || finalPosition === 'right'
            ? `translateY(-50%)`
            : 'translateX(-50%)',
          zIndex: 10000
        })

        // Прокручиваем к элементу
        setTimeout(() => {
          targetElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'center'
          })
        }, 100)
      } else {
        // Если нет целевого элемента, показываем в центре
        const tooltipMinHeight = Math.min(300, window.innerHeight * 0.4)
        const tooltipMaxHeight = Math.min(window.innerHeight * 0.85, 600)
        setOverlayStyle({})
        setTooltipStyle({
          top: '50%',
          left: '50%',
          minHeight: `${tooltipMinHeight}px`,
          maxHeight: `${tooltipMaxHeight}px`,
          transform: 'translate(-50%, -50%)',
          zIndex: 10000
        })
        setTargetFound(false)
      }
    }

    // Небольшая задержка для рендеринга DOM
    const timeoutId = setTimeout(findAndPositionElement, 100)

    // Также слушаем изменения размера окна и скролла
    let rafId: number | null = null
    const handleUpdate = () => {
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => {
        findAndPositionElement()
      })
    }
    
    const handleResize = () => {
      handleUpdate()
    }
    
    const handleScroll = () => {
      handleUpdate()
    }
    
    window.addEventListener('resize', handleResize)
    window.addEventListener('scroll', handleScroll, true)
    
    // Также слушаем скролл в контейнерах
    const scrollContainers = document.querySelectorAll('[data-tour]')
    scrollContainers.forEach(container => {
      container.addEventListener('scroll', handleScroll, true)
    })

    return () => {
      clearTimeout(timeoutId)
      if (rafId) cancelAnimationFrame(rafId)
      window.removeEventListener('resize', handleResize)
      window.removeEventListener('scroll', handleScroll, true)
      scrollContainers.forEach(container => {
        container.removeEventListener('scroll', handleScroll, true)
      })
    }
  }, [isOpen, currentStep, steps])

  // Горячие клавиши: ← → для навигации, Esc — закрыть
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault()
        if (currentStep < steps.length - 1) {
          setCurrentStep((s) => s + 1)
        } else {
          onComplete?.()
          onClose()
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        if (currentStep > 0) setCurrentStep((s) => s - 1)
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen, currentStep, steps.length, onClose, onComplete])

  if (!isOpen || steps.length === 0) return null

  const step = steps[currentStep]
  const isFirst = currentStep === 0
  const isLast = currentStep === steps.length - 1

  const handleNext = () => {
    if (isLast) {
      onComplete?.()
      onClose()
    } else {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handlePrev = () => {
    if (!isFirst) {
      setCurrentStep(prev => prev - 1)
    }
  }

  const handleSkip = () => {
    onClose()
  }

  // Функция для рендеринга реального примера функции
  const renderDemoExample = () => {
    const stepId = step.id

    switch (stepId) {
      case 'upload':
        return (
          <div className={clsx(
            'p-4 rounded-lg border-2 space-y-3',
            isDark ? 'border-blue-500/50 bg-blue-900/20' : 'border-blue-300 bg-blue-50'
          )}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">📤</span>
              <div className="text-sm font-semibold">Загрузка Excel файла</div>
            </div>
            <div className={clsx(
              'p-4 rounded-lg border-2 border-dashed',
              isDark ? 'border-gray-600 bg-gray-800/50' : 'border-gray-300 bg-white'
            )}>
              <div className="flex items-center justify-center gap-3 mb-3">
                <div className={clsx(
                  'p-3 rounded-lg',
                  isDark ? 'bg-gray-700' : 'bg-gray-100'
                )}>
                  <span className="text-2xl">📄</span>
                </div>
                <div className="flex-1">
                  <div className={clsx(
                    'text-sm font-semibold mb-1',
                    isDark ? 'text-white' : 'text-gray-900'
                  )}>orders.xlsx</div>
                  <div className={clsx(
                    'text-xs',
                    isDark ? 'text-gray-400' : 'text-gray-600'
                  )}>12 заказов • 2.3 МБ</div>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setDemoState(s => ({ ...s, fileUploaded: true }))
                  setTimeout(() => {
                    if (currentStep < steps.length - 1) {
                      setCurrentStep(currentStep + 1)
                    }
                  }, 500)
                }}
                className={clsx(
                  'w-full px-4 py-2.5 rounded-lg font-medium transition-all',
                  demoState.fileUploaded
                    ? (isDark ? 'bg-green-600 text-white' : 'bg-green-500 text-white')
                    : (isDark ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white')
                )}
              >
                {demoState.fileUploaded ? '✓ Файл загружен' : 'Загрузить файл'}
              </button>
              <div className={clsx(
                'mt-3 text-xs space-y-1',
                isDark ? 'text-gray-400' : 'text-gray-600'
              )}>
                <div>✓ Формат: .xlsx, .xls</div>
                <div>✓ Колонки: Адрес, Время, Сумма</div>
                <div>✓ После загрузки появится список заказов</div>
              </div>
            </div>
          </div>
        )

      case 'settings':
        return (
          <div className={clsx(
            'p-4 rounded-lg border-2 space-y-3',
            isDark ? 'border-purple-500/50 bg-purple-900/20' : 'border-purple-300 bg-purple-50'
          )}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">⚙️</span>
              <div className="text-sm font-semibold">Настройки планирования</div>
            </div>
            <div className="space-y-3">
              <div className={clsx(
                'p-3 rounded-lg border',
                isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-white'
              )}>
                <div className={clsx(
                  'text-xs font-semibold mb-2',
                  isDark ? 'text-gray-300' : 'text-gray-700'
                )}>Максимум остановок</div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="1"
                    max="10"
                    defaultValue="5"
                    className="flex-1"
                    disabled
                  />
                  <span className={clsx(
                    'text-sm font-bold w-8 text-center',
                    isDark ? 'text-white' : 'text-gray-900'
                  )}>5</span>
                </div>
              </div>
              <div className={clsx(
                'p-3 rounded-lg border',
                isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-white'
              )}>
                <div className={clsx(
                  'text-xs font-semibold mb-2',
                  isDark ? 'text-gray-300' : 'text-gray-700'
                )}>Режим трафика</div>
                <div className="grid grid-cols-4 gap-2">
                  {['Свободно', 'Плотно', 'Стоим', 'Авто'].map((mode, i) => (
                    <button
                      key={mode}
                      onClick={() => setDemoState(s => ({ ...s, settingsConfigured: true }))}
                      className={clsx(
                        'px-2 py-1.5 rounded text-[10px] font-medium transition',
                        i === 3
                          ? (isDark ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white')
                          : (isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200')
                      )}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        setDemoState(s => ({ ...s, settingsConfigured: true }))
                      }}
                className={clsx(
                  'w-full px-4 py-2 rounded-lg font-medium transition',
                  demoState.settingsConfigured
                    ? (isDark ? 'bg-green-600 text-white' : 'bg-green-500 text-white')
                    : (isDark ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-purple-600 hover:bg-purple-700 text-white')
                )}
              >
                {demoState.settingsConfigured ? '✓ Настройки сохранены' : 'Сохранить настройки'}
              </button>
            </div>
          </div>
        )

      case 'plan':
        return (
          <div className={clsx(
            'p-4 rounded-lg border-2 space-y-3',
            isDark ? 'border-emerald-500/50 bg-emerald-900/20' : 'border-emerald-300 bg-emerald-50'
          )}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🚀</span>
              <div className="text-sm font-semibold">Планирование маршрутов</div>
            </div>
            <div className={clsx(
              'p-4 rounded-lg border',
              isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-white'
            )}>
              <div className={clsx(
                'text-xs mb-3 space-y-1.5',
                isDark ? 'text-gray-300' : 'text-gray-700'
              )}>
                <div className="flex items-center gap-2">
                  <span>📊</span>
                  <span>Анализ 12 заказов...</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>🗺️</span>
                  <span>Группировка по зонам...</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>⏱️</span>
                  <span>Расчет времени доставки...</span>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setDemoState(s => ({ ...s, routePlanned: true }))
                  setTimeout(() => {
                    if (currentStep < steps.length - 1) {
                      setCurrentStep(currentStep + 1)
                    }
                  }, 1000)
                }}
                className={clsx(
                  'w-full px-4 py-3 rounded-lg font-semibold transition-all flex items-center justify-center gap-2',
                  demoState.routePlanned
                    ? (isDark ? 'bg-green-600 text-white' : 'bg-green-500 text-white')
                    : (isDark ? 'bg-emerald-600 hover:bg-emerald-700 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white')
                )}
              >
                {demoState.routePlanned ? (
                  <>
                    <span>✓</span>
                    <span>Маршруты созданы (3 маршрута)</span>
                  </>
                ) : (
                  <>
                    <span>🚀</span>
                    <span>Планировать маршруты</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )

      case 'routes':
        return (
          <div className={clsx(
            'p-4 rounded-lg border-2 space-y-3',
            isDark ? 'border-blue-500/50 bg-blue-900/20' : 'border-blue-300 bg-blue-50'
          )}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🗺️</span>
              <div className="text-sm font-semibold">Список маршрутов</div>
            </div>
            <div className="space-y-2">
              {[
                { id: 1, orders: 3, distance: '12.5 км', time: '45 мин', amount: '1,250 грн' },
                { id: 2, orders: 4, distance: '18.2 км', time: '62 мин', amount: '1,890 грн' },
                { id: 3, orders: 5, distance: '15.8 км', time: '55 мин', amount: '2,100 грн' }
              ].map((route) => (
                <div
                  key={route.id}
                  className={clsx(
                    'p-3 rounded-lg border',
                    isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-white'
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className={clsx(
                      'text-sm font-semibold',
                      isDark ? 'text-white' : 'text-gray-900'
                    )}>Маршрут #{route.id}</div>
                    <button className={clsx(
                      'px-2 py-1 rounded text-[10px] font-medium',
                      isDark ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'
                    )}>Открыть</button>
                  </div>
                  <div className="grid grid-cols-4 gap-2 text-[10px]">
                    <div>
                      <div className={clsx(
                        'opacity-70 mb-0.5',
                        isDark ? 'text-gray-400' : 'text-gray-600'
                      )}>Заказы</div>
                      <div className={clsx(
                        'font-semibold',
                        isDark ? 'text-white' : 'text-gray-900'
                      )}>{route.orders}</div>
                    </div>
                    <div>
                      <div className={clsx(
                        'opacity-70 mb-0.5',
                        isDark ? 'text-gray-400' : 'text-gray-600'
                      )}>Расстояние</div>
                      <div className={clsx(
                        'font-semibold',
                        isDark ? 'text-white' : 'text-gray-900'
                      )}>{route.distance}</div>
                    </div>
                    <div>
                      <div className={clsx(
                        'opacity-70 mb-0.5',
                        isDark ? 'text-gray-400' : 'text-gray-600'
                      )}>Время</div>
                      <div className={clsx(
                        'font-semibold',
                        isDark ? 'text-white' : 'text-gray-900'
                      )}>{route.time}</div>
                    </div>
                    <div>
                      <div className={clsx(
                        'opacity-70 mb-0.5',
                        isDark ? 'text-gray-400' : 'text-gray-600'
                      )}>Сумма</div>
                      <div className={clsx(
                        'font-semibold',
                        isDark ? 'text-white' : 'text-gray-900'
                      )}>{route.amount}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )

      case 'analytics':
        return (
          <div className={clsx(
            'p-4 rounded-lg border-2 space-y-3',
            isDark ? 'border-indigo-500/50 bg-indigo-900/20' : 'border-indigo-300 bg-indigo-50'
          )}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">📊</span>
              <div className="text-sm font-semibold">Аналитика маршрутов</div>
            </div>
            <div className={clsx(
              'p-4 rounded-lg border',
              isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-white'
            )}>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className={clsx(
                  'p-2 rounded border',
                  isDark ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'
                )}>
                  <div className={clsx(
                    'text-[10px] opacity-70 mb-1',
                    isDark ? 'text-gray-400' : 'text-gray-600'
                  )}>Маршрутов</div>
                  <div className={clsx(
                    'text-lg font-bold',
                    isDark ? 'text-white' : 'text-gray-900'
                  )}>3</div>
                </div>
                <div className={clsx(
                  'p-2 rounded border',
                  isDark ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'
                )}>
                  <div className={clsx(
                    'text-[10px] opacity-70 mb-1',
                    isDark ? 'text-gray-400' : 'text-gray-600'
                  )}>Заказов</div>
                  <div className={clsx(
                    'text-lg font-bold',
                    isDark ? 'text-white' : 'text-gray-900'
                  )}>12</div>
                </div>
                <div className={clsx(
                  'p-2 rounded border',
                  isDark ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'
                )}>
                  <div className={clsx(
                    'text-[10px] opacity-70 mb-1',
                    isDark ? 'text-gray-400' : 'text-gray-600'
                  )}>Расстояние</div>
                  <div className={clsx(
                    'text-lg font-bold',
                    isDark ? 'text-white' : 'text-gray-900'
                  )}>46.5 км</div>
                </div>
                <div className={clsx(
                  'p-2 rounded border',
                  isDark ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'
                )}>
                  <div className={clsx(
                    'text-[10px] opacity-70 mb-1',
                    isDark ? 'text-gray-400' : 'text-gray-600'
                  )}>Время</div>
                  <div className={clsx(
                    'text-lg font-bold',
                    isDark ? 'text-white' : 'text-gray-900'
                  )}>162 мин</div>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setDemoState(s => ({ ...s, analyticsViewed: true }))
                }}
                className={clsx(
                  'w-full px-4 py-2 rounded-lg font-medium transition',
                  demoState.analyticsViewed
                    ? (isDark ? 'bg-green-600 text-white' : 'bg-green-500 text-white')
                    : (isDark ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-indigo-600 hover:bg-indigo-700 text-white')
                )}
              >
                {demoState.analyticsViewed ? '✓ Аналитика просмотрена' : 'Открыть аналитику'}
              </button>
            </div>
          </div>
        )

      case 'export':
        return (
          <div className={clsx(
            'p-4 rounded-lg border-2 space-y-3',
            isDark ? 'border-amber-500/50 bg-amber-900/20' : 'border-amber-300 bg-amber-50'
          )}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">📤</span>
              <div className="text-sm font-semibold">Экспорт маршрутов</div>
            </div>
            <div className="space-y-2">
              {[
                { name: 'Google Maps', icon: '🗺️', desc: 'Открыть в браузере' },
                { name: 'Waze', icon: '🚗', desc: 'Открыть в приложении' },
                { name: 'PDF', icon: '📄', desc: 'Скачать документ' }
              ].map((option) => (
                <button
                  key={option.name}
                  onClick={(e) => {
                    e.stopPropagation()
                    setDemoState(s => ({ ...s, routeExported: true }))
                  }}
                  className={clsx(
                    'w-full p-3 rounded-lg border text-left transition flex items-center gap-3',
                    isDark ? 'border-gray-700 bg-gray-800/50 hover:border-amber-500' : 'border-gray-200 bg-white hover:border-amber-400'
                  )}
                >
                  <span className="text-xl">{option.icon}</span>
                  <div className="flex-1">
                    <div className={clsx(
                      'text-sm font-semibold mb-0.5',
                      isDark ? 'text-white' : 'text-gray-900'
                    )}>{option.name}</div>
                    <div className={clsx(
                      'text-[10px]',
                      isDark ? 'text-gray-400' : 'text-gray-600'
                    )}>{option.desc}</div>
                  </div>
                  {demoState.routeExported && (
                    <span className="text-green-500">✓</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )

      case 'courier-select':
        return (
          <div className={clsx(
            'p-4 rounded-lg border-2 space-y-3',
            isDark ? 'border-emerald-500/50 bg-emerald-900/20' : 'border-emerald-300 bg-emerald-50'
          )}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">👤</span>
              <div className="text-sm font-semibold">Выбор курьера</div>
            </div>
            <div className="space-y-2">
              {[
                { name: 'Иван Петров', type: 'Авто', status: 'Свободен' },
                { name: 'Алия Смирнова', type: 'Мото', status: 'На линии' },
                { name: 'Дмитрий Козлов', type: 'Авто', status: 'Свободен' }
              ].map((courier, i) => (
                <button
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation()
                    setDemoState(s => ({ ...s, courierCreated: true }))
                  }}
                  className={clsx(
                    'w-full p-3 rounded-lg border text-left transition',
                    i === 0
                      ? (isDark ? 'border-emerald-500 bg-emerald-900/40' : 'border-emerald-400 bg-emerald-50')
                      : (isDark ? 'border-gray-700 bg-gray-800/50 hover:border-gray-600' : 'border-gray-200 bg-white hover:border-gray-300')
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className={clsx(
                      'text-sm font-semibold',
                      isDark ? 'text-white' : 'text-gray-900'
                    )}>{courier.name}</div>
                    <span className={clsx(
                      'text-[10px] px-2 py-0.5 rounded',
                      courier.status === 'На линии'
                        ? (isDark ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white')
                        : (isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700')
                    )}>{courier.status}</span>
                  </div>
                  <div className={clsx(
                    'text-[10px]',
                    isDark ? 'text-gray-400' : 'text-gray-600'
                  )}>{courier.type}</div>
                </button>
              ))}
            </div>
          </div>
        )

      case 'order-select':
        return (
          <div className={clsx(
            'p-4 rounded-lg border-2 space-y-3',
            isDark ? 'border-blue-500/50 bg-blue-900/20' : 'border-blue-300 bg-blue-50'
          )}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">📦</span>
              <div className="text-sm font-semibold">Выбор заказов</div>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {[
                { id: '001', address: 'ул. Ленина, 15', time: '12:30', amount: '450 грн', urgent: true },
                { id: '002', address: 'пр. Победы, 42', time: '13:00', amount: '320 грн', urgent: false },
                { id: '003', address: 'ул. Мира, 8', time: '13:15', amount: '580 грн', urgent: false }
              ].map((order, i) => (
                <button
                  key={order.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    setDemoState(s => ({ ...s, ordersAssigned: true }))
                  }}
                  className={clsx(
                    'w-full p-2.5 rounded-lg border text-left transition',
                    i === 0
                      ? (isDark ? 'border-blue-500 bg-blue-900/40' : 'border-blue-400 bg-blue-50')
                      : (isDark ? 'border-gray-700 bg-gray-800/50 hover:border-gray-600' : 'border-gray-200 bg-white hover:border-gray-300')
                  )}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className={clsx(
                      'text-xs font-semibold',
                      isDark ? 'text-white' : 'text-gray-900'
                    )}>Заказ #{order.id}</div>
                    {order.urgent && (
                      <span className={clsx(
                        'text-[10px] px-1.5 py-0.5 rounded',
                        isDark ? 'bg-rose-600 text-white' : 'bg-rose-500 text-white'
                      )}>Срочно</span>
                    )}
                  </div>
                  <div className={clsx(
                    'text-[10px] mb-1',
                    isDark ? 'text-gray-400' : 'text-gray-600'
                  )}>{order.address}</div>
                  <div className="flex items-center gap-3 text-[10px]">
                    <span className={clsx(
                      isDark ? 'text-gray-400' : 'text-gray-600'
                    )}>⏰ {order.time}</span>
                    <span className={clsx(
                      'font-semibold',
                      isDark ? 'text-white' : 'text-gray-900'
                    )}>{order.amount}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )

      case 'create-route':
        return (
          <div className={clsx(
            'p-4 rounded-lg border-2 space-y-3',
            isDark ? 'border-violet-500/50 bg-violet-900/20' : 'border-violet-300 bg-violet-50'
          )}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">✨</span>
              <div className="text-sm font-semibold">Создание маршрута</div>
            </div>
            <div className={clsx(
              'p-3 rounded-lg border',
              isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-white'
            )}>
              <div className={clsx(
                'text-xs mb-3 space-y-1.5',
                isDark ? 'text-gray-300' : 'text-gray-700'
              )}>
                <div className="flex items-center gap-2">
                  <span>✓</span>
                  <span>Курьер: Иван Петров</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>✓</span>
                  <span>Заказов: 3</span>
                </div>
                <div className="flex items-center gap-2">
                  <span>⏳</span>
                  <span>Расчет маршрута...</span>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setDemoState(s => ({ ...s, routesBuilt: true }))
                }}
                className={clsx(
                  'w-full px-4 py-2.5 rounded-lg font-semibold transition',
                  demoState.routesBuilt
                    ? (isDark ? 'bg-green-600 text-white' : 'bg-green-500 text-white')
                    : (isDark ? 'bg-violet-600 hover:bg-violet-700 text-white' : 'bg-violet-600 hover:bg-violet-700 text-white')
                )}
              >
                {demoState.routesBuilt ? '✓ Маршрут создан' : 'Создать маршрут'}
              </button>
            </div>
          </div>
        )

      case 'route-list':
        return (
          <div className={clsx(
            'p-4 rounded-lg border-2 space-y-3',
            isDark ? 'border-cyan-500/50 bg-cyan-900/20' : 'border-cyan-300 bg-cyan-50'
          )}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">📋</span>
              <div className="text-sm font-semibold">Список маршрутов</div>
            </div>
            <div className="space-y-2">
              {[
                { id: 1, courier: 'Иван Петров', orders: 3, distance: '12.5 км', time: '45 мин' },
                { id: 2, courier: 'Алия Смирнова', orders: 2, distance: '8.3 км', time: '32 мин' }
              ].map((route) => (
                <div
                  key={route.id}
                  className={clsx(
                    'p-3 rounded-lg border',
                    isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-white'
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className={clsx(
                      'text-sm font-semibold',
                      isDark ? 'text-white' : 'text-gray-900'
                    )}>Маршрут #{route.id}</div>
                    <div className="flex gap-1">
                      <button className={clsx(
                        'px-2 py-1 rounded text-[10px]',
                        isDark ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'
                      )}>🗺️</button>
                      <button className={clsx(
                        'px-2 py-1 rounded text-[10px]',
                        isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
                      )}>🔄</button>
                    </div>
                  </div>
                  <div className={clsx(
                    'text-[10px] mb-2',
                    isDark ? 'text-gray-400' : 'text-gray-600'
                  )}>Курьер: {route.courier}</div>
                  <div className="grid grid-cols-3 gap-2 text-[10px]">
                    <div>
                      <div className={clsx(
                        'opacity-70',
                        isDark ? 'text-gray-400' : 'text-gray-600'
                      )}>Заказы</div>
                      <div className={clsx(
                        'font-semibold',
                        isDark ? 'text-white' : 'text-gray-900'
                      )}>{route.orders}</div>
                    </div>
                    <div>
                      <div className={clsx(
                        'opacity-70',
                        isDark ? 'text-gray-400' : 'text-gray-600'
                      )}>Расстояние</div>
                      <div className={clsx(
                        'font-semibold',
                        isDark ? 'text-white' : 'text-gray-900'
                      )}>{route.distance}</div>
                    </div>
                    <div>
                      <div className={clsx(
                        'opacity-70',
                        isDark ? 'text-gray-400' : 'text-gray-600'
                      )}>Время</div>
                      <div className={clsx(
                        'font-semibold',
                        isDark ? 'text-white' : 'text-gray-900'
                      )}>{route.time}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )

      case 'filters':
        return (
          <div className={clsx(
            'p-4 rounded-lg border-2 space-y-3',
            isDark ? 'border-blue-500/50 bg-blue-900/20' : 'border-blue-300 bg-blue-50'
          )}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🔍</span>
              <div className="text-sm font-semibold">Фильтры курьеров</div>
            </div>
            <div className="space-y-2">
              {[
                { label: 'Все курьеры', count: 5, active: true, icon: '👥' },
                { label: 'Авто курьеры', count: 3, active: false, icon: '🚗' },
                { label: 'Мото курьеры', count: 2, active: false, icon: '🏍️' }
              ].map((filter, i) => (
                <button
                  key={i}
                  onClick={(e) => {
                    e.stopPropagation()
                  }}
                  className={clsx(
                    'w-full p-3 rounded-lg border text-left transition',
                    filter.active
                      ? (isDark ? 'border-blue-500 bg-blue-900/40' : 'border-blue-400 bg-blue-100')
                      : (isDark ? 'border-gray-700 bg-gray-800/50 hover:border-gray-600' : 'border-gray-200 bg-white hover:border-gray-300')
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{filter.icon}</span>
                      <span className={clsx(
                        'text-sm font-semibold',
                        isDark ? 'text-white' : 'text-gray-900'
                      )}>{filter.label}</span>
                    </div>
                    <span className={clsx(
                      'text-xs px-2 py-1 rounded-full',
                      filter.active
                        ? (isDark ? 'bg-blue-700 text-white' : 'bg-blue-200 text-blue-800')
                        : (isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700')
                    )}>{filter.count}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )

      case 'search':
        return (
          <div className={clsx(
            'p-4 rounded-lg border-2 space-y-3',
            isDark ? 'border-purple-500/50 bg-purple-900/20' : 'border-purple-300 bg-purple-50'
          )}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🔎</span>
              <div className="text-sm font-semibold">Поиск курьеров</div>
            </div>
            <div className={clsx(
              'p-3 rounded-lg border',
              isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-white'
            )}>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Поиск по имени, телефону или email..."
                  defaultValue="Иван"
                  className={clsx(
                    'w-full px-4 py-2.5 pl-10 rounded-lg border text-sm',
                    isDark 
                      ? 'bg-gray-700 border-gray-600 text-gray-200' 
                      : 'bg-white border-gray-300 text-gray-900'
                  )}
                  readOnly
                />
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="h-5 w-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
              </div>
              <div className={clsx(
                'mt-3 text-xs space-y-1',
                isDark ? 'text-gray-400' : 'text-gray-600'
              )}>
                <div>✓ Поиск работает в реальном времени</div>
                <div>✓ Ищет по имени, телефону, email</div>
              </div>
            </div>
          </div>
        )

      case 'courier-card':
        return (
          <div className={clsx(
            'p-4 rounded-lg border-2 space-y-3',
            isDark ? 'border-emerald-500/50 bg-emerald-900/20' : 'border-emerald-300 bg-emerald-50'
          )}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">👤</span>
              <div className="text-sm font-semibold">Карточка курьера</div>
            </div>
            <div className={clsx(
              'p-4 rounded-lg border',
              isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-white'
            )}>
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={clsx(
                    'h-12 w-12 rounded-xl flex items-center justify-center',
                    isDark ? 'bg-green-700' : 'bg-green-500'
                  )}>
                    <span className="text-xl">🚗</span>
                  </div>
                  <div>
                    <div className={clsx(
                      'text-base font-bold',
                      isDark ? 'text-white' : 'text-gray-900'
                    )}>Иван Петров</div>
                    <div className={clsx(
                      'text-xs mt-1',
                      isDark ? 'text-gray-400' : 'text-gray-600'
                    )}>📍 Киев</div>
                  </div>
                </div>
                <span className={clsx(
                  'text-xs px-2 py-1 rounded-full',
                  isDark ? 'bg-green-900/50 text-green-300' : 'bg-green-100 text-green-800'
                )}>Активен</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className={clsx(
                  'p-3 rounded-lg text-center',
                  isDark ? 'bg-blue-900/30' : 'bg-blue-50'
                )}>
                  <div className={clsx(
                    'text-xs mb-1',
                    isDark ? 'text-blue-300' : 'text-blue-600'
                  )}>Заказы</div>
                  <div className={clsx(
                    'text-xl font-bold',
                    isDark ? 'text-blue-300' : 'text-blue-700'
                  )}>3</div>
                </div>
                <div className={clsx(
                  'p-3 rounded-lg text-center',
                  isDark ? 'bg-green-900/30' : 'bg-green-50'
                )}>
                  <div className={clsx(
                    'text-xs mb-1',
                    isDark ? 'text-green-300' : 'text-green-600'
                  )}>Пробег</div>
                  <div className={clsx(
                    'text-xl font-bold',
                    isDark ? 'text-green-300' : 'text-green-700'
                  )}>12.5 км</div>
                </div>
              </div>
            </div>
          </div>
        )

      case 'vehicle-type':
        return (
          <div className={clsx(
            'p-4 rounded-lg border-2 space-y-3',
            isDark ? 'border-orange-500/50 bg-orange-900/20' : 'border-orange-300 bg-orange-50'
          )}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🚗</span>
              <div className="text-sm font-semibold">Изменение типа транспорта</div>
            </div>
            <div className={clsx(
              'p-4 rounded-lg border',
              isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-white'
            )}>
              <div className="flex items-center justify-center gap-4 mb-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                  }}
                  className={clsx(
                    'h-16 w-16 rounded-2xl flex items-center justify-center transition-all hover:scale-110',
                    isDark ? 'bg-green-700 hover:bg-green-600' : 'bg-green-500 hover:bg-green-600'
                  )}
                >
                  <span className="text-2xl">🚗</span>
                </button>
                <div className="text-2xl">→</div>
                <div className={clsx(
                  'h-16 w-16 rounded-2xl flex items-center justify-center',
                  isDark ? 'bg-orange-700' : 'bg-orange-500'
                )}>
                  <span className="text-2xl">🏍️</span>
                </div>
              </div>
              <div className={clsx(
                'text-xs text-center space-y-1',
                isDark ? 'text-gray-300' : 'text-gray-700'
              )}>
                <div>Кликните на иконку транспорта</div>
                <div>для переключения между Авто и Мото</div>
              </div>
            </div>
          </div>
        )

      case 'routes':
        return (
          <div className={clsx(
            'p-4 rounded-lg border-2 space-y-3',
            isDark ? 'border-cyan-500/50 bg-cyan-900/20' : 'border-cyan-300 bg-cyan-50'
          )}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🗺️</span>
              <div className="text-sm font-semibold">Детали маршрутов</div>
            </div>
            <div className={clsx(
              'p-4 rounded-lg border',
              isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-white'
            )}>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="text-center">
                  <div className={clsx(
                    'text-lg font-bold mb-1',
                    isDark ? 'text-blue-300' : 'text-blue-600'
                  )}>12.5 км</div>
                  <div className={clsx(
                    'text-xs',
                    isDark ? 'text-gray-400' : 'text-gray-600'
                  )}>Общий пробег</div>
                </div>
                <div className="text-center">
                  <div className={clsx(
                    'text-lg font-bold mb-1',
                    isDark ? 'text-green-300' : 'text-green-600'
                  )}>10.0 км</div>
                  <div className={clsx(
                    'text-xs',
                    isDark ? 'text-gray-400' : 'text-gray-600'
                  )}>Базовое</div>
                </div>
                <div className="text-center">
                  <div className={clsx(
                    'text-lg font-bold mb-1',
                    isDark ? 'text-orange-300' : 'text-orange-600'
                  )}>2.5 км</div>
                  <div className={clsx(
                    'text-xs',
                    isDark ? 'text-gray-400' : 'text-gray-600'
                  )}>Дополнительное</div>
                </div>
              </div>
              <div className="space-y-2">
                {[
                  { id: 1, orders: 3, distance: '8.5 км', time: '35 мин' },
                  { id: 2, orders: 2, distance: '4.0 км', time: '18 мин' }
                ].map((route) => (
                  <div
                    key={route.id}
                    className={clsx(
                      'p-3 rounded-lg border',
                      isDark ? 'border-gray-700 bg-gray-900/50' : 'border-gray-200 bg-gray-50'
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className={clsx(
                        'text-sm font-semibold',
                        isDark ? 'text-white' : 'text-gray-900'
                      )}>Маршрут #{route.id}</div>
                      <div className="flex gap-1">
                        <button className={clsx(
                          'px-2 py-1 rounded text-[10px]',
                          isDark ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white'
                        )}>🗺️</button>
                        <button className={clsx(
                          'px-2 py-1 rounded text-[10px]',
                          isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
                        )}>🔄</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[10px]">
                      <div>
                        <div className={clsx(
                          'opacity-70 mb-0.5',
                          isDark ? 'text-gray-400' : 'text-gray-600'
                        )}>Заказы</div>
                        <div className={clsx(
                          'font-semibold',
                          isDark ? 'text-white' : 'text-gray-900'
                        )}>{route.orders}</div>
                      </div>
                      <div>
                        <div className={clsx(
                          'opacity-70 mb-0.5',
                          isDark ? 'text-gray-400' : 'text-gray-600'
                        )}>Расстояние</div>
                        <div className={clsx(
                          'font-semibold',
                          isDark ? 'text-white' : 'text-gray-900'
                        )}>{route.distance}</div>
                      </div>
                      <div>
                        <div className={clsx(
                          'opacity-70 mb-0.5',
                          isDark ? 'text-gray-400' : 'text-gray-600'
                        )}>Время</div>
                        <div className={clsx(
                          'font-semibold',
                          isDark ? 'text-white' : 'text-gray-900'
                        )}>{route.time}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )

      default:
        // Если нет специального примера, показываем общую информацию
        return (
          <div className={clsx(
            'p-4 rounded-lg border-2',
            isDark ? 'border-gray-500/50 bg-gray-900/20' : 'border-gray-300 bg-gray-50'
          )}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">💡</span>
              <div className="text-sm font-semibold">Демо-режим</div>
            </div>
            <div className={clsx(
              'text-xs leading-relaxed',
              isDark ? 'text-gray-300' : 'text-gray-700'
            )}>
              Этот элемент пока недоступен. Добавьте данные в приложение, чтобы увидеть реальный интерфейс.
            </div>
          </div>
        )
    }
  }

  return (
    <>
      {/* Overlay с затемнением всего экрана */}
      <div
        className="fixed inset-0 z-[9998] bg-black/70 backdrop-blur-sm transition-opacity"
        onClick={handleSkip}
      />

      {/* Highlight для целевого элемента - яркая рамка поверх затемнения */}
      {step.target && Object.keys(overlayStyle).length > 0 && (
        <div
          ref={overlayRef}
          className="fixed z-[10000] pointer-events-none transition-all duration-300"
          style={{
            ...overlayStyle,
            borderRadius: '12px',
            boxShadow: `
              0 0 0 4px rgba(59, 130, 246, 0.8),
              0 0 0 8px rgba(59, 130, 246, 0.4),
              0 0 40px rgba(59, 130, 246, 0.6),
              inset 0 0 30px rgba(59, 130, 246, 0.2)
            `,
            border: '4px solid rgb(59, 130, 246)',
            backgroundColor: 'rgba(59, 130, 246, 0.1)'
          }}
        >
          {/* Анимированная подсветка */}
          <div 
            className="absolute -inset-2 border-2 border-blue-300 rounded-lg opacity-75" 
            style={{ 
              animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            }} 
          />
          <div 
            className="absolute -inset-1 border border-blue-200 rounded-lg" 
            style={{ 
              animation: 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            }} 
          />
        </div>
      )}

      {/* Tooltip с инструкцией */}
      <div
        ref={tooltipRef}
        className={clsx(
          'fixed z-[10000] w-[480px] max-w-[calc(100vw-40px)] rounded-xl shadow-2xl transition-all duration-300 border flex flex-col overflow-hidden',
          isDark 
            ? 'bg-gray-800 border-blue-500/50 shadow-blue-500/30' 
            : 'bg-white border-blue-200 shadow-blue-500/20'
        )}
        style={tooltipStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Заголовок - фиксированный */}
        <div className="p-5 pb-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          {/* Заголовок */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className={clsx(
                'p-2 rounded-lg flex-shrink-0',
                isDark ? 'bg-blue-600/20' : 'bg-blue-100'
              )}>
                <InformationCircleIcon className={clsx(
                  'w-5 h-5',
                  isDark ? 'text-blue-400' : 'text-blue-600'
                )} />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className={clsx(
                  'font-bold text-base leading-tight mb-2',
                  isDark ? 'text-white' : 'text-gray-900'
                )}>
                  {step.title}
                </h3>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={clsx(
                    'text-[10px] px-2 py-0.5 rounded-full whitespace-nowrap',
                    isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
                  )}>
                    {currentStep + 1}/{steps.length}
                  </span>
                  <span className={clsx(
                    'text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap',
                    targetFound
                      ? (isDark ? 'bg-green-900/40 text-green-200 border border-green-700/50' : 'bg-green-50 text-green-700 border border-green-200')
                      : (isDark ? 'bg-purple-900/40 text-purple-100 border border-purple-700/50' : 'bg-purple-50 text-purple-700 border border-purple-200')
                  )}>
                    <span className="text-xs">{targetFound ? '✅' : '🎨'}</span>
                    <span className="hidden sm:inline">{targetFound ? 'Элемент выделен' : 'Демо-режим'}</span>
                  </span>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className={clsx(
                'p-1.5 rounded-lg transition-colors flex-shrink-0',
                isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
              )}
            >
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>

        </div>

        {/* Контент - прокручиваемый */}
        <div 
          className="flex-1 overflow-y-auto min-h-0" 
          style={{ 
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'thin',
            scrollbarColor: isDark ? 'rgba(156, 163, 175, 0.5) rgba(31, 41, 55, 0.5)' : 'rgba(156, 163, 175, 0.5) rgba(243, 244, 246, 0.5)'
          }}
        >
          <div className="p-5 space-y-4 pb-6" style={{ minHeight: 'min-content' }}>
            {/* Изображение (если есть) */}
            {step.image && (
              <div className="mb-4 rounded-lg overflow-hidden border-2 border-gray-200">
                <img
                  src={step.image}
                  alt={step.title}
                  className="w-full h-auto"
                />
              </div>
            )}

            {/* Визуальная демонстрация (если нет изображения) */}
            {!step.image && step.target && targetFound && (
              <div className={clsx(
                'p-3 rounded-lg border',
                isDark ? 'bg-blue-900/20 border-blue-500/30' : 'bg-blue-50/50 border-blue-200'
              )}>
                <div className={clsx(
                  'text-xs font-medium flex items-center gap-2',
                  isDark ? 'text-blue-300' : 'text-blue-700'
                )}>
                  <span>👆</span>
                  <span>Элемент выделен на странице</span>
                </div>
              </div>
            )}

            {/* Реальный пример функции, если элемент не найден */}
            {!targetFound && renderDemoExample()}

            {/* Содержимое */}
            <div className={clsx(
              'text-sm leading-relaxed whitespace-pre-line break-words overflow-wrap-anywhere word-break-break-word',
              isDark ? 'text-gray-100' : 'text-gray-800'
            )} style={{ 
              wordBreak: 'break-word',
              overflowWrap: 'anywhere',
              hyphens: 'auto',
              WebkitHyphens: 'auto'
            }}>
              {step.content}
            </div>

            {/* Быстрые подсказки */}
            <div className={clsx(
              'flex flex-wrap items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-lg border',
              isDark ? 'border-gray-700 bg-gray-800/50 text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-500'
            )}>
              <span className="font-medium">Управление:</span>
              <span className={clsx(
                'px-1.5 py-0.5 rounded',
                isDark ? 'bg-gray-700' : 'bg-gray-200'
              )}>← →</span>
              <span>навигация</span>
              <span className={clsx(
                'px-1.5 py-0.5 rounded',
                isDark ? 'bg-gray-700' : 'bg-gray-200'
              )}>Esc</span>
              <span>закрыть</span>
            </div>

            {/* Прогресс */}
            <div>
              <div className="flex gap-1">
                {steps.map((_, idx) => (
                  <div
                    key={idx}
                    className={clsx(
                      'h-1 flex-1 rounded-full transition-all',
                      idx === currentStep
                        ? isDark ? 'bg-blue-500' : 'bg-blue-600'
                        : isDark ? 'bg-gray-700' : 'bg-gray-200'
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Кнопки навигации - фиксированные внизу */}
        <div className="p-5 pt-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={handleSkip}
              className={clsx(
                'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-800'
              )}
            >
              Пропустить
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={handlePrev}
                disabled={isFirst}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5',
                  isFirst
                    ? isDark ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
                )}
              >
                <ChevronLeftIcon className="w-4 h-4" />
                <span>Назад</span>
              </button>

              <button
                onClick={handleNext}
                className={clsx(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5',
                  isDark ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white'
                )}
              >
                <span>{isLast ? 'Завершить' : 'Далее'}</span>
                {!isLast && <ChevronRightIcon className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

