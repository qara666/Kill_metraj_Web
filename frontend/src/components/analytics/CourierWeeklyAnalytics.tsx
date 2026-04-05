import React, { useState, useEffect, useMemo } from 'react';
import { 
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    Cell
} from 'recharts';
import { 
    CalendarIcon, 
    UserGroupIcon, 
    ArrowTrendingUpIcon, 
    TrophyIcon,
    ExclamationTriangleIcon,
    TruckIcon
} from '@heroicons/react/24/outline';
import { useTheme } from '../../contexts/ThemeContext';
import { useDashboardStore } from '../../stores/useDashboardStore';
import { clsx } from 'clsx';
import { toast } from 'react-hot-toast';

interface CourierMetric {
    name: string;
    totalOrders: number;
    totalDistanceKm: number;
    totalCalculatedOrders: number;
    daysWorked: number;
    avgOrdersPerDay: number;
    avgDistancePerOrder: number;
    efficiencyScore: number;
    vehicleType: string;
}

export const CourierWeeklyAnalytics: React.FC = () => {
    const { isDark } = useTheme();
    const divisionId = useDashboardStore(s => s.divisionId);
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<CourierMetric[]>([]);
    
    // Default to last 7 days
    const [startDate, setStartDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d.toISOString().split('T')[0];
    });
    const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

    const fetchAnalytics = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('km_access_token');
            const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
            const res = await fetch(`${baseUrl}/api/v1/dashboard/analytics/couriers?startDate=${startDate}&endDate=${endDate}&divisionId=${divisionId || 'all'}`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const result = await res.json();
            if (result.success) {
                setData(result.couriers);
            } else {
                toast.error(result.error || 'Ошибка загрузки аналитики');
            }
        } catch (err) {
            console.error(err);
            toast.error('Сетевая ошибка при загрузке аналитики');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAnalytics();
    }, [startDate, endDate, divisionId]);

    const bestCouriers = useMemo(() => [...data].sort((a, b) => b.totalOrders - a.totalOrders).slice(0, 5), [data]);
    const mostEfficient = useMemo(() => [...data].sort((a, b) => Number(b.efficiencyScore) - Number(a.efficiencyScore)).slice(0, 5), [data]);

    if (loading && data.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-20 space-y-4">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <p className={clsx("text-lg font-bold", isDark ? "text-gray-400" : "text-gray-500")}>Анализируем эффективность курьеров...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Filter Bar */}
            <div className={clsx(
                "p-6 rounded-[2rem] border-2 flex flex-wrap items-center gap-6 shadow-xl relative overflow-hidden",
                isDark ? "bg-gray-900/40 border-gray-800" : "bg-white border-gray-100"
            )}>
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-500/10 rounded-2xl">
                        <CalendarIcon className="w-6 h-6 text-blue-500" />
                    </div>
                    <div>
                        <p className={clsx("text-[10px] font-black uppercase tracking-widest opacity-50")}>Период анализа</p>
                        <div className="flex items-center gap-2 mt-1">
                            <input 
                                type="date" 
                                value={startDate} 
                                onChange={(e) => setStartDate(e.target.value)}
                                className={clsx(
                                    "bg-transparent border-none p-0 font-bold focus:ring-0",
                                    isDark ? "text-white" : "text-gray-900"
                                )}
                            />
                            <span className="opacity-30">—</span>
                            <input 
                                type="date" 
                                value={endDate} 
                                onChange={(e) => setEndDate(e.target.value)}
                                className={clsx(
                                    "bg-transparent border-none p-0 font-bold focus:ring-0",
                                    isDark ? "text-white" : "text-gray-900"
                                )}
                            />
                        </div>
                    </div>
                </div>

                <div className="h-10 w-px bg-gray-500/10 hidden md:block"></div>

                <div className="flex items-center gap-3">
                    <div className="p-3 bg-emerald-500/10 rounded-2xl">
                        <UserGroupIcon className="w-6 h-6 text-emerald-500" />
                    </div>
                    <div>
                        <p className={clsx("text-[10px] font-black uppercase tracking-widest opacity-50")}>Всего курьеров</p>
                        <p className="text-xl font-black">{data.length}</p>
                    </div>
                </div>

                <button 
                  onClick={fetchAnalytics}
                  className={clsx(
                    "ml-auto px-6 py-3 rounded-2xl font-black uppercase tracking-[0.1em] text-sm transition-all",
                    isDark ? "bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/20" : "bg-blue-500 hover:bg-blue-600 text-white shadow-lg shadow-blue-200"
                  )}
                >
                  Обновить
                </button>
            </div>

            {data.length === 0 ? (
                <div className={clsx(
                  "p-20 rounded-[3rem] border-4 border-dotted flex flex-col items-center justify-center text-center",
                  isDark ? "bg-gray-900/20 border-gray-800" : "bg-gray-50 border-gray-100"
                )}>
                    <ExclamationTriangleIcon className="w-16 h-16 text-amber-500 opacity-20 mb-4" />
                    <h3 className="text-xl font-black opacity-40">Нет данных для анализа</h3>
                    <p className="max-w-md mt-2 opacity-30 text-sm">Попробуйте выбрать другой период или убедитесь, что за эти даты были загружены данные из ФастОператора.</p>
                </div>
            ) : (
                <>
                    {/* Charts Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        {/* Orders Chart */}
                        <div className={clsx(
                            "p-8 rounded-[3rem] border-2 shadow-2xl relative overflow-hidden",
                            isDark ? "bg-gray-900/60 border-gray-800" : "bg-white border-gray-100"
                        )}>
                            <div className="flex items-center justify-between mb-8">
                                <div className="flex items-center gap-4">
                                    <div className="p-4 bg-indigo-500/10 rounded-[1.5rem]">
                                        <ArrowTrendingUpIcon className="w-6 h-6 text-indigo-500" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black">Объем заказов</h3>
                                        <p className="text-xs font-bold opacity-40 uppercase tracking-widest">Топ-10 по количеству</p>
                                    </div>
                                </div>
                            </div>

                            <div className="h-[400px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={[...data].slice(0, 10)} layout="vertical" margin={{ left: 40 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={isDark ? '#334155' : '#e2e8f0'} />
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="name" type="category" width={100} axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 800, fill: isDark ? '#94a3b8' : '#64748b' }} />
                                        <Tooltip 
                                            cursor={{ fill: isDark ? '#1e293b' : '#f8fafc' }}
                                            contentStyle={{ 
                                                backgroundColor: isDark ? '#0f172a' : '#fff', 
                                                border: 'none', 
                                                borderRadius: '20px', 
                                                boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                                                padding: '16px'
                                            }}
                                        />
                                        <Bar dataKey="totalOrders" radius={[0, 12, 12, 0]} barSize={24}>
                                            {data.slice(0, 10).map((_, index) => (
                                                <Cell key={`cell-${index}`} fill={index < 3 ? '#6366f1' : '#818cf8'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Efficiency Chart */}
                        <div className={clsx(
                            "p-8 rounded-[3rem] border-2 shadow-2xl relative overflow-hidden",
                            isDark ? "bg-gray-900/60 border-gray-800" : "bg-white border-gray-100"
                        )}>
                            <div className="flex items-center justify-between mb-8">
                                <div className="flex items-center gap-4">
                                    <div className="p-4 bg-emerald-500/10 rounded-[1.5rem]">
                                        <TrophyIcon className="w-6 h-6 text-emerald-500" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-black">Эффективность</h3>
                                        <p className="text-xs font-bold opacity-40 uppercase tracking-widest">Заказов на 1 км пробега</p>
                                    </div>
                                </div>
                            </div>

                            <div className="h-[400px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={[...data].sort((a,b) => Number(b.efficiencyScore) - Number(a.efficiencyScore)).slice(0, 10)} layout="vertical" margin={{ left: 40 }}>
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={isDark ? '#334155' : '#e2e8f0'} />
                                        <XAxis type="number" hide />
                                        <YAxis dataKey="name" type="category" width={100} axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 800, fill: isDark ? '#94a3b8' : '#64748b' }} />
                                        <Tooltip 
                                            cursor={{ fill: isDark ? '#1e293b' : '#f8fafc' }}
                                            contentStyle={{ 
                                                backgroundColor: isDark ? '#0f172a' : '#fff', 
                                                border: 'none', 
                                                borderRadius: '20px', 
                                                boxShadow: '0 20px 40px rgba(0,0,0,0.2)'
                                            }}
                                        />
                                        <Bar dataKey="efficiencyScore" radius={[0, 12, 12, 0]} barSize={24}>
                                            {data.slice(0, 10).map((_, index) => (
                                                <Cell key={`cell-${index}`} fill={index < 3 ? '#10b981' : '#34d399'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Table View */}
                    <div className={clsx(
                        "rounded-[3rem] border-2 shadow-2xl overflow-hidden",
                        isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-100"
                    )}>
                        <div className="p-8 border-b border-gray-500/10 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <TruckIcon className="w-8 h-8 text-blue-500" />
                                <h3 className="text-2xl font-black">Детальный расчет по каждому курьеру</h3>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className={clsx("text-[11px] font-black uppercase tracking-widest", isDark ? "text-gray-500" : "text-gray-400")}>
                                        <th className="px-8 py-5">Курьер</th>
                                        <th className="px-6 py-5">Выходов</th>
                                        <th className="px-6 py-5">Заказов</th>
                                        <th className="px-6 py-5">Пробег (км)</th>
                                        <th className="px-6 py-5">Заказов/день</th>
                                        <th className="px-6 py-5">Эфф-ть</th>
                                        <th className="px-8 py-5 text-right">Статус</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.map((courier, idx) => {
                                        const isElite = Number(courier.efficiencyScore) > 1.2;
                                        const isLow = Number(courier.efficiencyScore) < 0.3 && courier.totalOrders > 5;
                                        
                                        return (
                                            <tr key={idx} className={clsx(
                                                "border-t border-gray-500/5 transition-colors",
                                                isDark ? "hover:bg-white/5" : "hover:bg-slate-50"
                                            )}>
                                                <td className="px-8 py-6">
                                                    <div className="flex items-center gap-3">
                                                        <div className={clsx(
                                                            "w-10 h-10 rounded-2xl flex items-center justify-center font-black",
                                                            isDark ? "bg-gray-800" : "bg-gray-100"
                                                        )}>
                                                            {courier.name.charAt(0)}
                                                        </div>
                                                        <div>
                                                            <p className="font-bold">{courier.name}</p>
                                                            <p className="text-[10px] font-black uppercase tracking-widest opacity-30">{courier.vehicleType === 'car' ? 'Автомобиль' : 'Мотоцикл'}</p>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-6 font-black text-lg">{courier.daysWorked}</td>
                                                <td className="px-6 py-6 font-black text-lg">{courier.totalOrders}</td>
                                                <td className="px-6 py-6 font-bold opacity-60 tabular-nums">{courier.totalDistanceKm.toFixed(1)}</td>
                                                <td className="px-6 py-6">
                                                    <div className="bg-blue-500/10 text-blue-500 px-3 py-1 rounded-full text-xs font-black w-fit">
                                                        {courier.avgOrdersPerDay}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-6">
                                                    <div className={clsx(
                                                        "px-3 py-1 rounded-full text-xs font-black w-fit",
                                                        isElite ? "bg-emerald-500/10 text-emerald-500" : 
                                                        isLow ? "bg-red-500/10 text-red-500" : "bg-gray-500/10 text-gray-400"
                                                    )}>
                                                        {courier.efficiencyScore}
                                                    </div>
                                                </td>
                                                <td className="px-8 py-6 text-right">
                                                    {isElite && <span title="Высокая эффективность" className="text-amber-500 text-xl">🏆</span>}
                                                    {isLow && <span title="Низкая плотность заказов" className="text-red-500 text-xl">⚠️</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
