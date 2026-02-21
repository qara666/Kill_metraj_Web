import { memo } from 'react';
import { ClockIcon, XMarkIcon, TruckIcon, UserIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

interface ReturningCourier {
    name: string;
    delivered: number;
    total: number;
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md transition-all ease-out duration-300">
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
                                        "w-full p-5 rounded-[1.5rem] border-2 flex items-center gap-5 transition-all text-left group hover:scale-[1.02] active:scale-[0.98]",
                                        isDark ? "bg-black/20 border-white/5 hover:border-purple-500/30" : "bg-gray-50 border-gray-100 hover:border-purple-200"
                                    )}
                                >
                                    <div className="relative shrink-0">
                                        <div className="w-12 h-12 rounded-2xl bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm">
                                            <UserIcon className="w-6 h-6 text-purple-500" />
                                        </div>
                                        <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 border-2 border-white dark:border-slate-900 flex items-center justify-center text-white text-[10px] font-black">
                                            {c.delivered}
                                        </div>
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className={clsx("text-sm font-black truncate", isDark ? "text-white" : "text-gray-900")}>{c.name}</span>
                                            <div className="flex flex-col items-end">
                                                <span className="text-xl font-black text-purple-500">{c.eta}</span>
                                                {c.isRough && (
                                                    <span className="text-[7px] font-black text-purple-400/60 uppercase tracking-widest -mt-1">
                                                        {c.statusLabel}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-widest opacity-40">
                                                <span>Статус</span>
                                                <span>{c.delivered} / {c.total} дост.</span>
                                            </div>
                                            <div className="h-1.5 w-full bg-gray-200 dark:bg-white/5 rounded-full overflow-hidden p-[1px]">
                                                <div
                                                    className="h-full bg-gradient-to-r from-purple-500 to-emerald-500 rounded-full transition-all duration-500 shadow-sm shadow-purple-500/20"
                                                    style={{ width: `${c.progress}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div className="p-6 bg-gray-50 dark:bg-black/20 text-center">
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Нажмите на курьера, чтобы открыть его маршрут</p>
                </div>
            </div>
        </div>
    );
});
