// Модальное окно с инструкциями для страницы Маршруты

import React, { useState } from 'react'
import { clsx } from 'clsx'
import { useTheme } from '../../contexts/ThemeContext'
import {
  XMarkIcon,
  QuestionMarkCircleIcon,
  BookOpenIcon,
  AcademicCapIcon,
  TruckIcon,
  MapPinIcon,
  PlusIcon,
  ArrowPathIcon,
  MapIcon
} from '@heroicons/react/24/outline'

interface HelpSection {
  id: string
  title: string
  icon: React.ReactNode
  content: React.ReactNode
}

interface HelpModalRoutesProps {
  isOpen: boolean
  onClose: () => void
  onStartTour?: () => void
}

export const HelpModalRoutes: React.FC<HelpModalRoutesProps> = ({
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
            Страница управления маршрутами позволяет создавать и управлять маршрутами для курьеров. 
            Вы можете выбирать заказы, создавать маршруты, оптимизировать их и рассчитывать расстояния.
          </p>
          <div className={clsx('p-4 rounded-lg', isDark ? 'bg-blue-900/20 border border-blue-800' : 'bg-blue-50 border border-blue-200')}>
            <h4 className={clsx('font-semibold mb-2', isDark ? 'text-blue-300' : 'text-blue-800')}>
               Быстрый старт
            </h4>
            <ol className={clsx('list-decimal list-inside space-y-1 text-sm', isDark ? 'text-blue-200' : 'text-blue-700')}>
              <li>Выберите курьера из списка</li>
              <li>Выберите заказы для маршрута</li>
              <li>Нажмите "Создать маршрут"</li>
            </ol>
          </div>
        </div>
      )
    },
    {
      id: 'select-courier',
      title: 'Выбор курьера',
      icon: <TruckIcon className="w-6 h-6" />,
      content: (
        <div className="space-y-4">
          <p className={clsx('text-sm leading-relaxed', isDark ? 'text-gray-300' : 'text-gray-700')}>
            Начните с выбора курьера из списка. После выбора вы увидите доступные заказы для этого курьера.
          </p>
          <div className={clsx('p-4 rounded-lg', isDark ? 'bg-gray-800/50' : 'bg-gray-50')}>
            <h4 className={clsx('font-semibold mb-2', isDark ? 'text-white' : 'text-gray-900')}>
               Фильтрация курьеров:
            </h4>
            <ul className={clsx('space-y-1 text-sm', isDark ? 'text-gray-300' : 'text-gray-700')}>
              <li>• Все курьеры</li>
              <li>• Только автомобили</li>
              <li>• Только мотоциклы</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'select-orders',
      title: 'Выбор заказов',
      icon: <MapPinIcon className="w-6 h-6" />,
      content: (
        <div className="space-y-4">
          <p className={clsx('text-sm leading-relaxed', isDark ? 'text-gray-300' : 'text-gray-700')}>
            Кликните на заказы, чтобы добавить их в маршрут. Порядок выбора определяет порядок доставки.
          </p>
          <div className={clsx('p-4 rounded-lg', isDark ? 'bg-green-900/20 border border-green-800' : 'bg-green-50 border border-green-200')}>
            <h4 className={clsx('font-semibold mb-2', isDark ? 'text-green-300' : 'text-green-800')}>
               Изменение порядка:
            </h4>
            <ul className={clsx('space-y-1 text-sm', isDark ? 'text-green-200' : 'text-green-700')}>
              <li>• Используйте кнопки ↑ и ↓ для изменения порядка заказов</li>
              <li>• Порядок определяет последовательность доставки</li>
              <li>• Заказы, уже находящиеся в других маршрутах, нельзя выбрать</li>
            </ul>
          </div>
          <div className={clsx('p-4 rounded-lg', isDark ? 'bg-gray-800/50' : 'bg-gray-50')}>
            <h4 className={clsx('font-semibold mb-2', isDark ? 'text-white' : 'text-gray-900')}>
               Поиск заказов:
            </h4>
            <p className={clsx('text-sm', isDark ? 'text-gray-300' : 'text-gray-700')}>
              Используйте поле поиска для быстрого нахождения нужных заказов по номеру, адресу или имени клиента.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'create-route',
      title: 'Создание маршрута',
      icon: <PlusIcon className="w-6 h-6" />,
      content: (
        <div className="space-y-4">
          <p className={clsx('text-sm leading-relaxed', isDark ? 'text-gray-300' : 'text-gray-700')}>
            После выбора заказов нажмите кнопку "Создать маршрут". Система автоматически рассчитает 
            оптимальный путь и расстояние между точками.
          </p>
          <div className={clsx('p-4 rounded-lg', isDark ? 'bg-blue-900/20 border border-blue-800' : 'bg-blue-50 border border-blue-200')}>
            <h4 className={clsx('font-semibold mb-2', isDark ? 'text-blue-300' : 'text-blue-800')}>
              ️ Настройки маршрута:
            </h4>
            <ul className={clsx('space-y-1 text-sm', isDark ? 'text-blue-200' : 'text-blue-700')}>
              <li>• Адрес начала маршрута (по умолчанию из настроек)</li>
              <li>• Адрес окончания маршрута (по умолчанию из настроек)</li>
              <li>• Система автоматически проверяет адреса на корректность</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'optimize',
      title: 'Оптимизация маршрута',
      icon: <ArrowPathIcon className="w-6 h-6" />,
      content: (
        <div className="space-y-4">
          <p className={clsx('text-sm leading-relaxed', isDark ? 'text-gray-300' : 'text-gray-700')}>
            Используйте кнопку "Пересчитать" для оптимизации маршрута. Система пересчитает расстояние 
            и время с учетом реальных дорог через Google Maps API.
          </p>
          <div className={clsx('p-4 rounded-lg', isDark ? 'bg-purple-900/20 border border-purple-800' : 'bg-purple-50 border border-purple-200')}>
            <h4 className={clsx('font-semibold mb-2', isDark ? 'text-purple-300' : 'text-purple-800')}>
               Что пересчитывается:
            </h4>
            <ul className={clsx('space-y-1 text-sm', isDark ? 'text-purple-200' : 'text-purple-700')}>
              <li>• Общее расстояние маршрута</li>
              <li>• Время в пути с учетом трафика</li>
              <li>• Оптимальный порядок доставки</li>
              <li>• Проверка адресов на корректность</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'manage-routes',
      title: 'Управление маршрутами',
      icon: <MapIcon className="w-6 h-6" />,
      content: (
        <div className="space-y-4">
          <p className={clsx('text-sm leading-relaxed', isDark ? 'text-gray-300' : 'text-gray-700')}>
            В списке маршрутов вы можете просматривать все созданные маршруты и управлять ими.
          </p>
          <div className={clsx('p-4 rounded-lg', isDark ? 'bg-amber-900/20 border border-amber-800' : 'bg-amber-50 border border-amber-200')}>
            <h4 className={clsx('font-semibold mb-2', isDark ? 'text-amber-300' : 'text-amber-800')}>
              ️ Действия с маршрутами:
            </h4>
            <ul className={clsx('space-y-1 text-sm', isDark ? 'text-amber-200' : 'text-amber-700')}>
              <li>• <strong>Открыть в Google Maps</strong> - просмотр маршрута в Google Maps</li>
              <li>• <strong>Пересчитать</strong> - оптимизация маршрута</li>
              <li>• <strong>Редактировать адрес</strong> - изменение адреса заказа</li>
              <li>• <strong>Удалить</strong> - удаление маршрута</li>
            </ul>
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
                Справка: Управление маршрутами
              </h2>
              <p className={clsx(
                'text-sm mt-1',
                isDark ? 'text-gray-400' : 'text-gray-500'
              )}>
                Узнайте, как создавать и управлять маршрутами
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

