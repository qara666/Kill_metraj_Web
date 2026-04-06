import React, { useState, useEffect, useMemo } from 'react';
import { 
    ScatterChart, Scatter, ZAxis, Cell, ResponsiveContainer, 
    CartesianGrid, XAxis, YAxis, Tooltip
} from 'recharts';
import { 
    TrophyIcon, 
    ClockIcon,
    BoltIcon,
    UserGroupIcon,
    MagnifyingGlassIcon
} from '@heroicons/react/24/outline';
import { useTheme } from '../../contexts/ThemeContext';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { clsx } from 'clsx';
import { format, subDays } from 'date-fns';

export const CourierDeepAnalytics: React.FC = () => {
    const { isDark } = useTheme();
    const divisionId = useDashboardStore(s => s.divisionId);
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState<'efficiency' | 'totalOrders' | 'avgTime' | 'successRate'>('efficiency');

    // Dates for fetching (last 30 days)
    const startDate = format(subDays(new Date(), 30), 'yyyy-MM-dd');
    const endDate = format(new Date(), 'yyyy-MM-dd');

    useEffect(() => {
        const fetchAnalytics = async () => {
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
        fetchAnalytics();
    }, [divisionId]);

    const filteredCouriers = useMemo(() => {
        if (!data?.couriers) return [];
        return data.couriers
            .filter((c: any) => c.name.toLowerCase().includes(search.toLowerCase()))
            .sort((a: any, b: any) => {
                const valA = parseFloat(a[sortBy]);
                const valB = parseFloat(b[sortBy]);
                return valB - valA;
            });
    }, [data, search, sortBy]);

    const topThree = useMemo(() => {
        if (!data?.couriers || data.couriers.length === 0) return null;
        const sorted = [...data.couriers].sort((a: any, b: any) => parseFloat(b.efficiency) - parseFloat(a.efficiency));
        return {
            efficient: sorted[0],
            volume: [...data.couriers].sort((a: any, b: any) => b.totalOrders - a.totalOrders)[0],
            fastest: [...data.couriers].sort((a: any, b: any) => (parseFloat(a.avgTime) || 999) - (parseFloat(b.avgTime) || 999))[0]
        };
    }, [data]);

    if (loading && !data) return <div className="p-32 text-center animate-pulse text-2xl font-black uppercase tracking-widest opacity-20">Сравнение персонажа...</div>;
    if (!data || !topThree) return null;

    return (
        <div className="space-y-12 animate-in fade-in duration-700 pb-20">
            
            {/* Legend / Badges v5.250 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                 {[
                    { label: 'Мастер Плотности', courier: topThree.efficient, icon: TrophyIcon, color: 'text-amber-500', bg: 'bg-amber-500/10', metric: `${topThree.efficient?.efficiency} зак/км` },
                    { label: 'Лидер Объема', courier: topThree.volume, icon: BoltIcon, color: 'text-blue-500', bg: 'bg-blue-500/10', metric: `${topThree.volume?.totalOrders} заказов` },
                    { label: 'Скоростной Демон', courier: topThree.fastest, icon: ClockIcon, color: 'text-emerald-500', bg: 'bg-emerald-500/10', metric: `${topThree.fastest?.avgTime}м / за заказе` },
                 ].map((badge, i) => (
                    <div key={i} className={clsx(
                        "p-8 rounded-[3.5rem] border-2 shadow-xl flex items-center gap-6",
                        isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"
                    )}>
                        <div className={clsx("p-5 rounded-[2rem] shadow-inner", badge.bg)}><badge.icon className={clsx("w-10 h-10", badge.color)} /></div>
                        <div>
                            <p className="text-[9px] font-black uppercase tracking-widest opacity-40">{badge.label}</p>
                            <h4 className="text-lg font-black truncate max-w-[150px]">{badge.courier?.name}</h4>
                            <p className={clsx("text-xs font-black", badge.color)}>{badge.metric}</p>
                        </div>
                    </div>
                 ))}
            </div>

            {/* Scatter Correlation Upgrade v5.255 */}
            <div className={clsx(
                "p-12 rounded-[5rem] border-2 shadow-2xl overflow-hidden relative",
                isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"
            )}>
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-6">
                    <div>
                        <h3 className="text-4xl font-black tracking-tighter">Сравнение курьеров</h3>
                        <p className="text-xs font-bold opacity-30 uppercase mt-1 tracking-[0.2em]">Пробег (X) vs Объём (Y) vs Эффективность (Размер)</p>
                    </div>
                </div>

                <div className="h-[500px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 20, right: 30, bottom: 20, left: 10 }}>
                            <CartesianGrid strokeDasharray="10 10" stroke={isDark ? '#334155' : '#e2e8f0'} />
                            <XAxis type="number" dataKey="totalDistance" name="Distance" unit=" км" tick={{ fill: '#64748b', fontSize: 11, fontWeight: 900 }} axisLine={false} />
                            <YAxis type="number" dataKey="totalOrders" name="Orders" unit=" закс" tick={{ fill: '#64748b', fontSize: 11, fontWeight: 900 }} axisLine={false} />
                            <ZAxis type="number" dataKey="efficiency" range={[100, 1000]} name="Eff" />
                            <Tooltip cursor={{ strokeDasharray: '3 3' }} content={({ payload }) => {
                                if (payload && payload.length) {
                                    const c = payload[0].payload;
                                    return (
                                        <div className={clsx("p-6 rounded-[2rem] shadow-2xl border-2", isDark ? "bg-slate-900 border-slate-800" : "bg-white border-gray-100")}>
                                            <p className="font-black text-xl mb-3">{c.name}</p>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div><p className="text-[10px] uppercase opacity-40 font-black">Заказов</p><p className="font-black">{c.totalOrders}</p></div>
                                                <div><p className="text-[10px] uppercase opacity-40 font-black">КПД</p><p className="font-black text-emerald-500">{c.efficiency}</p></div>
                                                <div><p className="text-[10px] uppercase opacity-40 font-black">Пробег</p><p className="font-black">{c.totalDistance}км</p></div>
                                                <div><p className="text-[10px] uppercase opacity-40 font-black">Время</p><p className="font-black">{c.avgTime}м</p></div>
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            }} />
                            <Scatter name="Teams" data={data.couriers}>
                                {data.couriers.map((entry: any, index: number) => (
                                    <Cell key={`cell-${index}`} fill={parseFloat(entry.efficiency) > 1.2 ? '#10b981' : (parseFloat(entry.efficiency) < 0.7 ? '#ef4444' : '#3b82f6')} strokeWidth={3} stroke="#fff" />
                                ))}
                            </Scatter>
                        </ScatterChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Deep Comparison Table / Rankings v5.260 */}
            <div className={clsx(
                "p-12 rounded-[5rem] border-2 shadow-2xl overflow-hidden",
                isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"
            )}>
                 <div className="flex flex-col xl:flex-row xl:items-center justify-between mb-12 gap-8">
                    <div className="flex items-center gap-6">
                        <div className="p-5 bg-blue-500/10 rounded-[2.5rem]"><UserGroupIcon className="w-10 h-10 text-blue-500" /></div>
                        <h3 className="text-4xl font-black tracking-tighter uppercase italic">Арена курьеров</h3>
                    </div>

                    <div className="flex flex-wrap gap-4">
                         <div className={clsx("flex items-center gap-3 px-6 py-4 rounded-3xl border-2 transition-all", isDark ? "bg-gray-800/50 border-gray-700" : "bg-gray-50 border-gray-200")}>
                            <MagnifyingGlassIcon className="w-5 h-5 opacity-40" />
                            <input 
                                type="text" 
                                placeholder="Поиск по имени..." 
                                value={search} 
                                onChange={(e) => setSearch(e.target.value)}
                                className="bg-transparent border-none p-0 focus:ring-0 text-sm font-black uppercase tracking-widest placeholder:opacity-40"
                            />
                         </div>
                         <div className="flex items-center gap-2">
                            <p className="text-[10px] font-black uppercase opacity-40 mr-2">Сортировка:</p>
                            {['efficiency', 'totalOrders', 'avgTime', 'successRate'].map((key) => (
                                <button 
                                    key={key}
                                    onClick={() => setSortBy(key as any)}
                                    className={clsx(
                                        "px-6 py-4 rounded-3xl text-[10px] font-black uppercase tracking-widest transition-all",
                                        sortBy === key ? "bg-blue-600 text-white shadow-lg" : (isDark ? "bg-white/5 hover:bg-white/10" : "bg-gray-100 hover:bg-gray-200")
                                    )}
                                >
                                    {key === 'efficiency' ? 'КПД' : key === 'totalOrders' ? 'Заказы' : key === 'avgTime' ? 'Время' : 'Успех'}
                                </button>
                            ))}
                         </div>
                    </div>
                 </div>

                 <div className="overflow-x-auto">
                    <table className="w-full text-left border-separate border-spacing-y-4">
                        <thead>
                            <tr className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40">
                                <th className="px-8 pb-4">Ранг</th>
                                <th className="px-8 pb-4">Курьер</th>
                                <th className="px-8 pb-4 text-center text-blue-500">Заказы</th>
                                <th className="px-8 pb-4 text-center">Пробег/КПД</th>
                                <th className="px-8 pb-4 text-center text-emerald-500">Пунктуальность</th>
                                <th className="px-8 pb-4 text-center">Время Дост. 🎉</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredCouriers.map((c: any, idx: number) => (
                                <tr key={c.name} className={clsx(
                                    "group transition-all hover:scale-[1.01]",
                                    isDark ? "hover:bg-white/5" : "hover:bg-gray-50"
                                )}>
                                    <td className="px-8 py-6 rounded-l-[2.5rem]">
                                        <div className={clsx(
                                            "w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg shadow-inner",
                                            idx === 0 ? "bg-amber-500 text-white" : (idx === 1 ? "bg-slate-300 text-slate-700" : (idx === 2 ? "bg-orange-300 text-orange-900" : "bg-gray-500/10 opacity-40"))
                                        )}>
                                            {idx + 1}
                                        </div>
                                    </td>
                                    <td className="px-8 py-6">
                                        <h4 className="font-black text-lg">{c.name}</h4>
                                        <p className="text-[9px] font-black uppercase opacity-20 tracking-widest">{c.daysWorked} активных дней</p>
                                    </td>
                                    <td className="px-8 py-6 text-center tabular-nums">
                                        <span className="text-2xl font-black">{c.totalOrders}</span>
                                    </td>
                                    <td className="px-8 py-6">
                                        <div className="flex flex-col items-center gap-1">
                                            <span className="text-lg font-black">{c.totalDistance}км</span>
                                            <div className="px-3 py-1 bg-emerald-500/10 text-emerald-500 text-[10px] font-black rounded-full tabular-nums">{c.efficiency} зак/км</div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-center">
                                        <div className="flex flex-col items-center">
                                            <div className="w-24 h-2 rounded-full bg-gray-500/10 overflow-hidden mb-2">
                                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${c.onTimeRate}%` }}></div>
                                            </div>
                                            <span className="text-xs font-black text-emerald-500">{c.onTimeRate}%</span>
                                        </div>
                                    </td>
                                    <td className="px-8 py-6 text-center rounded-r-[2.5rem]">
                                        <div className="flex flex-col items-center gap-1">
                                            <span className="text-xl font-black">{c.avgTime}м</span>
                                            <span className="text-[8px] font-black uppercase opacity-30">в среднем</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                 </div>
            </div>
        </div>
    );
};
