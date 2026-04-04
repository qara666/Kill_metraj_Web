import React, { useState, useEffect } from 'react'
import { socketService } from '../../services/socketService'
import { API_URL } from '../../config/apiConfig'

declare global {
  interface Window {
    __divisionStatuses?: Record<string, any>;
  }
}

// Type definitions for division status updates
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
}

const DivisionStatusPanel: React.FC = () => {
  const [data, setData] = useState<DivisionStatus[]>([]);
  const [debug, setDebug] = useState<string>('');

  useEffect(() => {
    // Initial hydration from global window store or REST API
    const hydrate = async () => {
      const raw = window.__divisionStatuses;
      if (raw && Object.keys(raw).length > 0) {
        setData(Object.values(raw) as DivisionStatus[]);
        return;
      }

      // Fallback: Fetch from REST API if window store is empty
      try {
        const token = localStorage.getItem('km_access_token');
        const res = await fetch(`${API_URL}/api/turbo/statuses`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        const json = await res.json();
        if (json.success && json.data) {
          const values = Object.values(json.data) as DivisionStatus[];
          setData(values);
        } else {
          setDebug('No active calculations found');
        }
      } catch (err) {
        setDebug('Sync error');
      }
    };
    hydrate();

    // Poll for updates as backup
    const interval = setInterval(hydrate, 5000);

    // Subscribe to real-time updates
    const handleUpdate = (payload: any) => {
      setData(prev => {
        const key = `${payload.divisionId}_${payload.date}`;
        // Find existing or append
        const filtered = prev.filter(p => `${p.divisionId}_${p.date}` !== key);
        return [...filtered, payload];
      });
    };

    socketService.on('division_status_update', handleUpdate);
    return () => {
      clearInterval(interval);
      socketService.off('division_status_update', handleUpdate);
    };
  }, []);

  if (!data.length) {
    return (
      <section style={{ padding: 20, marginTop: 20, border: '1px dashed #d1d5db', borderRadius: 16, textAlign: 'center', color: '#6b7280' }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 500 }}>
          Ожидание данных для фонового расчета...
        </h3>
        <p style={{ fontSize: 13, marginTop: 8 }}>
          Нажмите "Запустить расчет" или дождитесь планового обновления.
        </p>
        {debug && <p style={{ fontSize: 11, marginTop: 8, color: '#9ca3af' }}>Debug: {debug}</p>}
      </section>
    );
  }

  return (
    <section style={{ 
      padding: '20px', 
      marginTop: '20px',
      borderTop: '1px solid #e5e7eb', 
      background: 'rgba(59, 130, 246, 0.03)', 
      borderRadius: '16px',
      boxShadow: 'inset 0 2px 4px 0 rgba(0, 0, 0, 0.05)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <div style={{ 
          width: '10px', 
          height: '10px', 
          borderRadius: '50%', 
          background: '#10b981', 
          boxShadow: '0 0 8px #10b981',
          animation: 'pulse 2s infinite' 
        }} />
        <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: '#111827' }}>
          Фоновый расчет дистанции (Real-time)
        </h3>
      </div>
      
      <style>{`
        @keyframes pulse {
          0% { transform: scale(0.9); opacity: 0.6; }
          70% { transform: scale(1.2); opacity: 1; }
          100% { transform: scale(0.9); opacity: 0.6; }
        }
      `}</style>

      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', 
        gap: '20px' 
      }}>
        {data.map(d => (
          <div key={`${d.divisionId}_${d.date}`} style={{ 
            border: '1px solid #e5e7eb', 
            borderRadius: '14px', 
            padding: '16px', 
            background: 'white', 
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' 
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, color: '#2563eb', fontSize: '15px' }}>
                Подразделение: {d.divisionId}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280', background: '#f3f4f6', padding: '2px 8px', borderRadius: '12px' }}>
                {d.date}
              </div>
            </div>
            
            <div style={{ 
              fontSize: '13px', 
              color: d.currentPhase === 'complete' ? '#059669' : '#4b5563', 
              marginTop: '8px', 
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              {d.currentPhase !== 'complete' && (
                <div style={{ width: '12px', height: '12px', border: '2px solid #3b82f6', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
              )}
              {d.message || (d.currentPhase === 'complete' ? 'Расчет завершен' : 'Выполняется расчет...')}
            </div>

            <style>{`
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            `}</style>

            <div style={{ marginTop: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginTop: '6px' }}>
                <span style={{ color: '#6b7280' }}>Прогресс (заказы):</span>
                <span style={{ fontWeight: 600 }}>{d.processedCount} / {d.totalCount}</span>
              </div>
              <div style={{ width: '100%', height: '6px', background: '#e5e7eb', borderRadius: '3px', marginTop: '4px', overflow: 'hidden' }}>
                <div style={{ 
                  width: `${Math.min(100, (d.processedCount / (d.totalCount || 1)) * 100)}%`, 
                  height: '100%', 
                  background: '#3b82f6', 
                  transition: 'width 0.5s ease' 
                }} />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', marginTop: '10px' }}>
                <span style={{ color: '#6b7280' }}>Обработано курьеров:</span>
                <span style={{ fontWeight: 600 }}>{d.processedCouriers} / {d.totalCouriers}</span>
              </div>
            </div>

            {d.couriers && d.couriers.length > 0 && (
              <div style={{ marginTop: '16px', borderTop: '1px solid #f3f4f6', paddingTop: '12px' }}>
                <div style={{ fontSize: '12px', color: '#9ca3af', marginBottom: '8px', fontWeight: 600, letterSpacing: '0.05em' }}>
                  КИЛОМЕТРАЖ ПО КУРЬЕРАМ:
                </div>
                <div style={{ 
                  maxHeight: '150px', 
                  overflowY: 'auto', 
                  paddingRight: '4px',
                  scrollbarWidth: 'thin'
                }}>
                  {d.couriers.map(c => (
                    <div key={c.name} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      fontSize: '13px', 
                      padding: '6px 0',
                      borderBottom: '1px Math.min(1, 0.5) solid #f9fafb'
                    }}>
                      <span style={{ 
                        whiteSpace: 'nowrap', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        marginRight: '8px',
                        color: '#374151' 
                      }}>
                        {c.name}
                      </span>
                      <span style={{ color: '#2563eb', fontWeight: 700 }}>
                        {typeof c.distanceKm === 'number' ? c.distanceKm.toFixed(1) : c.distanceKm} км
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
};

export default DivisionStatusPanel;
