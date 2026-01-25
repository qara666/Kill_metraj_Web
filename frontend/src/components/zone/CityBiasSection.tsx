import React, { useState } from 'react'
import { clsx } from 'clsx'
import { MapIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline'

type CityName = '' | 'Киев' | 'Харьков' | 'Полтава' | 'Одесса'

interface CityBiasSectionProps {
    isDark: boolean
    value: CityName
    onChange: (v: CityName) => void
}

export const CityBiasSection: React.FC<CityBiasSectionProps> = ({ isDark, value, onChange }) => {
    const [isExpanded, setIsExpanded] = useState(true)
    return (
        <div className={clsx(
            'rounded-xl border shadow-lg transition-all duration-200 overflow-hidden',
            isDark
                ? 'bg-gray-800 border-gray-700'
                : 'bg-white border-gray-200',
            isExpanded && 'shadow-xl'
        )}>
            <button
                type="button"
                onClick={() => setIsExpanded(!isExpanded)}
                className={clsx(
                    'w-full flex items-center justify-between p-5 transition-all duration-200 group',
                    isDark
                        ? 'hover:bg-gray-700/50 hover:border-gray-600'
                        : 'hover:bg-gray-50/80 hover:border-gray-300'
                )}
            >
                <div className="flex items-center space-x-3">
                    <div className={clsx(
                        'p-2 rounded-lg transition-all duration-200',
                        isDark
                            ? 'bg-green-600/20 text-green-400 group-hover:bg-green-600/30 group-hover:scale-110'
                            : 'bg-green-100 text-green-600 group-hover:bg-green-200 group-hover:scale-110'
                    )}>
                        <MapIcon className="h-5 w-5" />
                    </div>
                    <span className={clsx(
                        'font-semibold text-lg transition-colors',
                        isDark ? 'text-gray-200 group-hover:text-white' : 'text-gray-900 group-hover:text-gray-800'
                    )}>
                        Город для маршрутов (обязателен)
                    </span>
                </div>
                <div className={clsx(
                    'transition-all duration-200',
                    isExpanded && 'rotate-180',
                    isDark
                        ? 'text-gray-400 group-hover:text-white'
                        : 'text-gray-600 group-hover:text-gray-800'
                )}>
                    {isExpanded ? (
                        <ChevronUpIcon className="h-6 w-6" />
                    ) : (
                        <ChevronDownIcon className="h-6 w-6" />
                    )}
                </div>
            </button>
            {isExpanded && (
                <div className={clsx(
                    'border-t p-6',
                    isDark
                        ? 'border-gray-700 bg-gray-800'
                        : 'border-gray-200 bg-white'
                )}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <label className={clsx('text-sm font-medium', isDark ? 'text-gray-300' : 'text-gray-700')}>Выберите город</label>
                        <select
                            className={clsx(
                                'md:col-span-2 px-3 py-2 rounded-lg border text-sm',
                                isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                            )}
                            value={value}
                            onChange={(e) => onChange(e.target.value as any)}
                        >
                            <option value="">— Не выбран —</option>
                            <option value="Киев">Киев</option>
                            <option value="Харьков">Харьков</option>
                            <option value="Полтава">Полтава</option>
                            <option value="Одесса">Одесса</option>
                        </select>
                    </div>
                    <p className={clsx('mt-2 text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>
                        Расчёт и геокодирование будут учитывать только выбранный город. Без выбора города создание маршрута запрещено.
                    </p>
                </div>
            )}
        </div>
    )
}
