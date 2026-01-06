import React from 'react';
import { clsx } from 'clsx';
import { type TrafficPresetMode } from '../../hooks/useRoutePlanning';

interface TrafficPresetSelectorProps {
    isDark: boolean;
    currentMode: 'auto' | TrafficPresetMode;
    onChange: (mode: 'auto' | TrafficPresetMode) => void;
    // Current defaults for calculation
    defaults: {
        maxStops: number;
        maxDuration: number;
        maxDistance: number;
    };
}

export const TrafficPresetSelector: React.FC<TrafficPresetSelectorProps> = ({
    isDark,
    currentMode,
    onChange,
    defaults
}) => {
    const getModeDetails = (mode: 'auto' | TrafficPresetMode) => {
        if (mode === 'auto') {
            return {
                title: 'Режим автопланирования по трафику',
                limits: 'Автоматически подбирает лимиты на основе реальных данных о пробках',
                note: 'Рекомендуется: система сама определит плотность трафика и настроит буфер.'
            };
        }

        if (mode === 'gridlock') {
            const stops = Math.max(2, Math.min(defaults.maxStops, 3));
            const dist = Math.min(defaults.maxDistance, 80);
            const dur = Math.min(defaults.maxDuration, 150);
            return {
                title: 'Режим автопланирования по трафику (Стоим)',
                limits: `Лимиты: до ${stops} стопов · ${dist} км · ${dur} мин · буфер +12 мин`,
                note: 'Критический трафик: минимальные маршруты для максимальной надежности.'
            };
        }

        if (mode === 'busy') {
            const stops = Math.max(3, Math.min(defaults.maxStops, 4));
            const dist = Math.min(defaults.maxDistance, 100);
            const dur = Math.min(defaults.maxDuration, 165);
            return {
                title: 'Режим автопланирования по трафику (Плотно)',
                limits: `Лимиты: до ${stops} стопов · ${dist} км · ${dur} мин · буфер +8 мин`,
                note: 'Плотный трафик: сокращаем связки и добавляем небольшой буфер.'
            };
        }

        // free
        return {
            title: 'Режим автопланирования по трафику (Свободно)',
            limits: `Лимиты: до ${defaults.maxStops} стопов · ${defaults.maxDistance} км · ${defaults.maxDuration} мин · буфер +5 мин`,
            note: 'Свободные дороги: стандартные лимиты для максимальной эффективности.'
        };
    };

    const details = getModeDetails(currentMode);

    const modes: { id: 'auto' | TrafficPresetMode; label: string }[] = [
        { id: 'auto', label: 'Авто' },
        { id: 'free', label: 'Свободно' },
        { id: 'busy', label: 'Плотно' },
        { id: 'gridlock', label: 'Стоим' }
    ];

    return (
        <div className={clsx(
            'mt-6 rounded-xl p-4 border-2 transition-all hover:shadow-lg',
            isDark
                ? 'border-blue-700/50 bg-gradient-to-br from-gray-800/80 to-blue-900/20'
                : 'border-blue-200 bg-gradient-to-br from-blue-50/50 to-indigo-50/50'
        )}>
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-start gap-4 flex-1">
                    <div className={clsx(
                        'p-2.5 rounded-xl mt-1 shrink-0',
                        isDark ? 'bg-blue-600/20' : 'bg-blue-100'
                    )}>
                        <div className={clsx('text-xl', isDark ? 'text-blue-400' : 'text-blue-600')}>🚦</div>
                    </div>

                    <div className="space-y-1.5">
                        <h3 className={clsx('text-sm font-bold', isDark ? 'text-white' : 'text-gray-900')}>
                            {details.title}
                        </h3>
                        <div className={clsx('text-xs font-semibold', isDark ? 'text-blue-300' : 'text-blue-600')}>
                            {details.limits}
                        </div>
                        <p className={clsx('text-xs opacity-70 leading-relaxed max-w-2xl', isDark ? 'text-gray-300' : 'text-gray-600')}>
                            {details.note}
                        </p>
                    </div>
                </div>

                <div className={clsx(
                    'flex items-center p-1.5 rounded-xl h-fit w-fit self-end lg:self-center',
                    isDark ? 'bg-gray-900/50 border border-gray-700' : 'bg-white shadow-sm border border-gray-200'
                )}>
                    {modes.map((m) => (
                        <button
                            key={m.id}
                            onClick={() => onChange(m.id)}
                            className={clsx(
                                'px-5 py-2 text-xs font-bold rounded-lg transition-all duration-300 min-w-[90px]',
                                currentMode === m.id
                                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30 scale-105 z-10'
                                    : isDark
                                        ? 'text-gray-400 hover:text-white hover:bg-gray-700'
                                        : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
                            )}
                        >
                            {m.label}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};
