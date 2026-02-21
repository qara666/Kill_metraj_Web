import { memo } from 'react';
import { TruckIcon, XMarkIcon, UserIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { clsx } from 'clsx';

interface TransitCourier {
    name: string;
    delivered: number;
    total: number;
    progress: number;
}

interface TransitCouriersModalProps {
    show: boolean;
    onClose: () => void;
    isDark: boolean;
    data: TransitCourier[];
    onSelectCourier: (name: string) => void;
}

export const TransitCouriersModal = memo(({
    show,
    onClose,
    isDark,
    data,
    onSelectCourier
}: TransitCouriersModalProps) => {
    if (!show) return null;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md transition-all ease-out duration-300">
            <div className={clsx(
                "w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden border-2 transform scale-100 animate-in fade-in zoom-in duration-300",
                isDark ? "bg-slate-900 border-white/5 shadow-black/50" : "bg-white border-blue-100 shadow-blue-500/20"
            )}>
                <div className="px-8 py-6 border-b border-gray-100 dark:border-white/5 relative bg-gradient-to-r from-blue-500/10 to-transparent">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-2xl bg-blue-500 flex items-center justify-center text-white shadow-lg shadow-blue-500/30">
                                <TruckIcon className="w-6 h-6" />
                            </div>
                            <div>
                                <h3 className={clsx("text-xl font-black tracking-tight", isDark ? "text-white" : "text-gray-900")}>Курьеры в пути</h3>
                                <p className="text-[10px] font-black uppercase tracking-widest text-blue-500 opacity-60">Распределены и в работе</p>
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
                            <p className="text-sm font-bold text-gray-400 uppercase tracking-widest">Нет курьеров в работе</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3">
                            {data.map((c) => (
                                <button
                                    key={c.name}
                                    onClick={() => onSelectCourier(c.name)}
                                    className={clsx(
                                        "w-full p-4 rounded-[1.2rem] border flex flex-col gap-3 transition-all group hover:scale-[1.01]",
                                        isDark ? "bg-black/20 border-white/5 hover:border-blue-500/30" : "bg-gray-50 border-gray-100 hover:border-blue-200"
                                    )}
                                >
                                    <div className="flex items-center justify-between w-full">
                                        <div className="flex items-center gap-3">
                                            <UserIcon className="w-4 h-4 text-blue-500 opacity-50" />
                                            <span className={clsx("text-sm font-bold", isDark ? "text-white" : "text-gray-900")}>{c.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">{c.delivered} / {c.total} дост.</span>
                                            <ChevronRightIcon className="w-4 h-4 text-gray-300 group-hover:translate-x-1 transition-transform" />
                                        </div>
                                    </div>

                                    {c.total > 0 && (
                                        <div className="w-full">
                                            <div className="h-1.5 w-full bg-gray-200 dark:bg-white/5 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-blue-500 transition-all duration-500 ease-out"
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
                    <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Нажмите на курьера, чтобы открыть его маршрут</p>
                </div>
            </div>
        </div>
    );
});
