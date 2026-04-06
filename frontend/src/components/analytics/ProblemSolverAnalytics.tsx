import React, { useState, useEffect } from 'react';
import { 
    ShieldExclamationIcon,
    LightBulbIcon,
    ArrowPathIcon,
    CpuChipIcon,
    FingerPrintIcon,
    UserCircleIcon,
    MapIcon,
    SparklesIcon,
    CheckCircleIcon
} from '@heroicons/react/24/outline';
import { useTheme } from '../../contexts/ThemeContext';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { clsx } from 'clsx';
import { format, subDays } from 'date-fns';
import { toast } from 'react-hot-toast';

export const ProblemSolverAnalytics: React.FC = () => {
    const { isDark } = useTheme();
    const divisionId = useDashboardStore(s => s.divisionId);
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<any>(null);
    const [resolvedIds, setResolvedIds] = useState<string[]>([]);
    
    // Dates
    const [startDate] = useState(() => format(subDays(new Date(), 14), 'yyyy-MM-dd'));
    const [endDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));

    const analyzeSystem = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('km_access_token');
            const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
            const res = await fetch(`${baseUrl}/api/v1/dashboard/analytics/full?startDate=${startDate}&endDate=${endDate}&divisionId=${divisionId || 'all'}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();
            if (result.success) setData(result.data);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        analyzeSystem();
    }, [divisionId]);

    const toggleResolved = (id: string) => {
        if (resolvedIds.includes(id)) {
            setResolvedIds(resolvedIds.filter(v => v !== id));
        } else {
            setResolvedIds([...resolvedIds, id]);
            toast.success('Проблема отмечена как решенная', {
                icon: '✅',
                style: { borderRadius: '1rem', background: '#333', color: '#fff' }
            });
        }
    };

    if (loading && !data) return (
        <div className="flex flex-col items-center justify-center p-32 space-y-8 animate-pulse text-center">
            <CpuChipIcon className="w-24 h-24 text-blue-500 animate-bounce" />
            <p className="text-2xl font-black uppercase tracking-[0.5em] opacity-30 italic">Автопилот сканирует систему...</p>
        </div>
    );

    if (!data) return null;

    const issues = data.problems || [];
    const activeIssues = issues.filter((p: any) => !resolvedIds.includes(p.id));
    const resolvedCount = resolvedIds.length;

    return (
        <div className="space-y-10 animate-in fade-in duration-700">
            
            {/* AI Control Hub v5.400 */}
            <div className={clsx(
                "p-12 rounded-[5rem] border-2 shadow-2xl relative overflow-hidden flex flex-wrap items-center gap-10",
                isDark ? "bg-[#0A101F] border-blue-500/20" : "bg-blue-50 border-blue-100"
            )}>
                 {/* Matrix Rain Decoration (Subtle) */}
                <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-blue-500/5 to-transparent pointer-events-none" />
                
                <div className="flex items-center gap-8 relative z-10">
                    <div className="relative">
                        <div className="absolute inset-0 bg-blue-500/30 blur-2xl rounded-full animate-pulse" />
                        <FingerPrintIcon className="w-20 h-20 text-blue-500 relative z-10 p-2 bg-black/10 rounded-3xl" />
                    </div>
                    <div>
                        <h2 className="text-4xl font-black italic tracking-tighter uppercase leading-none">Операционный Автопилот</h2>
                        <div className="flex items-center gap-2 mt-4">
                            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-50">Активный мониторинг / Версия 1.0</span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap gap-6 ml-auto relative z-10">
                     <div className="p-8 bg-black/5 rounded-[3.5rem] border border-white/5 flex flex-col items-center min-w-[140px]">
                        <span className="text-4xl font-black text-red-500">{activeIssues.length}</span>
                        <p className="text-[9px] font-black uppercase opacity-40 mt-1 whitespace-nowrap">Угроз найдено</p>
                     </div>
                     <div className="p-8 bg-black/5 rounded-[3.5rem] border border-white/5 flex flex-col items-center min-w-[140px]">
                        <span className="text-4xl font-black text-emerald-500">{resolvedCount}</span>
                        <p className="text-[9px] font-black uppercase opacity-40 mt-1 whitespace-nowrap">Решено за сегодня</p>
                     </div>
                </div>
            </div>

            {/* Problem Engine Results v5.410 */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-10">
                
                {/* Active Alerts Table */}
                <div className="xl:col-span-8 space-y-6">
                    <div className="flex items-center justify-between px-10 mb-4">
                        <h3 className="text-xl font-black uppercase tracking-widest italic opacity-40">Детектор отклонений</h3>
                        <button onClick={analyzeSystem} className="p-3 bg-blue-500/10 text-blue-500 rounded-2xl hover:bg-blue-500/20 transition-all">
                            <ArrowPathIcon className={clsx("w-6 h-6", loading && "animate-spin")} />
                        </button>
                    </div>

                    {activeIssues.length === 0 ? (
                        <div className={clsx(
                            "p-20 rounded-[4rem] border-2 shadow-xl flex flex-col items-center justify-center text-center",
                            isDark ? "bg-emerald-500/5 border-emerald-500/10" : "bg-emerald-50 border-emerald-100"
                        )}>
                            <div className="p-8 bg-emerald-500/10 rounded-full mb-8"><CheckCircleIcon className="w-16 h-16 text-emerald-500" /></div>
                            <h4 className="text-3xl font-black tracking-tighter">Система в идеальном балансе</h4>
                            <p className="text-sm opacity-50 mt-4 max-w-sm">Автопилот не обнаружил активных аномалий. Все показатели в пределах нормы для вашей сети.</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {activeIssues.map((p: any) => (
                                <div key={p.id} className={clsx(
                                    "p-10 rounded-[3.5rem] border-2 shadow-2xl transition-all hover:translate-x-2 group relative overflow-hidden",
                                    p.type === 'danger' 
                                        ? (isDark ? "bg-red-500/5 border-red-500/20" : "bg-red-50 border-red-100") 
                                        : (isDark ? "bg-amber-500/5 border-amber-500/20" : "bg-amber-50 border-amber-100")
                                )}>
                                    <div className="flex items-start gap-8 relative z-10">
                                        <div className={clsx(
                                            "p-6 rounded-[2rem] shadow-lg shrink-0",
                                            p.type === 'danger' ? "bg-red-500 text-white" : "bg-amber-500 text-white"
                                        )}>
                                            <ShieldExclamationIcon className="w-8 h-8" />
                                        </div>
                                        
                                        <div className="flex-1">
                                            <div className="flex items-center gap-4 mb-2">
                                                <h4 className="text-2xl font-black tracking-tight">{p.title}</h4>
                                                <span className={clsx(
                                                    "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest",
                                                    p.type === 'danger' ? "bg-red-500/20 text-red-500" : "bg-amber-500/20 text-amber-500"
                                                )}>{p.id.split('_')[0]}</span>
                                            </div>
                                            
                                            <div className="flex items-center gap-2 mb-6">
                                                <div className="w-2 h-2 rounded-full bg-blue-500" />
                                                <p className="font-bold text-sm tracking-tight italic opacity-70">{p.reason}</p>
                                            </div>

                                            <div className={clsx(
                                                "p-6 rounded-3xl bg-black/5 border border-white/5 flex items-start gap-4",
                                                isDark ? "text-gray-300" : "text-gray-700"
                                            )}>
                                                <LightBulbIcon className="w-6 h-6 text-blue-500 shrink-0" />
                                                <div>
                                                    <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Решение:</p>
                                                    <p className="text-sm font-black leading-relaxed tracking-tight">{p.recommendation}</p>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-end gap-10 shrink-0">
                                            <div className="text-right">
                                                <p className="text-[9px] font-black uppercase opacity-30">Показатель</p>
                                                <p className="text-3xl font-black">{p.metric}</p>
                                            </div>
                                            <button 
                                                onClick={() => toggleResolved(p.id)}
                                                className="px-10 py-4 bg-emerald-600 text-white font-black text-[10px] uppercase rounded-full shadow-xl shadow-emerald-500/20 hover:scale-105 active:scale-95 transition-all"
                                            >
                                                Решено
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Right Sidebar - Intelligent Recommendations v5.420 */}
                <div className="xl:col-span-4 space-y-8">
                     <div className={clsx(
                        "p-10 rounded-[4rem] border-2 shadow-2xl relative overflow-hidden",
                        isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"
                     )}>
                         <div className="flex items-center gap-4 mb-8">
                            <SparklesIcon className="w-8 h-8 text-blue-500" />
                            <h3 className="text-2xl font-black uppercase tracking-tighter">Рекомендации</h3>
                         </div>
                         <div className="space-y-6">
                             {[
                                { icon: UserCircleIcon, title: 'Усилить смену', desc: 'Добавьте 1 курьера в сектор "Центр" с 12:00 до 16:00' },
                                { icon: MapIcon, title: 'Граница зон', desc: 'Удалите нахлест KML-зон Севера и Запада для четкого деления' },
                                { icon: CpuChipIcon, title: 'Авто-назначение', desc: 'Включите "Приоритет времени" в настройках пресета' }
                             ].map((item:any, i:number) => (
                                 <div key={i} className="p-6 bg-gray-500/5 rounded-3xl border border-gray-500/10 hover:bg-gray-500/10 transition-colors cursor-pointer group">
                                     <div className="flex items-start gap-4">
                                        <item.icon className="w-6 h-6 text-indigo-500" />
                                        <div>
                                            <h5 className="font-black text-sm uppercase tracking-tight group-hover:text-indigo-500 transition-colors">{item.title}</h5>
                                            <p className="text-xs opacity-50 mt-1 leading-relaxed">{item.desc}</p>
                                        </div>
                                     </div>
                                 </div>
                             ))}
                         </div>
                     </div>

                     <div className={clsx(
                        "p-10 rounded-[4rem] border-2 shadow-2xl",
                        isDark ? "bg-indigo-600/5 border-indigo-500/10" : "bg-indigo-50 border-indigo-200"
                     )}>
                         <h4 className="text-sm font-black uppercase tracking-[0.2em] mb-6 opacity-40">Статус сети</h4>
                         <div className="space-y-4">
                             <div className="flex justify-between items-center py-2 border-b border-white/5">
                                <span className="text-xs font-bold">Нагрузка</span>
                                <span className="text-xs font-black text-emerald-500 uppercase">Оптимально</span>
                             </div>
                             <div className={clsx("flex justify-between items-center py-2 border-b border-white/5", activeIssues.length > 0 ? "text-amber-500" : "text-emerald-500")}>
                                <span className="text-xs font-bold">Стабильность</span>
                                <span className="text-xs font-black uppercase">{activeIssues.length > 0 ? "Наблюдение" : "Высокая"}</span>
                             </div>
                             <div className="flex justify-between items-center py-2">
                                <span className="text-xs font-bold">Риск ОПа</span>
                                <span className="text-xs font-black text-blue-500 uppercase">Минимальный</span>
                             </div>
                         </div>
                     </div>
                </div>

            </div>
        </div>
    );
};
