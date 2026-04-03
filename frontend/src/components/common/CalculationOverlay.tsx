import { clsx } from 'clsx';
import { useCalculationProgress } from '../../store/calculationProgressStore';
import { ArrowPathIcon, MapIcon } from '@heroicons/react/24/outline';

export const CalculationOverlay = ({ isDark }: { isDark: boolean }) => {
  const { progress, message } = useCalculationProgress();

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/40 transition-all duration-300">
      <div className={clsx(
        "p-10 rounded-[3rem] shadow-2xl flex flex-col items-center gap-6 animate-in zoom-in-90 duration-300",
        isDark ? "bg-gray-900 border border-white/10" : "bg-white border border-gray-100"
      )}>
        <div className="relative">
          <div className="w-20 h-20 rounded-3xl bg-blue-500/10 flex items-center justify-center">
            <ArrowPathIcon className="w-10 h-10 text-blue-500 animate-spin" />
          </div>
          <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-xl bg-purple-500 flex items-center justify-center shadow-lg">
            <MapIcon className="w-4 h-4 text-white" />
          </div>
        </div>
        <div className="text-center">
          <h3 className={clsx("text-2xl font-black mb-1", isDark ? "text-white" : "text-gray-900")}>Расчет...</h3>
          <p className={clsx("text-xs font-bold opacity-60 uppercase tracking-widest", isDark ? "text-blue-400" : "text-blue-600")}>
            {message || 'Оптимизация маршрута'}
          </p>
        </div>
        <div className="w-full max-w-[240px] mt-2">
          <div className="flex justify-between items-center mb-2 px-1">
            <span className={clsx("text-[10px] font-black uppercase tracking-widest", isDark ? "text-blue-400" : "text-blue-600")}>
              Загрузка
            </span>
            <span className={clsx("text-[10px] font-black tracking-tighter", isDark ? "text-white" : "text-gray-900")}>
              {progress}%
            </span>
          </div>
          <div className={clsx(
            "h-2 w-full rounded-full overflow-hidden relative",
            isDark ? "bg-white/5" : "bg-gray-100"
          )}>
            <div 
              className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500 transition-all duration-500 ease-out relative"
              style={{ width: `${progress}%`, willChange: 'width' }}
            >
              <div className="absolute inset-0 bg-white/20 animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
