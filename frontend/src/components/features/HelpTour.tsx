// Интерактивный тур по функциям приложения
import React, { useState, useEffect, useRef } from 'react'
import { clsx } from 'clsx'
import { useTheme } from '../../contexts/ThemeContext'
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
                    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
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
                            <span className="text-lg">📄</span>
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
                                    <span className="text-2xl">📊</span>
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
                                {demoState.fileUploaded ? '✅ Файл загружен' : 'Загрузить файл'}
                            </button>

                            <div className={clsx(
                                'mt-3 text-xs space-y-1',
                                isDark ? 'text-gray-400' : 'text-gray-600'
                            )}>
                                <div>• Формат: .xlsx, .xls</div>
                                <div>• Колонки: Адрес, Время, Сумма</div>
                                <div>• После загрузки появится список заказов</div>
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
                            <span className="text-lg">ℹ️</span>
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
                    isDark ? 'bg-gray-800 border-blue-500/50 shadow-blue-500/30' : 'bg-white border-blue-200 shadow-blue-500/20'
                )}
                style={tooltipStyle}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Заголовок - фиксированный */}
                <div className="p-5 pb-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
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
                                        Шаг {currentStep + 1} из {steps.length}
                                    </span>
                                    <span className={clsx(
                                        'text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1 whitespace-nowrap',
                                        targetFound
                                            ? (isDark ? 'bg-green-900/40 text-green-200 border border-green-700/50' : 'bg-green-50 text-green-700 border border-green-200')
                                            : (isDark ? 'bg-purple-900/40 text-purple-100 border border-purple-700/50' : 'bg-purple-50 text-purple-700 border border-purple-200')
                                    )}>
                                        <span className="text-xs">{targetFound ? '🎯' : '💡'}</span>
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
                                <img src={step.image} alt={step.title} className="w-full h-auto" />
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
                        )} style={{ wordBreak: 'break-word', overflowWrap: 'anywhere', hyphens: 'auto', WebkitHyphens: 'auto' }}>
                            {step.content}
                        </div>

                        {/* Быстрые подсказки */}
                        <div className={clsx(
                            'flex flex-wrap items-center gap-1.5 text-[10px] px-2.5 py-1.5 rounded-lg border',
                            isDark ? 'border-gray-700 bg-gray-800/50 text-gray-400' : 'border-gray-200 bg-gray-50 text-gray-500'
                        )}>
                            <span className="font-medium">Управление:</span>
                            <span className={clsx('px-1.5 py-0.5 rounded', isDark ? 'bg-gray-700' : 'bg-gray-200')}>← →</span> <span>навигация</span>
                            <span className={clsx('px-1.5 py-0.5 rounded', isDark ? 'bg-gray-700' : 'bg-gray-200')}>Esc</span> <span>закрыть</span>
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
                                                ? (isDark ? 'bg-blue-500' : 'bg-blue-600')
                                                : (isDark ? 'bg-gray-700' : 'bg-gray-200')
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
                                        ? (isDark ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-gray-100 text-gray-400 cursor-not-allowed')
                                        : (isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-200 hover:bg-gray-300 text-gray-800')
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