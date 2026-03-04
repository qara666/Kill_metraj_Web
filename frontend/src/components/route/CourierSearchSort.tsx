import { clsx } from 'clsx'

interface CourierSearchSortProps {
    searchTerm: string
    onSearchChange: (val: string) => void
    sortType: 'alpha' | 'load'
    onSortToggle: () => void
    isDark: boolean
}

export const CourierSearchSort = ({
    searchTerm,
    onSearchChange,
    sortType,
    onSortToggle,
    isDark
}: CourierSearchSortProps) => {
    return (
        <div className="flex items-center gap-2">
            <div className={clsx(
                "flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border transition-all",
                isDark ? "bg-black/20 border-white/5 focus-within:border-blue-500/30" : "bg-gray-50 border-gray-100 focus-within:border-blue-200"
            )}>
                <svg className="w-3.5 h-3.5 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                    type="text"
                    placeholder="Поиск..."
                    value={searchTerm}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="bg-transparent border-none outline-none text-[10px] font-black w-full placeholder:opacity-30 uppercase tracking-widest"
                />
            </div>
            <button
                onClick={onSortToggle}
                className={clsx(
                    "p-2 rounded-xl border transition-all group",
                    isDark ? "bg-black/20 border-white/5 hover:border-blue-500/30" : "bg-gray-50 border-gray-100 hover:border-blue-200"
                )}
                title={sortType === 'alpha' ? 'Сортировка по алфавиту' : 'Сортировка по нагрузке'}
            >
                {sortType === 'alpha' ? (
                    <svg className="w-4 h-4 opacity-40 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
                    </svg>
                ) : (
                    <svg className="w-4 h-4 text-blue-500 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                )}
            </button>
        </div>
    )
}
