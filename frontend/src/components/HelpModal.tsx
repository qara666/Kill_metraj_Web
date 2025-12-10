// Модальное окно с инструкциями и справочной информацией

import React, { useState } from 'react'
import { clsx } from 'clsx'
import { useTheme } from '../contexts/ThemeContext'
import {
  XMarkIcon,
  DocumentArrowUpIcon,
  Cog6ToothIcon,
  PlayIcon,
  ChartBarIcon,
  MapPinIcon,
  TruckIcon,
  QuestionMarkCircleIcon,
  BookOpenIcon,
  AcademicCapIcon
} from '@heroicons/react/24/outline'

interface HelpSection {
  id: string
  title: string
  icon: React.ReactNode
  content: React.ReactNode
}

interface HelpModalProps {
  isOpen: boolean
  onClose: () => void
  onStartTour?: () => void
}

export const HelpModal: React.FC<HelpModalProps> = ({
  isOpen,
  onClose,
  onStartTour
}) => {
  const { isDark } = useTheme()
  const [activeSection, setActiveSection] = useState<string>('overview')

  if (!isOpen) return null

  const sections: HelpSection[] = [
    {
      id: 'overview',
      title: 'Обзор',
      icon: <BookOpenIcon className="w-6 h-6" />,
      content: (
        <div className="space-y-4">
          <p className={clsx('text-sm leading-relaxed', isDark ? 'text-gray-300' : 'text-gray-700')}>
            Добро пожаловать в систему автоматического планирования маршрутов! Это приложение поможет вам 
            оптимизировать доставку заказов, создавая эффективные маршруты с учетом трафика, времени готовности 
            и географического расположения.
          </p>
          <div className={clsx('p-4 rounded-lg', isDark ? 'bg-blue-900/20 border border-blue-800' : 'bg-blue-50 border border-blue-200')}>
            <h4 className={clsx('font-semibold mb-2', isDark ? 'text-blue-300' : 'text-blue-800')}>
              🚀 Быстрый старт
            </h4>
            <ol className={clsx('list-decimal list-inside space-y-1 text-sm', isDark ? 'text-blue-200' : 'text-blue-700')}>
              <li>Загрузите Excel файл с заказами</li>
              <li>Настройте параметры планирования</li>
              <li>Нажмите "Планировать маршруты"</li>
              <li>Просмотрите результаты и экспортируйте</li>
            </ol>
          </div>
        </div>
      )
    },
    {
      id: 'upload',
      title: 'Загрузка файла',
      icon: <DocumentArrowUpIcon className="w-6 h-6" />,
      content: (
        <div className="space-y-4">
          <p className={clsx('text-sm leading-relaxed', isDark ? 'text-gray-300' : 'text-gray-700')}>
            Для начала работы необходимо загрузить Excel файл с данными о заказах.
          </p>
          
          <div className={clsx('p-4 rounded-lg', isDark ? 'bg-gray-800/50' : 'bg-gray-50')}>
            <h4 className={clsx('font-semibold mb-2', isDark ? 'text-white' : 'text-gray-900')}>
              📋 Требуемые колонки в Excel:
            </h4>
            <ul className={clsx('space-y-1 text-sm', isDark ? 'text-gray-300' : 'text-gray-700')}>
              <li>• <strong>Адрес доставки</strong> - обязательное поле</li>
              <li>• <strong>Плановое время</strong> - время доставки заказа</li>
              <li>• <strong>Время на кухню</strong> - время готовности заказа</li>
              <li>• <strong>Номер заказа</strong> - уникальный идентификатор</li>
              <li>• <strong>Зона доставки</strong> - для группировки заказов</li>
            </ul>
          </div>

          <div className={clsx('p-4 rounded-lg', isDark ? 'bg-green-900/20 border border-green-800' : 'bg-green-50 border border-green-200')}>
            <h4 className={clsx('font-semibold mb-2', isDark ? 'text-green-300' : 'text-green-800')}>
              ✅ Как загрузить:
            </h4>
            <ol className={clsx('list-decimal list-inside space-y-1 text-sm', isDark ? 'text-green-200' : 'text-green-700')}>
              <li>Нажмите кнопку "Загрузить Excel файл"</li>
              <li>Выберите файл на вашем компьютере</li>
              <li>Дождитесь обработки данных</li>
              <li>Проверьте количество загруженных заказов</li>
            </ol>
          </div>
        </div>
      )
    },
    {
      id: 'settings',
      title: 'Настройки планирования',
      icon: <Cog6ToothIcon className="w-6 h-6" />,
      content: (
        <div className="space-y-4">
          <p className={clsx('text-sm leading-relaxed', isDark ? 'text-gray-300' : 'text-gray-700')}>
            Настройки позволяют контролировать процесс планирования маршрутов.
          </p>

          <div className="space-y-3">
            <div className={clsx('p-4 rounded-lg', isDark ? 'bg-gray-800/50' : 'bg-gray-50')}>
              <h4 className={clsx('font-semibold mb-2', isDark ? 'text-white' : 'text-gray-900')}>
                🎯 Максимальное количество остановок
              </h4>
              <p className={clsx('text-sm', isDark ? 'text-gray-300' : 'text-gray-700')}>
                Определяет максимальное количество заказов в одном маршруте.
              </p>
            </div>

            <div className={clsx('p-4 rounded-lg', isDark ? 'bg-gray-800/50' : 'bg-gray-50')}>
              <h4 className={clsx('font-semibold mb-2', isDark ? 'text-white' : 'text-gray-900')}>
                📍 Максимальное расстояние между заказами
              </h4>
              <p className={clsx('text-sm', isDark ? 'text-gray-300' : 'text-gray-700')}>
                Ограничивает максимальное расстояние между соседними заказами в маршруте. 
                Помогает избежать нереалистичных маршрутов с большими переездами.
              </p>
            </div>

            <div className={clsx('p-4 rounded-lg', isDark ? 'bg-gray-800/50' : 'bg-gray-50')}>
              <h4 className={clsx('font-semibold mb-2', isDark ? 'text-white' : 'text-gray-900')}>
                ⏰ Максимальная разница времени готовности
              </h4>
              <p className={clsx('text-sm', isDark ? 'text-gray-300' : 'text-gray-700')}>
                Определяет, насколько может отличаться время готовности заказов в одном маршруте. 
                Меньшее значение создает более сфокусированные маршруты по времени.
              </p>
            </div>

            <div className={clsx('p-4 rounded-lg', isDark ? 'bg-gray-800/50' : 'bg-gray-50')}>
              <h4 className={clsx('font-semibold mb-2', isDark ? 'text-white' : 'text-gray-900')}>
                🚦 Режим трафика
              </h4>
              <p className={clsx('text-sm', isDark ? 'text-gray-300' : 'text-gray-700')}>
                <strong>Авто</strong> - система автоматически определяет режим трафика<br/>
                <strong>Свободно</strong> - минимальные задержки, быстрые маршруты<br/>
                <strong>Плотно</strong> - средние задержки, учитываются пробки<br/>
                <strong>Стоим</strong> - максимальные задержки, большие буферы времени
              </p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'planning',
      title: 'Планирование маршрутов',
      icon: <PlayIcon className="w-6 h-6" />,
      content: (
        <div className="space-y-4">
          <p className={clsx('text-sm leading-relaxed', isDark ? 'text-gray-300' : 'text-gray-700')}>
            После настройки параметров нажмите кнопку "Планировать маршруты" для автоматического создания 
            оптимальных маршрутов доставки.
          </p>

          <div className={clsx('p-4 rounded-lg', isDark ? 'bg-blue-900/20 border border-blue-800' : 'bg-blue-50 border border-blue-200')}>
            <h4 className={clsx('font-semibold mb-2', isDark ? 'text-blue-300' : 'text-blue-800')}>
              🔄 Процесс планирования:
            </h4>
            <ol className={clsx('list-decimal list-inside space-y-2 text-sm', isDark ? 'text-blue-200' : 'text-blue-700')}>
              <li><strong>Анализ данных</strong> - система анализирует загруженные заказы</li>
              <li><strong>Геокодирование</strong> - преобразование адресов в координаты</li>
              <li><strong>Группировка</strong> - объединение заказов по зонам и времени</li>
              <li><strong>Оптимизация</strong> - создание оптимальных маршрутов</li>
              <li><strong>Проверка</strong> - валидация маршрутов через Google Maps API</li>
            </ol>
          </div>

          <div className={clsx('p-4 rounded-lg', isDark ? 'bg-amber-900/20 border border-amber-800' : 'bg-amber-50 border border-amber-200')}>
            <h4 className={clsx('font-semibold mb-2', isDark ? 'text-amber-300' : 'text-amber-800')}>
              ⚠️ Важно:
            </h4>
            <ul className={clsx('space-y-1 text-sm', isDark ? 'text-amber-200' : 'text-amber-700')}>
              <li>• Планирование может занять несколько минут при большом количестве заказов</li>
              <li>• Результаты сохраняются автоматически в браузере</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'routes',
      title: 'Просмотр маршрутов',
      icon: <MapPinIcon className="w-6 h-6" />,
      content: (
        <div className="space-y-4">
          <p className={clsx('text-sm leading-relaxed', isDark ? 'text-gray-300' : 'text-gray-700')}>
            После планирования вы увидите список созданных маршрутов с детальной информацией о каждом.
          </p>

          <div className="space-y-3">
            <div className={clsx('p-4 rounded-lg', isDark ? 'bg-gray-800/50' : 'bg-gray-50')}>
              <h4 className={clsx('font-semibold mb-2', isDark ? 'text-white' : 'text-gray-900')}>
                📊 Информация о маршруте:
              </h4>
              <ul className={clsx('space-y-1 text-sm', isDark ? 'text-gray-300' : 'text-gray-700')}>
                <li>• Количество остановок</li>
                <li>• Общее расстояние и время</li>
                <li>• Список адресов в порядке доставки</li>
                <li>• Визуализация на карте</li>
              </ul>
            </div>

            <div className={clsx('p-4 rounded-lg', isDark ? 'bg-gray-800/50' : 'bg-gray-50')}>
              <h4 className={clsx('font-semibold mb-2', isDark ? 'text-white' : 'text-gray-900')}>
                🗺️ Визуализация:
              </h4>
              <p className={clsx('text-sm', isDark ? 'text-gray-300' : 'text-gray-700')}>
                Нажмите на маршрут, чтобы увидеть его на карте. Вы можете развернуть маршрут в полноэкранном 
                режиме для детального просмотра с визуализацией и подробной информацией о формировании маршрута.
              </p>
            </div>

            <div className={clsx('p-4 rounded-lg', isDark ? 'bg-gray-800/50' : 'bg-gray-50')}>
              <h4 className={clsx('font-semibold mb-2', isDark ? 'text-white' : 'text-gray-900')}>
                📤 Экспорт маршрутов:
              </h4>
              <p className={clsx('text-sm', isDark ? 'text-gray-300' : 'text-gray-700')}>
                Вы можете экспортировать маршруты в различных форматах:
              </p>
              <ul className={clsx('space-y-1 text-sm mt-2', isDark ? 'text-gray-300' : 'text-gray-700')}>
                <li>• <strong>Google Maps</strong> - открыть маршрут в Google Maps</li>
                <li>• <strong>Waze</strong> - открыть маршрут в приложении Waze</li>
                <li>• <strong>PDF</strong> - скачать маршрут в формате PDF</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'analytics',
      title: 'Аналитика и улучшения',
      icon: <ChartBarIcon className="w-6 h-6" />,
      content: (
        <div className="space-y-4">
          <p className={clsx('text-sm leading-relaxed', isDark ? 'text-gray-300' : 'text-gray-700')}>
            Система предоставляет детальную аналитику по эффективности маршрутов и возможность их улучшения.
          </p>

          <div className="space-y-3">
            <div className={clsx('p-4 rounded-lg', isDark ? 'bg-purple-900/20 border border-purple-800' : 'bg-purple-50 border border-purple-200')}>
              <h4 className={clsx('font-semibold mb-2', isDark ? 'text-purple-300' : 'text-purple-800')}>
                📊 Аналитика маршрутов:
              </h4>
              <ul className={clsx('space-y-1 text-sm', isDark ? 'text-purple-200' : 'text-purple-700')}>
                <li>• Общая статистика по всем маршрутам</li>
                <li>• Метрики эффективности</li>
                <li>• Анализ распределения нагрузки</li>
                <li>• Сравнение с предыдущими версиями</li>
              </ul>
            </div>

            <div className={clsx('p-4 rounded-lg', isDark ? 'bg-indigo-900/20 border border-indigo-800' : 'bg-indigo-50 border border-indigo-200')}>
              <h4 className={clsx('font-semibold mb-2', isDark ? 'text-indigo-300' : 'text-indigo-800')}>
                📜 История оптимизаций:
              </h4>
              <p className={clsx('text-sm', isDark ? 'text-indigo-200' : 'text-indigo-700')}>
                Все версии маршрутов сохраняются в истории. Вы можете вернуться к любой предыдущей версии 
                или сравнить разные варианты планирования.
              </p>
            </div>
          </div>
        </div>
      )
    },
    {
      id: 'heatmaps',
      title: 'Тепловые карты',
      icon: <TruckIcon className="w-6 h-6" />,
      content: (
        <div className="space-y-4">
          <p className={clsx('text-sm leading-relaxed', isDark ? 'text-gray-300' : 'text-gray-700')}>
            Система предоставляет визуализацию трафика и загруженности для лучшего понимания ситуации.
          </p>

          <div className="space-y-3">
            <div className={clsx('p-4 rounded-lg', isDark ? 'bg-green-900/20 border border-green-800' : 'bg-green-50 border border-green-200')}>
              <h4 className={clsx('font-semibold mb-2', isDark ? 'text-green-300' : 'text-green-800')}>
                🚦 Тепловая карта трафика:
              </h4>
              <p className={clsx('text-sm', isDark ? 'text-green-200' : 'text-green-700')}>
                Показывает текущую ситуацию с трафиком в вашем секторе доставки. Данные обновляются в реальном 
                времени через Mapbox Traffic API. Цвета показывают уровень загруженности дорог.
              </p>
            </div>

            <div className={clsx('p-4 rounded-lg', isDark ? 'bg-blue-900/20 border border-blue-800' : 'bg-blue-50 border border-blue-200')}>
              <h4 className={clsx('font-semibold mb-2', isDark ? 'text-blue-300' : 'text-blue-800')}>
                📊 Тепловая карта загруженности:
              </h4>
              <p className={clsx('text-sm', isDark ? 'text-blue-200' : 'text-blue-700')}>
                Визуализирует распределение заказов по территории. Помогает понять, где сосредоточена основная 
                нагрузка и где могут быть пробелы в покрытии.
              </p>
            </div>
          </div>
        </div>
      )
    }
  ]

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={clsx(
        'relative w-full max-w-4xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col border',
        isDark 
          ? 'bg-gray-800 border-gray-700' 
          : 'bg-white border-gray-200'
      )}>
        {/* Header */}
        <div className={clsx(
          'flex items-center justify-between p-6 border-b',
          isDark 
            ? 'border-gray-700 bg-gray-800' 
            : 'border-gray-200 bg-white'
        )}>
          <div className="flex items-center gap-3">
            <div className={clsx(
              'p-2 rounded-lg',
              isDark ? 'bg-blue-600/20' : 'bg-blue-100'
            )}>
              <QuestionMarkCircleIcon className={clsx(
                'w-6 h-6',
                isDark ? 'text-blue-400' : 'text-blue-600'
              )} />
            </div>
            <div>
              <h2 className={clsx(
                'text-2xl font-bold',
                isDark ? 'text-white' : 'text-gray-900'
              )}>
                Справка и инструкции
              </h2>
              <p className={clsx(
                'text-sm mt-1',
                isDark ? 'text-gray-400' : 'text-gray-500'
              )}>
                Узнайте, как использовать все функции системы
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={clsx(
              'p-2 rounded-lg transition-colors',
              isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
            )}
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex">
          {/* Sidebar */}
          <div className={clsx(
            'w-64 border-r overflow-y-auto',
            isDark 
              ? 'border-gray-700 bg-gray-900/50' 
              : 'border-gray-200 bg-gray-50'
          )}>
            <div className="p-4 space-y-2">
              {sections.map(section => (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={clsx(
                    'w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 text-left group relative overflow-hidden',
                    activeSection === section.id
                      ? 'bg-gradient-to-r from-blue-600 via-blue-500 to-pink-500 text-white shadow-lg shadow-blue-500/30 scale-[1.02]'
                      : isDark
                        ? 'text-gray-300 hover:bg-gray-800/50 hover:text-white hover:shadow-md'
                        : 'text-gray-700 hover:bg-gray-100/80 hover:text-gray-900 hover:shadow-sm'
                  )}
                >
                  {/* Активный индикатор */}
                  {activeSection === section.id && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-white/50 rounded-r-full" />
                  )}
                  <div className={clsx(
                    'transition-transform duration-200',
                    activeSection === section.id 
                      ? 'text-white scale-110' 
                      : isDark 
                        ? 'text-gray-400 group-hover:text-white group-hover:scale-105' 
                        : 'text-gray-500 group-hover:text-gray-700 group-hover:scale-105'
                  )}>
                    {section.icon}
                  </div>
                  <span className={clsx(
                    'font-medium transition-colors',
                    activeSection === section.id ? 'text-white' : ''
                  )}>
                    {section.title}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 overflow-y-auto p-6">
            {sections.find(s => s.id === activeSection)?.content}
          </div>
        </div>

        {/* Footer */}
        <div className={clsx(
          'flex items-center justify-between p-6 border-t',
          isDark ? 'border-gray-700' : 'border-gray-200'
        )}>
          <button
            onClick={onStartTour}
            className={clsx(
              'px-6 py-3 rounded-xl font-medium transition-all duration-200 flex items-center gap-2 shadow-lg hover:scale-105',
              'bg-gradient-to-r from-blue-600 via-blue-500 to-pink-500 hover:from-blue-700 hover:via-blue-600 hover:to-pink-600 text-white'
            )}
          >
            <AcademicCapIcon className="w-5 h-5" />
            Начать интерактивный тур
          </button>
          <button
            onClick={onClose}
            className={clsx(
              'px-6 py-3 rounded-xl font-medium transition-all duration-200 hover:scale-105',
              isDark 
                ? 'bg-gray-700/80 hover:bg-gray-600/80 text-white border border-gray-600/50' 
                : 'bg-gray-200/80 hover:bg-gray-300/80 text-gray-800 border border-gray-300/50'
            )}
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  )
}

