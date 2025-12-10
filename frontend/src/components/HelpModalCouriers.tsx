// Модальное окно с инструкциями для страницы Курьеры

import React, { useState } from 'react'
import { clsx } from 'clsx'
import { useTheme } from '../contexts/ThemeContext'
import {
  XMarkIcon,
  QuestionMarkCircleIcon,
  BookOpenIcon,
  AcademicCapIcon,
  UserIcon,
  TruckIcon,
  PlusIcon,
  PencilIcon,
  MapPinIcon,
  ClockIcon
} from '@heroicons/react/24/outline'

interface HelpSection {
  id: string
  title: string
  icon: React.ReactNode
  content: React.ReactNode
}

interface HelpModalCouriersProps {
  isOpen: boolean
  onClose: () => void
  onStartTour?: () => void
}

export const HelpModalCouriers: React.FC<HelpModalCouriersProps> = ({
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
            Страница управления курьерами позволяет просматривать информацию о курьерах, их заказах, 
            пробегах и маршрутах. Вы можете управлять типами транспорта курьеров и просматривать детальную статистику.
          </p>
          <div className={clsx('p-4 rounded-lg', isDark ? 'bg-blue-900/20 border border-blue-800' : 'bg-blue-50 border border-blue-200')}>
            <h4 className={clsx('font-semibold mb-2', isDark ? 'text-blue-300' : 'text-blue-800')}>
              🚀 Основные функции
            </h4>
            <ul className={clsx('space-y-1 text-sm', isDark ? 'text-blue-200' : 'text-blue-700')}>
              <li>• Просмотр списка всех курьеров</li>
              <li>• Фильтрация по типу транспорта</li>
              <li>• Поиск курьеров</li>
              <li>• Просмотр маршрутов курьера</li>
              <li>• Управление типом транспорта</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'filters',
      title: 'Фильтрация и поиск',
      icon: <TruckIcon className="w-6 h-6" />,
      content: (
        <div className="space-y-4">
          <p className={clsx('text-sm leading-relaxed', isDark ? 'text-gray-300' : 'text-gray-700')}>
            Используйте фильтры для просмотра курьеров по типу транспорта и поиск для быстрого нахождения нужного курьера.
          </p>
          <div className={clsx('p-4 rounded-lg', isDark ? 'bg-green-900/20 border border-green-800' : 'bg-green-50 border border-green-200')}>
            <h4 className={clsx('font-semibold mb-2', isDark ? 'text-green-300' : 'text-green-800')}>
              🔍 Фильтры:
            </h4>
            <ul className={clsx('space-y-1 text-sm', isDark ? 'text-green-200' : 'text-green-700')}>
              <li>• <strong>Все курьеры</strong> - показать всех курьеров</li>
              <li>• <strong>Авто курьеры</strong> - только курьеры на автомобилях</li>
              <li>• <strong>Мото курьеры</strong> - только курьеры на мотоциклах</li>
            </ul>
          </div>
          <div className={clsx('p-4 rounded-lg', isDark ? 'bg-gray-800/50' : 'bg-gray-50')}>
            <h4 className={clsx('font-semibold mb-2', isDark ? 'text-white' : 'text-gray-900')}>
              🔎 Поиск:
            </h4>
            <p className={clsx('text-sm', isDark ? 'text-gray-300' : 'text-gray-700')}>
              Поиск работает по имени курьера, телефону или email. Просто введите текст в поле поиска.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'courier-info',
      title: 'Информация о курьере',
      icon: <UserIcon className="w-6 h-6" />,
      content: (
        <div className="space-y-4">
          <p className={clsx('text-sm leading-relaxed', isDark ? 'text-gray-300' : 'text-gray-700')}>
            Для каждого курьера отображается детальная информация о его работе и маршрутах.
          </p>
          <div className={clsx('p-4 rounded-lg', isDark ? 'bg-purple-900/20 border border-purple-800' : 'bg-purple-50 border border-purple-200')}>
            <h4 className={clsx('font-semibold mb-2', isDark ? 'text-purple-300' : 'text-purple-800')}>
              📊 Отображаемая информация:
            </h4>
            <ul className={clsx('space-y-1 text-sm', isDark ? 'text-purple-200' : 'text-purple-700')}>
              <li>• Имя курьера</li>
              <li>• Тип транспорта (автомобиль/мотоцикл)</li>
              <li>• Количество заказов в маршрутах</li>
              <li>• Общий пробег (километры)</li>
              <li>• Статус активности</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'vehicle-type',
      title: 'Управление типом транспорта',
      icon: <TruckIcon className="w-6 h-6" />,
      content: (
        <div className="space-y-4">
          <p className={clsx('text-sm leading-relaxed', isDark ? 'text-gray-300' : 'text-gray-700')}>
            Вы можете изменить тип транспорта курьера, кликнув на иконку транспорта. Это влияет на расчет 
            пробега и распределение маршрутов.
          </p>
          <div className={clsx('p-4 rounded-lg', isDark ? 'bg-amber-900/20 border border-amber-800' : 'bg-amber-50 border border-amber-200')}>
            <h4 className={clsx('font-semibold mb-2', isDark ? 'text-amber-300' : 'text-amber-800')}>
              🚗 Типы транспорта:
            </h4>
            <ul className={clsx('space-y-1 text-sm', isDark ? 'text-amber-200' : 'text-amber-700')}>
              <li>• <strong>Автомобиль</strong> - для курьеров на машинах</li>
              <li>• <strong>Мотоцикл</strong> - для курьеров на мотоциклах</li>
            </ul>
            <p className={clsx('text-sm mt-2', isDark ? 'text-amber-200' : 'text-amber-700')}>
              Изменение типа транспорта автоматически пересчитывает пробег курьера.
            </p>
          </div>
        </div>
      )
    },
    {
      id: 'routes',
      title: 'Маршруты курьера',
      icon: <MapPinIcon className="w-6 h-6" />,
      content: (
        <div className="space-y-4">
          <p className={clsx('text-sm leading-relaxed', isDark ? 'text-gray-300' : 'text-gray-700')}>
            Для каждого курьера отображаются все его маршруты с детальной информацией о заказах, расстоянии и времени.
          </p>
          <div className={clsx('p-4 rounded-lg', isDark ? 'bg-blue-900/20 border border-blue-800' : 'bg-blue-50 border border-blue-200')}>
            <h4 className={clsx('font-semibold mb-2', isDark ? 'text-blue-300' : 'text-blue-800')}>
              🗺️ Действия с маршрутами:
            </h4>
            <ul className={clsx('space-y-1 text-sm', isDark ? 'text-blue-200' : 'text-blue-700')}>
              <li>• <strong>Открыть в Google Maps</strong> - просмотр маршрута в Google Maps</li>
              <li>• <strong>Пересчитать</strong> - оптимизация маршрута</li>
              <li>• <strong>Редактировать адрес</strong> - изменение адреса заказа</li>
              <li>• <strong>Удалить</strong> - удаление маршрута</li>
            </ul>
          </div>
        </div>
      )
    },
    {
      id: 'distance',
      title: 'Пробег курьера',
      icon: <ClockIcon className="w-6 h-6" />,
      content: (
        <div className="space-y-4">
          <p className={clsx('text-sm leading-relaxed', isDark ? 'text-gray-300' : 'text-gray-700')}>
            Кликните на пробег курьера, чтобы увидеть детальную информацию о том, как рассчитывается пробег.
          </p>
          <div className={clsx('p-4 rounded-lg', isDark ? 'bg-teal-900/20 border border-teal-800' : 'bg-teal-50 border border-teal-200')}>
            <h4 className={clsx('font-semibold mb-2', isDark ? 'text-teal-300' : 'text-teal-800')}>
              📏 Расчет пробега:
            </h4>
            <ul className={clsx('space-y-1 text-sm', isDark ? 'text-teal-200' : 'text-teal-700')}>
              <li>• Базовое расстояние маршрута (из Google Maps)</li>
              <li>• Дополнительные 500м за каждый заказ</li>
              <li>• Для оптимизированных маршрутов используется точное расстояние</li>
              <li>• Для неоптимизированных - базовое расстояние 1км + 500м за заказ</li>
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
                Справка: Управление курьерами
              </h2>
              <p className={clsx(
                'text-sm mt-1',
                isDark ? 'text-gray-400' : 'text-gray-500'
              )}>
                Узнайте, как управлять курьерами и их маршрутами
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

