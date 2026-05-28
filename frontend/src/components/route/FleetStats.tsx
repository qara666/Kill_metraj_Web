import { clsx } from 'clsx'

interface FleetStatsProps {
    stats: {
        total: number
        returning: number
        inTransit: number
        finished: number
    }
    isDark: boolean
    onShowReturning: () => void
    onShowTransit: () => void
}

export const FleetStats = ({
    stats,
    isDark,
    onShowReturning,
    onShowTransit
}: FleetStatsProps) => {
    return (
        <div className="grid grid-cols-4 gap-1.5">
            <div className={clsx(
                "p-2.5 rounded-2xl border flex flex-col items-center justify-center transition-all",
                isDark ? "bg-black/20 border-white/5" : "bg-gray-50 border-gray-100"
            )}>
                <span className="text-[13px] font-black leading-none mb-1">{stats.total}</span>
                <span className="text-[6px] font-black uppercase tracking-widest opacity-30">Всего</span>
            </div>

            <button
                onClick={onShowReturning}
                className={clsx(
                    "p-2.5 rounded-2xl border flex flex-col items-center justify-center transition-all hover:scale-105 active:scale-95 relative overflow-hidden group",
                    isDark ? "bg-purple-500/10 border-purple-500/30" : "bg-purple-50 border-purple-100"
                )}
            >
                <div className="absolute inset-0 bg-purple-500/5 group-hover:bg-purple-500/10 transition-colors" />
                <span className="text-[13px] font-black leading-none mb-1 text-purple-600 relative z-10">{stats.returning}</span>
                <span className="text-[6px] font-black uppercase tracking-widest text-purple-600/50 relative z-10">Возврат</span>
            </button>

            <button
                onClick={onShowTransit}
                className={clsx(
                    "p-2.5 rounded-2xl border flex flex-col items-center justify-center transition-all hover:scale-105 active:scale-95",
                    isDark ? "bg-blue-500/5 border-blue-500/20" : "bg-blue-50 border-blue-100"
                )}
            >
                <span className="text-[13px] font-black leading-none mb-1 text-blue-500">{stats.inTransit}</span>
                <span className="text-[6px] font-black uppercase tracking-widest text-blue-500/50">В пути</span>
            </button>

            <div className={clsx(
                "p-2.5 rounded-2xl border flex flex-col items-center justify-center transition-all",
                isDark ? "bg-emerald-500/5 border-emerald-500/20" : "bg-emerald-50 border-emerald-100"
            )}>
                <span className="text-[13px] font-black leading-none mb-1 text-emerald-500">{stats.finished}</span>
                <span className="text-[6px] font-black uppercase tracking-widest text-emerald-500/50">Завершил</span>
            </div>
        </div>
    )
}
