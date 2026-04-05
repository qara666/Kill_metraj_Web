import React, { useState, useEffect, useMemo, memo } from 'react';
import { 
    ResponsiveContainer, ScatterChart, XAxis, YAxis, Tooltip, Scatter,
    Cell, BarChart, Bar, CartesianGrid
} from 'recharts';
import { 
    CurrencyDollarIcon,
    BanknotesIcon,
    BoltIcon,
    ClockIcon,
    UserCircleIcon,
    XMarkIcon
} from '@heroicons/react/24/outline';
import { useTheme } from '../../contexts/ThemeContext';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { clsx } from 'clsx';
import { format, subDays } from 'date-fns';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

// 🚀 Optimization: Memoized table row for performance
const ZoneRow = memo(({ z, i, data, onSelect }: any) => {
    const marketShare = useMemo(() => ((z.revenue / data.summary.totalAmount) * 100).toFixed(1), [z.revenue, data.summary.totalAmount]);
    return (
        <tr 
            onClick={() => onSelect(z)}
            className="hover:bg-blue-500/5 transition-all group cursor-pointer border-b border-gray-500/5"
        >
            <td className="py-6">
                <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-2xl flex items-center justify-center font-black text-[10px] text-white shadow-lg group-hover:scale-110 transition-transform" style={{ backgroundColor: COLORS[i % COLORS.length] }}>
                        {z.name.slice(0, 2)}
                    </div>
                    <div>
                        <span className="font-black text-lg tracking-tighter uppercase leading-none block">{z.name}</span>
                        <span className="text-[8px] font-black opacity-30 uppercase tracking-[0.2em] mt-1 block">Детальный анализ</span>
                    </div>
                </div>
            </td>
            <td className="py-6 font-black tabular-nums text-center text-xl">{parseInt(z.revenue).toLocaleString()} ₴</td>
            <td className="py-6 font-black tabular-nums text-center text-blue-500 text-lg">{z.orders}</td>
            <td className="py-6 font-black tabular-nums text-center opacity-40 text-xs">{(z.revenue / z.orders).toFixed(0)} ₴</td>
            <td className="py-6 text-center">
                    <div className={clsx(
                    "inline-flex items-center gap-2 px-3 py-1 rounded-xl font-black text-[9px] uppercase",
                    parseFloat(z.onTime) > 90 ? "bg-emerald-500/10 text-emerald-500" : "bg-amber-500/10 text-amber-500"
                    )}>
                    {z.onTime}%
                    </div>
            </td>
            <td className="py-6 text-right">
                <div className="flex flex-col items-end gap-2 pr-4">
                        <div className="w-32 h-1.5 bg-gray-500/10 rounded-full overflow-hidden">
                        <div 
                            className="h-full bg-indigo-500 rounded-full" 
                            style={{ width: `${Math.min(100, (z.revenue / data.summary.totalAmount) * 100 * 2.5)}%` }} 
                        />
                        </div>
                        <span className="text-[9px] font-black opacity-30 text-indigo-500 tracking-[0.2em] uppercase">{marketShare}%</span>
                </div>
            </td>
        </tr>
    );
});

export const FinancialDensityAnalytics: React.FC = () => {
    const { isDark } = useTheme();
    const divisionId = useDashboardStore(s => s.divisionId);
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<any>(null);
    const [selectedZone, setSelectedZone] = useState<any>(null);
    
    const [startDate] = useState(() => format(subDays(new Date(), 14), 'yyyy-MM-dd'));
    const [endDate] = useState(() => format(new Date(), 'yyyy-MM-dd'));

    const fetchData = async () => {
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
        fetchData();
    }, [divisionId]);

    // 🚀 Optimization: Memoized sorting
    const sortedZones = useMemo(() => {
        if (!data?.zones) return [];
        return [...data.zones].sort((a,b) => b.orders - a.orders);
    }, [data?.zones]);

    if (loading && !data) return (
        <div className="flex flex-col items-center justify-center p-32 space-y-8 animate-pulse text-center">
            <div className="w-16 h-16 bg-emerald-500 rounded-3xl animate-spin shadow-2xl shadow-emerald-500/20" />
            <p className="text-xl font-black uppercase tracking-[0.5em] opacity-30 italic">ФИЛЬТРАЦИЯ ФИНАНСОВ...</p>
        </div>
    );

    if (!data) return null;

    return (
        <div className="space-y-10">
            
            {/* Topline Metrics v8.0 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                    { label: 'Выручка (ГРН)', val: parseInt(data.summary.totalAmount).toLocaleString(), icon: BanknotesIcon, color: 'text-emerald-500' },
                    { label: 'КПД Средний', val: data.summary.avgEfficiency, icon: BoltIcon, color: 'text-blue-500' },
                    { label: 'SLA', val: `${data.summary.onTimeRate}%`, icon: ClockIcon, color: 'text-purple-500' },
                    { label: '₴ / КМ', val: `${data.summary.revenuePerKm} ₴`, icon: CurrencyDollarIcon, color: 'text-amber-500' },
                ].map((m, i) => (
                    <div key={i} className={clsx(
                        "p-8 rounded-[3.5rem] border-2 shadow-lg flex flex-col items-center group transition-all text-center",
                        isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"
                    )}>
                        <div className="p-4 bg-gray-500/5 rounded-full mb-4"><m.icon className={clsx("w-8 h-8", m.color)} /></div>
                        <h4 className="text-3xl font-black tabular-nums tracking-tighter italic">{m.val}</h4>
                        <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-30 mt-2">{m.label}</p>
                    </div>
                ))}
            </div>

            {/* Drill-Down Panel (Optimized) */}
            {selectedZone && (
                <div className={clsx(
                    "p-10 rounded-[4rem] border-2 shadow-2xl relative overflow-hidden animate-in zoom-in-95 duration-300",
                    isDark ? "bg-gray-900 border-gray-800" : "bg-blue-50 border-blue-100"
                )}>
                    <button onClick={() => setSelectedZone(null)} className="absolute top-8 right-8 p-3 bg-red-500/10 text-red-500 rounded-full hover:bg-red-500/20">
                        <XMarkIcon className="w-6 h-6" />
                    </button>

                    <div className="flex items-center gap-8 mb-10">
                        <div className="w-16 h-16 rounded-[1.5rem] bg-blue-500 flex items-center justify-center text-2xl font-black text-white shadow-xl">
                            {selectedZone.name.slice(0, 2)}
                        </div>
                        <div>
                            <h2 className="text-4xl font-black uppercase tracking-tighter italic leading-none">{selectedZone.name}</h2>
                            <p className="text-[10px] font-black uppercase opacity-40 mt-2 tracking-[0.4em]">Секторальный аудит</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                        <div className="p-6 bg-black/5 rounded-[2.5rem]">
                            <h4 className="text-[9px] font-black uppercase opacity-40 mb-5 italic">Лидеры зоны</h4>
                            <div className="space-y-3">
                                {selectedZone.topCouriers?.map((c: any, i: number) => (
                                    <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                                        <div className="flex items-center gap-3">
                                            <UserCircleIcon className="w-5 h-5 text-blue-500" />
                                            <span className="font-black text-[10px] uppercase">{c.name}</span>
                                        </div>
                                        <span className="text-lg font-black">{c.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="xl:col-span-2 p-6 bg-black/5 rounded-[2.5rem]">
                             <h4 className="text-[9px] font-black uppercase opacity-40 mb-5 italic">Нагрузка по часам</h4>
                            <div className="h-[180px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={selectedZone.hourly.map((c:any, h:number) => ({ hour: h, count: c }))}>
                                        <Bar dataKey="count" fill="#3b82f6" radius={[6, 6, 0, 0]} isAnimationActive={false} />
                                        <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} isAnimationActive={false} />
                                        <XAxis dataKey="hour" hide />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Zone Leaderboard (Optimized Table) */}
            <div className={clsx(
                "p-10 rounded-[4rem] border-2 shadow-xl overflow-hidden",
                isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"
            )}>
                 <h3 className="text-2xl font-black uppercase tracking-tighter italic leading-none mb-10">Финансовый аудит зон</h3>
                 <div className="overflow-x-auto min-h-[300px]">
                    <table className="w-full">
                        <thead className="sticky top-0 bg-inherit z-10">
                            <tr className="text-left border-b border-gray-500/10">
                                <th className="pb-6 text-[10px] font-black uppercase opacity-40">Зона</th>
                                <th className="pb-6 text-[10px] font-black uppercase opacity-40 text-center">Выручка</th>
                                <th className="pb-6 text-[10px] font-black uppercase opacity-40 text-center">Заказы</th>
                                <th className="pb-6 text-[10px] font-black uppercase opacity-40 text-center">Ср. Чек</th>
                                <th className="pb-6 text-[10px] font-black uppercase opacity-40 text-center">SLA</th>
                                <th className="pb-6 text-[10px] font-black uppercase opacity-40 text-right pr-4">Доля</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-500/5">
                            {sortedZones.map((z: any, i: number) => (
                                <ZoneRow key={i} z={z} i={i} data={data} onSelect={setSelectedZone} isDark={isDark} />
                            ))}
                        </tbody>
                    </table>
                 </div>
            </div>

            {/* Matrix & Scatter (Optimized) */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                 <div className={clsx(
                    "p-10 rounded-[4.5rem] border-2 shadow-xl",
                    isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"
                 )}>
                    <h3 className="text-2xl font-black tracking-tighter uppercase italic mb-8">Матрица Заказов</h3>
                    <div className="space-y-1">
                         {data.heatmap.map((row: any, dIdx: number) => (
                             <div key={dIdx} className="flex items-center gap-2 h-6">
                                <div className="w-8 text-[8px] font-black opacity-20 uppercase">{['Вс','Пн','Вт','Ср','Чт','Пт','Сб'][dIdx]}</div>
                                <div className="flex-1 flex gap-1 h-full">
                                    {row.map((val: number, hIdx: number) => {
                                        const opacity = val / (Math.max(...row, 1));
                                        return (
                                            <div 
                                                key={hIdx} 
                                                className="flex-1 rounded-[2px] transition-all"
                                                style={{ backgroundColor: `rgba(249, 115, 22, ${Math.max(0.04, opacity)})` }}
                                            />
                                        )
                                    })}
                                </div>
                             </div>
                         ))}
                    </div>
                 </div>

                 <div className={clsx(
                    "p-10 rounded-[4.5rem] border-2 shadow-xl",
                    isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"
                 )}>
                    <h3 className="text-2xl font-black tracking-tighter uppercase italic mb-8">Динамика Дистанция / Оборот</h3>
                    <div className="h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart>
                                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.1} />
                                <XAxis type="number" dataKey="totalDistance" name="КМ" axisLine={false} tick={{fontSize: 8, fontWeight: 900}} />
                                <YAxis type="number" dataKey="revenue" name="₴" axisLine={false} tick={{fontSize: 8, fontWeight: 900}} />
                                <Tooltip cursor={{ strokeDasharray: '3 3' }} isAnimationActive={false} />
                                <Scatter data={data.couriers} isAnimationActive={false}>
                                    {data.couriers.map((_:any, index:number) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Scatter>
                            </ScatterChart>
                        </ResponsiveContainer>
                    </div>
                 </div>
            </div>

        </div>
    );
};
