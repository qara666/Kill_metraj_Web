import React, { useMemo } from 'react';
import { clsx } from 'clsx';
import { 
  XMarkIcon, 
  ArrowTrendingUpIcon, 
  UserGroupIcon,
  CurrencyDollarIcon,
  BoltIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';
import { localStorageUtils } from '../../utils/ui/localStorage';

// v8.1: KPI ELITE ANALYSIS HUB (RU)
// Замена 'Юнит' на 'Курьер', валюта ГРИВНЫ (₴), Рейтинг курьера

interface KpiAnalysisModalProps {
  courier: any;
  allCouriers: any[];
  isDark: boolean;
  onClose: () => void;
}

export const KpiAnalysisModal: React.FC<KpiAnalysisModalProps> = ({ 
  courier, 
  allCouriers, 
  isDark, 
  onClose
}) => {
  const settings = useMemo(() => localStorageUtils.getCourierSettings()[courier.name] || {}, [courier.name]);
  const targetKm = settings.targetKmPerOrder || 5.0;
  
  const courierStats = useMemo(() => {
    const dist = courier.totalDistance || 0;
    const orders = courier.orders || 1;
    const actual = dist / orders;
    const eff = Math.min(150, Math.round((targetKm / (actual || 1)) * 100));
    return { actual, eff, dist, orders };
  }, [courier, targetKm]);

  const fleetMetrics = useMemo(() => {
    const valid = allCouriers.filter(c => c.totalDistance > 0 && c.orders > 0);
    if (valid.length === 0) return { avgEff: 100, rank: 1, total: 1 };
    
    const efficiencies = valid.map(c => {
      const s = localStorageUtils.getCourierSettings()[c.name] || {};
      const t = s.targetKmPerOrder || 5.0;
      const a = (c.totalDistance || 0) / (c.orders || 1);
      return Math.min(150, Math.round((t / (a || 1)) * 100));
    }).sort((a, b) => b - a);
    
    const avgEff = Math.round(efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length);
    const rank = efficiencies.indexOf(courierStats.eff) + 1;
    
    return { avgEff, rank, total: valid.length };
  }, [allCouriers, courierStats.eff]);

  const savingsPotential = useMemo(() => {
    const diffPerOrder = Math.max(0, courierStats.actual - targetKm);
    const totalKmExcess = diffPerOrder * courierStats.orders;
    const fuelPrice = 55; // Цена топлива в ГРИВНАХ
    const fuelConsumption = 10 / 100;
    return {
      km: Math.round(totalKmExcess),
      money: Math.round(totalKmExcess * fuelConsumption * fuelPrice)
    };
  }, [courierStats, targetKm]);

  const percentile = Math.round(((fleetMetrics.total - fleetMetrics.rank + 1) / fleetMetrics.total) * 100);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      
      <div className={clsx(
        "relative w-full max-w-3xl overflow-hidden rounded-[3rem] border-2 shadow-2xl flex flex-col max-h-[90vh] transition-all transform-gpu",
        isDark ? "bg-[#0a0d14] border-white/5 text-white" : "bg-white border-blue-100 text-gray-900"
      )}>
        <div className={clsx("p-10 border-b flex items-center justify-between relative", isDark ? "border-white/5" : "border-slate-100")}>
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-600 via-emerald-500 to-blue-600" />
          <div className="flex items-center gap-6">
            <div className={clsx("w-16 h-16 rounded-2xl flex items-center justify-center shadow-2xl", courierStats.eff >= 100 ? "bg-emerald-500/20 text-emerald-500" : "bg-blue-500/20 text-blue-500")}>
              <BoltIcon className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-3xl font-black uppercase tracking-tighter leading-none mb-2">{courier.name}</h2>
              <div className="flex items-center gap-3">
                 <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">АНАЛИЗ КПД</span>
                 {percentile >= 80 && (
                   <span className="px-2 py-0.5 rounded bg-emerald-500 text-white text-[8px] font-black tracking-widest uppercase">ТОП {100 - percentile}% ФЛОТА</span>
                 )}
              </div>
            </div>
          </div>
          <button onClick={onClose} className={clsx("p-4 rounded-3xl transition-all hover:scale-110", isDark ? "bg-white/5 text-gray-400 hover:text-white" : "bg-gray-100 text-gray-500")}>
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-10 space-y-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
             <div className={clsx(
               "p-8 rounded-[2.5rem] border relative overflow-hidden flex flex-col justify-center items-center text-center",
               isDark ? "bg-white/[0.02] border-white/5" : "bg-slate-50 border-slate-100"
             )}>
                <div className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-6 text-center">Эффективность курьера</div>
                <div className={clsx("text-8xl font-black tracking-tighter leading-none mb-2", courierStats.eff >= 100 ? "text-emerald-500" : "text-blue-500")}>
                   {courierStats.eff}%
                </div>
                <div className="text-xs font-black uppercase tracking-widest opacity-60">ИНДЕКС КПД</div>
                <svg className="absolute -bottom-10 -right-10 w-48 h-48 opacity-10 rotate-12" viewBox="0 0 100 100">
                   <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="10" strokeDasharray="283" strokeDashoffset={283 - (courierStats.eff / 100) * 283} />
                </svg>
             </div>

             <div className="space-y-6">
                <div className="flex items-center justify-between">
                   <div className="flex items-center gap-3">
                      <UserGroupIcon className="w-5 h-5 opacity-40" />
                      <span className="text-xs font-black uppercase tracking-widest opacity-40">Рейтинг курьера</span>
                   </div>
                   <span className="text-sm font-black">{fleetMetrics.rank} / {fleetMetrics.total}</span>
                </div>
                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                   <div className="h-full bg-blue-500 transition-all duration-1000" style={{ width: `${percentile}%` }} />
                </div>
                
                <div className="grid grid-cols-2 gap-4 mt-8">
                   <div className={clsx("p-6 rounded-3xl border", isDark ? "bg-white/5 border-white/5" : "bg-white border-slate-100 shadow-sm")}>
                      <div className="text-[9px] font-black opacity-30 uppercase tracking-widest mb-1">Средний КПД</div>
                      <div className="text-2xl font-black tracking-tight">{fleetMetrics.avgEff}%</div>
                   </div>
                   <div className={clsx("p-6 rounded-3xl border", isDark ? "bg-white/5 border-white/5" : "bg-white border-slate-100 shadow-sm")}>
                      <div className="text-[9px] font-black opacity-30 uppercase tracking-widest mb-1">Ваш Статус</div>
                      <div className={clsx("text-lg font-black uppercase", courierStats.eff > fleetMetrics.avgEff ? "text-emerald-500" : "text-amber-500")}>
                        {courierStats.eff > fleetMetrics.avgEff ? 'ВЫШЕ СРЕДНЕГО' : 'НИЖЕ СРЕДНЕГО'}
                      </div>
                   </div>
                </div>
             </div>
          </div>

          <div className="space-y-6">
             <div className="flex items-center gap-4">
                <CurrencyDollarIcon className="w-8 h-8 text-blue-500" />
                <h3 className="text-xl font-black uppercase tracking-tighter">Потенциал оптимизации</h3>
                <div className="flex-1 h-px bg-white/5" />
             </div>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                <div className={clsx(
                  "p-8 rounded-[2.5rem] border",
                  isDark ? "bg-blue-500/5 border-blue-500/10" : "bg-blue-50 border-blue-100 shadow-sm"
                )}>
                   <div className="flex items-center justify-between mb-4">
                      <div className="text-[10px] font-black uppercase tracking-widest opacity-40">Лишний пробег</div>
                      <ArrowTrendingUpIcon className="w-5 h-5 text-red-400" />
                   </div>
                   <div className="text-4xl font-black tracking-tighter mb-1">{savingsPotential.km} <span className="text-lg opacity-40">КМ</span></div>
                   <p className="text-[10px] font-medium opacity-50 uppercase tracking-widest">Перерасход относительно эталона {targetKm} км/зак</p>
                </div>

                <div className={clsx(
                  "p-8 rounded-[2.5rem] border",
                  isDark ? "bg-emerald-500/5 border-emerald-500/10" : "bg-emerald-50 border-emerald-100 shadow-sm"
                )}>
                   <div className="flex items-center justify-between mb-4">
                      <div className="text-[10px] font-black uppercase tracking-widest opacity-40">Экономия (топливо)</div>
                      <CurrencyDollarIcon className="w-5 h-5 text-emerald-500" />
                   </div>
                   <div className="text-4xl font-black tracking-tighter mb-1">{savingsPotential.money} <span className="text-lg opacity-40">₴</span></div>
                   <p className="text-[10px] font-medium opacity-50 uppercase tracking-widest">Потенциальная прибыль при достижении 100% КПД</p>
                </div>
             </div>
          </div>

          <div className={clsx(
            "p-10 rounded-[3rem] border flex flex-col md:flex-row gap-10 items-center",
            isDark ? "bg-white/[0.01] border-white/5" : "bg-slate-50 border-slate-100"
          )}>
             <div className="w-32 h-32 rounded-full border-8 border-emerald-500/20 flex items-center justify-center shrink-0">
                <ShieldCheckIcon className="w-12 h-12 text-emerald-500" />
             </div>
             <div>
                <h4 className="text-lg font-black uppercase tracking-tighter mb-2">Вердикт системы</h4>
                <p className="text-sm opacity-60 leading-relaxed font-medium">
                   {courierStats.eff >= 100 
                     ? 'ДАННЫЙ КУРЬЕР ДЕМОНСТРИРУЕТ ЭТАЛОННУЮ ЭФФЕКТИВНОСТЬ. МАРШРУТЫ ОПТИМИЗИРОВАНЫ, ПЕРЕРАСХОД ТОПЛИВА ОТСУТСТВУЕТ. РЕКОМЕНДОВАНО КЛОНИРОВАНИЕ МОДЕЛИ ДЛЯ ОСТАЛЬНОГО ФЛОТА.' 
                     : 'ВЫЯВЛЕНЫ ПОТЕРИ В ЭФФЕКТИВНОСТИ. РЕКОМЕНДУЕТСЯ ПЕРЕСМОТРЕТЬ ГЕОГРАФИЮ ЗАКАЗОВ ДЛЯ ДАННОГО КУРЬЕРА ИЛИ УВЕЛИЧИТЬ ПЛОТНОСТЬ МАРШРУТА. ПОТЕНЦИАЛ РОСТА: ' + (100 - courierStats.eff) + '%.'}
                </p>
             </div>
          </div>
        </div>

        <div className={clsx("p-10 border-t shrink-0 flex justify-end", isDark ? "border-white/5 bg-black/20" : "border-slate-100 bg-gray-50")}>
           <button onClick={onClose} className="px-12 py-5 rounded-2xl bg-blue-600 text-white text-[11px] font-black uppercase tracking-[0.2em] hover:bg-blue-500 hover:shadow-blue-500/30 transition-all shadow-2xl">
              Закрыть панель анализа
           </button>
        </div>
      </div>
    </div>
  );
};
