import * as React from 'react'
import { clsx } from 'clsx'
import { useTheme } from '../../contexts/ThemeContext'

interface DashboardHeaderProps {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  statusMetrics?: {
    label: string;
    value: string | number;
    color?: string;
  }[];
  actions?: React.ReactNode;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({ 
  icon: Icon, 
  title, 
  subtitle, 
  statusMetrics,
  actions 
}) => {
  const { isDark } = useTheme()

  const titleParts = title.split(' ')
  const mainTitle = titleParts.slice(0, -1).join(' ')
  const highlightedTitle = titleParts[titleParts.length - 1]

  return (
    <div className={clsx(
      'px-8 py-8 border-b-2 flex flex-col md:flex-row items-center justify-between gap-8 relative overflow-hidden mb-8 rounded-[3rem] mt-4 mx-4',
      isDark ? 'bg-[#05070a] border-white/[0.03] shadow-2xl shadow-black/80' : 'bg-white border-slate-100 shadow-xl shadow-slate-200/50'
    )}>
      {/* Dynamic Background Element */}
      <div className={clsx(
        "absolute -top-12 -right-12 w-64 h-64 rounded-full blur-[80px] pointer-events-none opacity-20",
        isDark ? "bg-blue-600" : "bg-blue-400"
      )}></div>
      
      <div className="flex items-center gap-8 relative z-10 w-full md:w-auto">
        <div className={clsx(
          'w-[84px] h-[84px] rounded-[30px] flex items-center justify-center border-2 transition-all duration-500 shrink-0 transform-gpu group-hover:scale-105',
          isDark 
            ? 'bg-blue-600/10 border-blue-500/20 text-blue-400 shadow-[0_0_30px_rgba(37,99,235,0.1)]' 
            : 'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100 text-[#3b82f6] shadow-md'
        )}>
          <Icon className="w-10 h-10 drop-shadow-sm" />
        </div>
        
        <div className="flex flex-col gap-2 min-w-0">
          <h1 className={clsx(
            'text-4xl lg:text-5xl font-black uppercase tracking-[-0.06em] leading-none truncate flex items-baseline gap-3',
            isDark ? 'text-white' : 'text-[#0f172a]'
          )}>
            <span className="opacity-40">{mainTitle}</span>
            <span className="text-[#3b82f6] text-shadow-glow">{highlightedTitle}</span>
          </h1>
          
          <div className="flex items-center gap-6 overflow-x-auto no-scrollbar">
            {statusMetrics && statusMetrics.length > 0 ? (
                statusMetrics.map((metric, i) => (
                    <div key={i} className={clsx(
                        "flex items-center gap-2.5 shrink-0 px-4 py-2 rounded-2xl border transition-all duration-300",
                        isDark ? "bg-white/[0.03] border-white/[0.05]" : "bg-slate-50 border-slate-100"
                    )}>
                      {metric.color && (
                        <div className={clsx("w-2 h-2 rounded-full", metric.color)} />
                      )}
                      <span className={clsx(
                        "text-[11px] font-black uppercase tracking-[0.2em] opacity-50",
                        isDark ? "text-white" : "text-slate-900"
                      )}>
                        {metric.value} <span className="opacity-50">{metric.label}</span>
                      </span>
                    </div>
                  ))
            ) : (
                subtitle && (
                    <div className={clsx(
                        "flex items-center gap-3 px-4 py-1.5 rounded-xl border",
                        isDark ? "bg-blue-500/5 border-blue-500/10" : "bg-blue-50/50 border-blue-100/50"
                    )}>
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                        <p className={clsx(
                            "text-[10px] font-black uppercase tracking-[0.25em] opacity-40",
                            isDark ? "text-white" : "text-blue-900"
                        )}>
                            {subtitle}
                        </p>
                    </div>
                )
            )}
          </div>
        </div>
      </div>

      {actions && (
        <div className="flex items-center gap-4 relative z-10">
          {actions}
        </div>
      )}
    </div>
  )
}
