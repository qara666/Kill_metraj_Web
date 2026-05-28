import { clsx } from 'clsx'

interface CourierFiltersProps {
    filter: 'all' | 'car' | 'moto'
    onFilterChange: (val: 'all' | 'car' | 'moto') => void
    isDark: boolean
}

export const CourierFilters = ({
    filter,
    onFilterChange,
    isDark
}: CourierFiltersProps) => {
    return (
        <div className="flex bg-gray-100 dark:bg-black/40 p-1 rounded-xl border dark:border-white/5 shadow-inner">
            {(['all', 'car', 'moto'] as const).map((f) => (
                <button
                    key={f}
                    onClick={() => onFilterChange(f)}
                    className={clsx(
                        'px-2.5 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all',
                        filter === f
                            ? (isDark ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'bg-white text-blue-600 shadow-md')
                            : (isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-800')
                    )}
                >
                    {f === 'all' ? 'Все' : f === 'car' ? 'Авто' : 'Мото'}
                </button>
            ))}
        </div>
    )
}
