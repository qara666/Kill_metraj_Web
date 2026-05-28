import React, { useState, useEffect } from 'react'
import { socketService } from '../../services/socketService'
import { API_URL } from '../../config/apiConfig'
import { useTheme } from '../../contexts/ThemeContext'
import { ChevronDownIcon, BoltIcon, ExclamationCircleIcon, CheckCircleIcon } from '@heroicons/react/24/solid'

type CourierInfo = { 
  name: string; 
  orders: number; 
  distanceKm: number 
}

type DivisionStatus = {
  divisionId: string;
  date: string;
  totalCount: number;
  totalCouriers: number;
  processedCount: number;
  processedCouriers: number;
  currentPhase: string;
  message: string;
  couriers?: CourierInfo[];
  isBulkImport?: boolean;
  diagnostics?: any;
  lastUpdate?: number;
}

const ProgressBar = ({ progress, color }: { progress: number, color: string }) => (
  <div style={{ height: 4, width: '100%', background: 'var(--bg-tertiary)', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
    <div style={{ height: '100%', width: `${Math.max(0, Math.min(100, progress))}%`, background: color, transition: 'width 0.5s ease', borderRadius: 4 }} />
  </div>
)

const DivisionStatusPanel: React.FC = () => {
  const { isDark } = useTheme()
  const [data, setData] = useState<DivisionStatus[]>([]);
  const [isExpanded, setIsExpanded] = useState(false); // Collapsed by default

  useEffect(() => {
    const hydrate = async () => {
      try {
        const token = localStorage.getItem('km_access_token');
        const res = await fetch(`${API_URL}/api/turbo/statuses`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        if (json.success && json.data) {
          const values = Object.values(json.data) as DivisionStatus[];
          values.sort((a, b) => Number(b?.lastUpdate || 0) - Number(a?.lastUpdate || 0));
          setData(values);
        }
      } catch (err) { /* ignore */ }
    };
    hydrate();
    const interval = setInterval(hydrate, 30000);
    const handleUpdate = (payload: any) => {
      setData(prev => {
        const key = `${payload.divisionId}_${payload.date}`;
        const filtered = prev.filter(p => `${p.divisionId}_${p.date}` !== key);
        const next = [...filtered, payload];
        next.sort((a, b) => Number(b?.lastUpdate || 0) - Number(a?.lastUpdate || 0));
        return next;
      });
    };
    socketService.on('division_status_update', handleUpdate);
    return () => {
      clearInterval(interval);
      socketService.off('division_status_update', handleUpdate);
    };
  }, []);

  if (!data.length) return null;

  const activeCount = data.filter(d => d.currentPhase !== 'complete' && d.currentPhase !== 'error').length;

  const theme = {
    '--bg-primary': isDark ? '#1C1C1E' : '#FFFFFF',
    '--bg-secondary': isDark ? '#2C2C2E' : '#F2F2F7',
    '--bg-tertiary': isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
    '--border': isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)',
    '--text-primary': isDark ? '#FFFFFF' : '#000000',
    '--text-secondary': isDark ? '#8E8E93' : '#8E8E93',
    '--blue': isDark ? '#0A84FF' : '#007AFF',
    '--green': isDark ? '#30D158' : '#34C759',
    '--red': isDark ? '#FF453A' : '#FF3B30',
  } as React.CSSProperties

  return (
    <div style={{ 
      ...theme,
      background: 'var(--bg-primary)', 
      fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif",
      color: 'var(--text-primary)',
      border: '1px solid var(--border)',
      borderRadius: '24px',
      boxShadow: isDark ? '0 8px 32px rgba(0,0,0,0.3)' : '0 8px 30px rgba(0,0,0,0.04)',
      overflow: 'hidden',
      transition: 'all 0.3s ease'
    }}>
      
      {/* Spoiler Header */}
      <button 
        onClick={() => setIsExpanded(!isExpanded)}
        style={{ 
          width: '100%',
          background: 'transparent',
          border: 'none',
          padding: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          outline: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ 
            width: '36px', height: '36px', borderRadius: '10px', 
            background: activeCount > 0 ? (isDark ? 'rgba(10,132,255,0.2)' : 'rgba(0,122,255,0.1)') : 'var(--bg-tertiary)', 
            display: 'flex', alignItems: 'center', justifyContent: 'center' 
          }}>
             <BoltIcon style={{ width: '18px', height: '18px', color: activeCount > 0 ? 'var(--blue)' : 'var(--text-secondary)' }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
             <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
               Фоновые процессы
             </span>
             <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
               {activeCount} активно из {data.length}
             </span>
          </div>
        </div>

        <div style={{ 
          transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
          transition: 'transform 0.3s ease',
          color: 'var(--text-secondary)'
        }}>
          <ChevronDownIcon style={{ width: '24px', height: '24px' }} />
        </div>
      </button>

      {/* Expanded Content */}
      {isExpanded && (
        <div style={{ 
          padding: '0 24px 24px 24px',
          display: 'grid', 
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', 
          gap: '16px' 
        }}>
          {data.map(d => (
            <DivisionItem key={`${d.divisionId}_${d.date}`} d={d} />
          ))}
        </div>
      )}
    </div>
  );
};

const DivisionItem = ({ d }: { d: DivisionStatus }) => {
  const progress = Math.min(100, (d.processedCount / (d.totalCount || 1)) * 100);
  const isComplete = d.currentPhase === 'complete';
  const isError = d.currentPhase === 'error' || d.diagnostics?.routing?.engines?.OSRM?.fail > 0;
  const isActive = !isComplete && d.currentPhase !== 'error';

  return (
    <div style={{ 
      padding: '20px', 
      background: 'var(--bg-secondary)', 
      borderRadius: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: '16px'
    }}>
      
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>{d.divisionId}</span>
            <span style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'var(--bg-tertiary)', padding: '2px 8px', borderRadius: '6px' }}>{d.date}</span>
          </div>
          <span style={{ fontSize: '13px', color: isError ? 'var(--red)' : isComplete ? 'var(--green)' : isActive ? 'var(--blue)' : 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
            {isError ? <ExclamationCircleIcon width={14} /> : isComplete ? <CheckCircleIcon width={14} /> : isActive ? <BoltIcon width={14} className="animate-pulse" /> : null}
            {d.message || (isComplete ? 'Завершено' : 'В процессе')}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 600 }}>
          <span style={{ color: 'var(--text-secondary)' }}>Обработано</span>
          <span style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
            {d.processedCount} / {d.totalCount}
          </span>
        </div>
        <ProgressBar progress={progress} color={isError ? 'var(--red)' : isComplete ? 'var(--green)' : 'var(--blue)'} />
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
           <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Курьеры</span>
           <span style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{d.processedCouriers} / {d.totalCouriers}</span>
        </div>
        {d.diagnostics?.routing?.engines && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end' }}>
             <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Ошибки OSRM</span>
             <span style={{ fontSize: '15px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: d.diagnostics.routing.engines.OSRM?.fail > 0 ? 'var(--red)' : 'var(--text-primary)' }}>
               {d.diagnostics.routing.engines.OSRM?.fail || 0}
             </span>
          </div>
        )}
      </div>

    </div>
  )
}

export default DivisionStatusPanel;
