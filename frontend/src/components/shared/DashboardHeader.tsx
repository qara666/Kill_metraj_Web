import * as React from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { clsx } from 'clsx'

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
    <div style={{
      background: isDark ? 'linear-gradient(180deg, rgba(28,28,30,0.8) 0%, rgba(28,28,30,0.2) 100%)' : 'linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(255,255,255,0.5) 100%)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      borderRadius: '24px',
      padding: '32px 40px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      boxShadow: isDark ? '0 10px 40px rgba(0,0,0,0.3)' : '0 8px 30px rgba(0,0,0,0.04)',
      border: isDark ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(0,0,0,0.02)',
      marginBottom: '24px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        <div style={{ 
          width: '64px', height: '64px', 
          background: isDark ? '#2C2C2E' : '#F2F2F7', 
          borderRadius: '18px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', 
          color: isDark ? '#0A84FF' : '#007AFF'
        }}>
           <Icon style={{ width: '32px', height: '32px' }} />
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h1 style={{ 
            fontSize: '32px', fontWeight: 800, margin: 0, 
            letterSpacing: '-0.02em', color: isDark ? '#FFFFFF' : '#000000' 
          }}>
            <span style={{ opacity: 0.4 }}>{mainTitle} </span>
            <span>{highlightedTitle}</span>
          </h1>
          {subtitle && (
             <div style={{ fontSize: '13px', fontWeight: 600, color: isDark ? '#0A84FF' : '#007AFF', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
               {subtitle}
             </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        {statusMetrics && statusMetrics.length > 0 && (
          <div style={{ display: 'flex', gap: '16px' }}>
            {statusMetrics.map((metric, i) => (
              <div key={i} style={{ 
                display: 'flex', flexDirection: 'column', alignItems: 'flex-end'
              }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: isDark ? '#8E8E93' : '#8E8E93', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  {metric.label}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {metric.color && (
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: metric.color.replace('bg-', '').replace('[', '').replace(']', '') || '#0A84FF' }} />
                  )}
                  <span style={{ fontSize: '24px', fontWeight: 700, color: isDark ? '#FFFFFF' : '#000000', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
                    {metric.value}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {actions && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginLeft: '16px', paddingLeft: '24px', borderLeft: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.1)' }}>
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
