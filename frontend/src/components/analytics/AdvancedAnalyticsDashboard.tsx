import React, { useState, useEffect, useMemo, memo } from 'react';
import { 
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    Line, 
    Bar, Cell,
    ComposedChart,
    ScatterChart, Scatter
} from 'recharts';
import { 
    CalendarIcon, 
    ChartPieIcon,
    ArrowPathIcon,
    BoltIcon,
    ClockIcon,
    FireIcon,
    TrophyIcon,
    ExclamationCircleIcon
} from '@heroicons/react/24/outline';
import { useTheme } from '../../contexts/ThemeContext';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { clsx } from 'clsx';
import { toast } from 'react-hot-toast';
import { format, subDays } from 'date-fns';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

// 🚀 Optimization: Memoized sub-components to prevent unnecessary re-renders
const MetricCard = memo(({ label, val, icon: Icon, color, sub, isDark }: any) => (
    <div className={clsx(
        "p-8 rounded-[3rem] border-2 shadow-xl relative overflow-hidden group transition-all",
        isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"
    )}>
        <div className="relative z-10 flex flex-col items-center text-center">
            <div className="p-4 bg-gray-500/5 rounded-full mb-4 group-hover:scale-105 transition-transform"><Icon className={clsx("w-8 h-8", color)} /></div>
            <h4 className="text-4xl font-black tracking-tighter tabular-nums">{val}</h4>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-40 mt-2">{label}</p>
            <p className={clsx("text-[8px] font-black uppercase mt-1", sub.includes('-') ? "text-red-500" : "text-emerald-500/60")}>{sub}</p>
        </div>
    </div>
));

export const AdvancedAnalyticsDashboard: React.FC = () => {
    const { isDark } = useTheme();
    const divisionId = useDashboardStore(s => s.divisionId);
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<any>(null);
    
    const [startDate, setStartDate] = useState(() => format(subDays(new Date(), 14), 'yyyy-MM-dd'));
    const [endDate, setEndDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));

    const fetchFullAnalytics = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('km_access_token');
            const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
            const res = await fetch(`${baseUrl}/api/v1/dashboard/analytics/full?startDate=${startDate}&endDate=${endDate}&divisionId=${divisionId || 'all'}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();
            if (result.success) setData(result.data);
            else toast.error(result.error);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    useEffect(() => {
        fetchFullAnalytics();
    }, [startDate, endDate, divisionId]);

    // 🚀 Optimization: Heavy sorting memoized
    const performanceRanking = useMemo(() => {
        if (!data?.couriers) return [];
        return [...data.couriers]
            .sort((a,b) => parseFloat(b.efficiency) - parseFloat(a.efficiency))
            .slice(0, 10);
    }, [data?.couriers]);

    const zoneDelays = useMemo(() => {
        if (!data?.zones) return [];
        return [...data.zones]
            .sort((a,b) => parseFloat(b.avgTime) - parseFloat(a.avgTime))
            .slice(0, 8);
    }, [data?.zones]);


    if (loading && !data) return (
        <div className="flex flex-col items-center justify-center p-32 space-y-8 animate-pulse text-center">
            <div className="w-20 h-20 bg-blue-500 rounded-3xl animate-spin shadow-2xl shadow-blue-500/20" />
            <p className="text-xl font-black uppercase tracking-[0.5em] opacity-30 italic">ОПТИМИЗАЦИЯ ДАННЫХ...</p>
        </div>
    );

    if (!data) return null;

    return (
        <div className="space-y-10">
            
            {/* Header Control v8.0 */}
            <div className={clsx(
                "p-8 rounded-[4rem] border-2 flex flex-wrap items-center gap-8 shadow-xl relative overflow-hidden",
                isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"
            )}>
                <div className="flex items-center gap-6">
                    <div className="p-5 bg-blue-500/10 rounded-full"><CalendarIcon className="w-8 h-8 text-blue-500" /></div>
                    <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.3em] opacity-40">Период</p>
                        <div className="flex items-center gap-3 mt-1">
                            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-transparent border-none p-0 text-xl font-black focus:ring-0 cursor-pointer" />
                            <div className="w-4 h-px bg-gray-400"></div>
                            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="bg-transparent border-none p-0 text-xl font-black focus:ring-0 cursor-pointer" />
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-8 ml-auto">
                     <div className="text-center">
                        <p className="text-[8px] font-black opacity-30 tracking-[0.3em] mb-1">СР. ЧЕК</p>
                        <div className="text-2xl font-black tabular-nums">{parseInt(data.summary.avgOrderValue).toLocaleString()} ₴</div>
                     </div>
                     <div className="text-center">
                        <p className="text-[8px] font-black opacity-30 tracking-[0.3em] mb-1">REV/KM</p>
                        <div className="text-2xl font-black tabular-nums text-emerald-500">{data.summary.revenuePerKm} ₴</div>
                     </div>
                     <button onClick={fetchFullAnalytics} className="flex items-center gap-2 px-8 py-5 rounded-[2.5rem] bg-black font-black uppercase tracking-widest text-[9px] text-white shadow-xl hover:bg-gray-800 transition-all">
                        <ArrowPathIcon className={clsx("w-4 h-4", loading && "animate-spin")} />
                        Обновить
                    </button>
                </div>
            </div>

            {/* Quick Metrics v8.0 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <MetricCard isDark={isDark} label="Всего заказов" val={data.summary.totalOrders} icon={ChartPieIcon} color="text-blue-500" sub={`${data.wow.ordersChange}% WoW`} />
                <MetricCard isDark={isDark} label="Пунктуальность" val={`${data.summary.onTimeRate}%`} icon={ClockIcon} color="text-emerald-500" sub="SLA OK" />
                <MetricCard isDark={isDark} label="КПД (зак/км)" val={data.summary.avgEfficiency} icon={BoltIcon} color="text-amber-500" sub="Efficiency" />
                <MetricCard isDark={isDark} label="Ошибки" val={`${data.summary.failedRate}%`} icon={ExclamationCircleIcon} color="text-rose-500" sub="Critical" />
            </div>

            {/* Performance v8.0 */}
            <div className="grid grid-cols-1 xl:grid-cols-5 gap-8">
                 <div className={clsx(
                    "xl:col-span-3 p-10 rounded-[4.5rem] border-2 shadow-xl",
                    isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"
                 )}>
                    <div className="flex items-center gap-5 mb-8">
                        <TrophyIcon className="w-8 h-8 text-amber-500" />
                        <h3 className="text-2xl font-black tracking-tighter uppercase italic">Эффективность Курьеров</h3>
                    </div>
                    
                    <div className="space-y-4">
                        {performanceRanking.map((c: any, i: number) => (
                            <div key={i} className="flex items-center gap-4">
                                <div className="w-8 text-[9px] font-black opacity-20 text-center">{i + 1}</div>
                                <div className="flex-1">
                                    <div className="flex justify-between items-end mb-1">
                                        <span className="text-[11px] font-black uppercase leading-none">{c.name}</span>
                                        <span className="text-[11px] font-black text-blue-500">{c.efficiency}</span>
                                    </div>
                                    <div className="h-2 bg-gray-500/5 rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-blue-600 rounded-full" 
                                            style={{ width: `${Math.min(100, (parseFloat(c.efficiency) / (performanceRanking[0]?.efficiency || 1)) * 100)}%` }} 
                                        />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                 </div>

                 <div className={clsx(
                    "xl:col-span-2 p-10 rounded-[4.5rem] border-2 shadow-xl",
                    isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"
                 )}>
                    <div className="flex items-center gap-5 mb-8">
                        <FireIcon className="w-8 h-8 text-red-500" />
                        <h3 className="text-2xl font-black tracking-tighter uppercase italic">Задержки Зон</h3>
                    </div>
                    <div className="space-y-5">
                         {zoneDelays.map((z: any, i: number) => (
                             <div key={i} className="flex items-center justify-between p-3 bg-gray-500/5 rounded-2xl">
                                <span className="text-[10px] font-black uppercase tracking-tight truncate max-w-[150px]">{z.name}</span>
                                <span className="text-sm font-black text-red-500">{z.avgTime} м.</span>
                             </div>
                         ))}
                    </div>
                 </div>
            </div>

            {/* Main Pulse v8.0 */}
            <div className={clsx(
                 "p-10 rounded-[4.5rem] border-2 shadow-xl",
                 isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"
            )}>
                 <h3 className="text-2xl font-black tracking-tighter uppercase italic mb-8">Пульс Сети (Заказы & Выручка)</h3>
                 <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={data.trends}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} strokeOpacity={0.1} />
                            <XAxis dataKey="date" hide />
                            <YAxis yAxisId="left" hide />
                            <YAxis yAxisId="right" orientation="right" hide />
                            <Tooltip contentStyle={{ borderRadius: '1rem', border: 'none' }} />
                            <Bar yAxisId="left" dataKey="orders" fill="#3b82f6" radius={[10, 10, 0, 0]} isAnimationActive={false} />
                            <Line yAxisId="right" type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={3} dot={false} isAnimationActive={false} />
                        </ComposedChart>
                    </ResponsiveContainer>
                 </div>
            </div>

            {/* Scatter Matrix v8.0 */}
            <div className={clsx(
                "p-10 rounded-[4.5rem] border-2 shadow-xl",
                isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"
            )}>
                 <h3 className="text-2xl font-black tracking-tighter uppercase italic mb-8">Аудит Производительности</h3>
                 <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                         <ScatterChart>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.05} />
                            <XAxis type="number" dataKey="totalOrders" name="Заказы" axisLine={false} tick={{fontSize: 9, fontWeight: 900}} />
                            <YAxis type="number" dataKey="efficiency" name="КПД" axisLine={false} tick={{fontSize: 9, fontWeight: 900}} />
                            <Scatter data={data.couriers} isAnimationActive={false}>
                                {data.couriers.map((_:any, index:number) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                            </Scatter>
                         </ScatterChart>
                    </ResponsiveContainer>
                 </div>
            </div>

        </div>
    );
};
