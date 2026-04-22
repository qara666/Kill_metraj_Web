import { clsx } from 'clsx';
import { useCalculationProgress } from '../../store/calculationProgressStore';
import { ArrowPathIcon, CpuChipIcon, BoltIcon } from '@heroicons/react/24/outline';
import React from 'react';

/**
 * calculationOverlay v5.70 [Quantum Elite Edition]
 * Optimized for low-end hardware: uses GPU-accelerated transforms and avoids layout thrashing.
 * Shows more detailed status to indicate active calculation.
 */
export const CalculationOverlay = React.memo(({ isDark }: { isDark: boolean }) => {
  const { progress, message } = useCalculationProgress();

  if (progress === 0 && !message) return null;

  // Determine status text based on progress
  const getStatusText = () => {
    if (message) return message;
    if (progress < 20) return 'ГЕОКОДИНГ АДРЕСОВ...';
    if (progress < 50) return 'ПОСТРОЕНИЕ МАРШРУТОВ...';
    if (progress < 80) return 'ОПТИМИЗАЦИЯ ПОРЯДКА...';
    if (progress < 95) return 'ФИНАЛИЗАЦИЯ...';
    return 'ГОТОВО!';
  };

  const getSubStatusText = () => {
    if (progress < 20) return 'Определение координат всех адресов';
    if (progress < 50) return 'Расчет расстояний между точками';
    if (progress < 80) return 'Оптимальная сортировка заказов';
    if (progress < 95) return 'Сохранение результатов';
    return 'Данные обновлены';
  };

  return (
    <div className="fixed inset-0 z-[10000] flex flex-col items-center justify-center pointer-events-auto overflow-hidden">
      {/* Backdrop: Use blur only if hardware allows, otherwise solid. Optimized for weak PCs. */}
      <div className="absolute inset-0 bg-black/60" />
      
      {/* Premium Glass Container */}
      <div className={clsx(
        "relative p-12 rounded-[4rem] shadow-2xl flex flex-col items-center gap-8 border-2 transition-all duration-500 scale-100 transform-gpu",
        isDark 
          ? "bg-gray-900/80 border-white/10 shadow-blue-900/20" 
          : "bg-white/90 border-gray-100 shadow-blue-500/10"
      )}>
        
        {/* Animated Core Icon */}
        <div className="relative group">
          <div className={clsx(
            "w-32 h-32 rounded-[3rem] flex items-center justify-center shadow-xl border-4",
            progress < 100 
              ? "bg-gradient-to-tr from-blue-500 to-indigo-600 animate-pulse-slow" 
              : "bg-gradient-to-tr from-green-500 to-emerald-600"
          )}>
            {progress < 100 ? (
              <ArrowPathIcon className="w-16 h-16 text-white animate-spin" />
            ) : (
              <BoltIcon className="w-16 h-16 text-white" />
            )}
          </div>
          <div className="absolute -bottom-3 -right-3 w-12 h-12 rounded-2xl bg-purple-600 flex items-center justify-center shadow-lg border-4 border-white/10">
            <CpuChipIcon className="w-6 h-6 text-white" />
          </div>
        </div>

        {/* Textual Content */}
        <div className="text-center">
          <h3 className={clsx(
            "text-4xl font-black mb-2 tracking-tighter", 
            isDark ? "text-white" : "text-gray-900"
          )}>
            {progress < 100 ? 'ИДЕТ РАСЧЕТ...' : 'ГОТОВО!'}
          </h3>
          <p className={clsx(
            "text-xs font-bold uppercase tracking-[0.3em] px-6 py-2 rounded-full border mb-1",
            isDark ? "text-blue-300 bg-blue-500/10 border-blue-500/30" : "text-blue-600 bg-blue-50 border-blue-200"
          )}>
            {getStatusText()}
          </p>
        </div>

        {/* Informative Progress System */}
        <div className="w-full min-w-[320px]">
          <div className="flex justify-between items-end mb-3 px-1">
            <div className="flex flex-col">
              <span className={clsx(
                "text-[10px] font-black uppercase tracking-widest opacity-40",
                isDark ? "text-white" : "text-gray-900"
              )}>
                Статус расчета
              </span>
              <span className={clsx(
                "text-xs font-bold tracking-widest",
                isDark ? "text-blue-300" : "text-blue-700"
              )}>
                {getSubStatusText()}
              </span>
            </div>
            
            {/* Massive Percentage Display */}
            <div className="flex items-baseline gap-1">
              <span className={clsx(
                "text-4xl font-black tracking-tighter transition-all tabular-nums",
                isDark ? "text-white" : "text-gray-900"
              )}>
                {progress}
              </span>
              <span className={clsx(
                "text-lg font-black opacity-30",
                isDark ? "text-white" : "text-gray-900"
              )}>%</span>
            </div>
          </div>

          {/* Progress Bar with Internal Glow */}
          <div className={clsx(
            "h-6 w-full rounded-full overflow-hidden p-1 border",
            isDark ? "bg-white/5 border-white/5" : "bg-gray-100 border-gray-200"
          )}>
            <div 
              className={clsx(
                "h-full rounded-full transition-all duration-300 ease-out relative overflow-hidden",
                progress < 100 
                  ? "bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-600" 
                  : "bg-gradient-to-r from-green-500 to-emerald-600"
              )}
              style={{ width: `${progress}%`, willChange: 'width' }}
            >
              {/* Dynamic Shine Layer */}
              <div className="absolute inset-0 bg-white/30 animate-pulse-fast" />
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-white/50" />
            </div>
          </div>
          
          <p className={clsx(
            "mt-6 text-[10px] text-center font-bold uppercase tracking-[0.2em]",
            isDark ? "text-gray-400" : "text-gray-500"
          )}>
            {progress < 100 ? '⏳ Не закрывайте окно до завершения расчета' : '✓ Данные успешно обновлены'}
          </p>
        </div>
      </div>
      
      {/* Global Style for the slower/faster animations */}
      <style>{`
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin {
          animation: spin-slow 1.5s linear infinite;
        }
        @keyframes pulse-slow {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.02); }
        }
        .animate-pulse-slow {
          animation: pulse-slow 2s ease-in-out infinite;
        }
        @keyframes pulse-fast {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 0.6; }
        }
        .animate-pulse-fast {
          animation: pulse-fast 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
        }
      `}</style>
    </div>
  );
});
