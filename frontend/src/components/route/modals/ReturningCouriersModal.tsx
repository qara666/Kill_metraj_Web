import { memo } from 'react';
import { ClockIcon, XMarkIcon, TruckIcon, UserIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

interface ReturningCourier {
    name: string;
    delivered: number;
    total: number;
    calculatedCount: number;
    eta: string;
    isRough: boolean;
    statusLabel: string;
    progress: number;
}

interface ReturningCouriersModalProps {
    show: boolean;
    onClose: () => void;
    isDark: boolean;
    data: ReturningCourier[];
    isGeocoding: boolean;
    onSelectCourier: (name: string) => void;
}

export const ReturningCouriersModal = memo(({
    show,
    onClose,
    isDark,
    data,
    isGeocoding,
    onSelectCourier
}: ReturningCouriersModalProps) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60">
            <div className={clsx(
                "w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden border-2 transform scale-100 animate-in fade-in zoom-in duration-300",
                isDark ? "bg-slate-900 border-white/5 shadow-black/50" : "bg-white border-blue-100 shadow-blue-500/20"
            )}>
                <div className="px-8 py-6 border-b border-gray-100 dark:border-white/5 relative bg-gradient-to-r from-purple-500/10 to-transparent">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-purple-500 flex items-center justify-center text-white shadow-lg shadow-purple-500/30">
                                <ClockIcon className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className={clsx("text-xl font-black tracking-tight", isDark ? "text-white" : "text-gray-900")}>Ожидаем возврат</h3>
                                <p className="text-[10px] font-black uppercase tracking-widest text-purple-500 opacity-60">
                                    {isGeocoding ? '⏳ геокодирование адресов...' : '+- через сколько вернется на тт'}
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-white/5 rounded-full transition-colors">
                            <XMarkIcon className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                <div className="p-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
                    {data.length === 0 ? (
                        <div className="text-center py-12">
                            <TruckIcon className="w-12 h-12 mx-auto text-gray-300 mb-4 opacity-30" />
                            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Нет возвращающихся курьеров</p>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {data.map((c) => (
                                <button
                                    key={c.name}
                                    onClick={() => onSelectCourier(c.name)}
                                    className={clsx(
                                        "w-full p-5 rounded-[1.5rem] border-2 flex flex-col gap-4 transition-all group hover:scale-[1.02] active:scale-[0.98]",
                                        isDark ? "bg-black/20 border-white/5 hover:border-purple-500/30" : "bg-gray-50 border-gray-100 hover:border-purple-200"
                                    )}
                                >
                                    <div className="flex items-center justify-between w-full">
                                        <div className="flex items-center gap-3">
                                            <div className={clsx(
                                                "w-10 h-10 rounded-xl flex items-center justify-center shadow-sm",
                                                isDark ? "bg-purple-500/20 text-purple-400" : "bg-purple-50 text-purple-600 border border-purple-100/50"
                                            )}>
                                                <UserIcon className="w-5 h-5" />
                                            </div>
                                            <div className="flex flex-col">
                                                <span className={clsx("text-base font-black tracking-tight", isDark ? "text-white" : "text-gray-900")}>{c.name}</span>
                                                <span className={clsx("text-[9px] font-black uppercase tracking-widest opacity-40", isDark ? "text-purple-400" : "text-purple-600")}>
                                                    Возвращается на базу
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <div className="flex items-center gap-1.5">
                                                <ClockIcon className="w-4 h-4 text-purple-500 opacity-50" />
                                                <span className="text-xl font-black text-purple-500 tabular-nums">{c.eta}</span>
                                            </div>
                                            <span className={clsx(
                                                "text-[8px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border leading-none mt-1",
                                                c.statusLabel === 'ГУГЛ' 
                                                    ? (isDark ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-700")
                                                    : (isDark ? "bg-slate-800 border-white/5 text-slate-400" : "bg-white border-slate-200 text-slate-500")
                                            )}>
                                                {c.statusLabel}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Premium Order Stats: Total / Calculated / Remaining */}
                                    <div className="grid grid-cols-3 gap-2 w-full">
                                        <div className={clsx(
                                            "flex flex-col items-center justify-center py-2 rounded-xl border transition-all",
                                            isDark ? "bg-white/5 border-white/10" : "bg-white border-gray-100 shadow-sm"
                                        )}>
                                            <span className="text-xs font-black leading-none mb-1">{c.total}</span>
                                            <span className="text-[7px] font-black uppercase tracking-widest opacity-40">Всего</span>
                                        </div>
                                        <div className={clsx(
                                            "flex flex-col items-center justify-center py-2 rounded-xl border transition-all",
                                            isDark ? "bg-emerald-500/10 border-emerald-500/20" : "bg-emerald-50 border-emerald-100"
                                        )}>
                                            <span className={clsx("text-xs font-black leading-none mb-1", isDark ? "text-emerald-400" : "text-emerald-600")}>
                                                {c.calculatedCount}
                                            </span>
                                            <span className={clsx("text-[7px] font-black uppercase tracking-widest opacity-60", isDark ? "text-emerald-400/50" : "text-emerald-600/50")}>Расчет</span>
                                        </div>
                                        <div className={clsx(
                                            "flex flex-col items-center justify-center py-2 rounded-xl border transition-all",
                                            isDark ? "bg-orange-500/10 border-orange-500/20" : "bg-orange-50 border-orange-100"
                                        )}>
                                            <span className={clsx("text-xs font-black leading-none mb-1", isDark ? "text-orange-400" : "text-orange-600")}>
                                                {Math.max(0, c.total - c.calculatedCount)}
                                            </span>
                                            <span className={clsx("text-[7px] font-black uppercase tracking-widest opacity-60", isDark ? "text-orange-400/50" : "text-orange-600/50")}>Остаток</span>
                                        </div>
                                    </div>

                                    {c.total > 0 && (
                                        <div className="w-full">
                                            <div className="h-2 w-full bg-gray-200 dark:bg-white/5 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-purple-500 to-emerald-500 rounded-full transition-all duration-500 ease-out shadow-[0_0_10px_rgba(168,85,247,0.3)]"
                                                    style={{ width: `${c.progress}%` }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-6 bg-gray-50 dark:bg-black/20 text-center">
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-400 opacity-60">Нажмите на курьера, чтобы открыть его маршрут</p>
                </div>
            </div>
        </div>
    );
});
