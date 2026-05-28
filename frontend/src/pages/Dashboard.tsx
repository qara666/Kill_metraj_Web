import React, { useState, useEffect, useCallback, useMemo } from 'react'
import { clsx } from 'clsx'
import { HomeIcon, CommandLineIcon } from '@heroicons/react/24/outline'

import { DashboardHeader } from '../components/shared/DashboardHeader'
import { DashboardApiSection } from '../components/autoplanner/DashboardApiSection'
import DivisionStatusPanel from '../components/division/DivisionStatusPanel'
import { OrdersStatPanel } from '../components/dashboard/OrdersStatPanel'

import { useExcelData } from '../contexts/ExcelDataContext'
import { useTheme } from '../contexts/ThemeContext'
import { useAuth } from '../contexts/AuthContext'
import { useDashboardStore } from '../stores/useDashboardStore'

export const Dashboard: React.FC = () => {
  const { excelData } = useExcelData()
  const { isDark } = useTheme()
  const { user } = useAuth()
  const setDivisionId = useDashboardStore(s => s.setDivisionId)

  const [logs, setLogs] = useState<string[]>([])

  const log = useCallback((message: string) => {
    const entry = `${new Date().toLocaleTimeString()} — ${message}`
    setLogs(prev => [entry, ...prev].slice(0, 100))
  }, [])

  useEffect(() => {
    try {
      const storedLogs = localStorage.getItem('km_dashboard_logs')
      if (storedLogs) {
        const parsed = JSON.parse(storedLogs)
        if (Array.isArray(parsed)) setLogs(parsed)
      }
    } catch {}
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('km_dashboard_logs', JSON.stringify(logs))
    } catch {}
  }, [logs])

  useEffect(() => {
    if (user?.divisionId) setDivisionId(user.divisionId)
  }, [user?.divisionId, setDivisionId])

  const autoRoutingStatus = useDashboardStore(s => s.autoRoutingStatus)
  const isCalcActive = autoRoutingStatus.isActive && (Date.now() - (autoRoutingStatus.lastUpdate || 0) < 120000)

  const clearLogs = useCallback(() => setLogs([]), [])

  return (
    <div className={clsx(
      'space-y-4',
      isDark ? 'text-gray-100' : 'text-gray-900'
    )}>
      <DashboardHeader
        icon={HomeIcon}
        title="Главная"
      />

      <div className="flex flex-col gap-6">
        <DashboardApiSection />
        <OrdersStatPanel />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {user?.role === 'admin' && (
            <div style={{ 
              background: isDark ? '#000000' : '#FFFFFF', 
              border: `1px solid ${isDark ? '#27272A' : '#E4E4E7'}`,
              borderRadius: '12px', 
              display: 'flex',
              flexDirection: 'column'
            }}>
              <div style={{ 
                padding: '16px 20px', 
                borderBottom: `1px solid ${isDark ? '#27272A' : '#E4E4E7'}`,
                display:'flex', justifyContent:'space-between', alignItems:'center' 
              }}>
                <div style={{ display:'flex', alignItems:'center', gap: '8px' }}>
                  <CommandLineIcon style={{ width:16, height:16, color: isDark ? '#A1A1AA' : '#71717A' }} />
                  <h3 style={{ fontSize: '14px', fontWeight: 600, color: isDark ? '#EDEDED' : '#18181B', margin:0 }}>Системные события</h3>
                </div>
                <button
                  onClick={clearLogs}
                  style={{ 
                    background:'none', border:'none', color:isDark?'#A1A1AA':'#71717A', 
                    fontSize:'12px', cursor:'pointer', padding: 0
                  }}
                  title="Очистить лог"
                >
                  Очистить
                </button>
              </div>
              
              <div style={{ padding: '0', background: isDark ? '#0A0A0A' : '#FAFAFA', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px' }}>
                {logs.length === 0 ? (
                  <p style={{ fontSize:'12px', color: isDark?'#A1A1AA':'#71717A', textAlign:'center', padding:'32px' }}>Нет системных событий</p>
                ) : (
                  <div style={{ maxHeight:400, overflowY:'auto', padding: '12px 20px' }}>
                    {logs.map((line, idx) => (
                      <div key={idx} style={{ 
                        fontSize:'12px', fontFamily:'"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                        color: isDark ? '#EDEDED' : '#18181B', padding:'4px 0',
                        display: 'flex', gap: '12px'
                      }}>
                        <span style={{ color: isDark ? '#71717A' : '#A1A1AA', userSelect: 'none' }}>
                          {line.split(' — ')[0]}
                        </span>
                        <span>
                          {line.split(' — ')[1]}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className={clsx(user?.role !== 'admin' && 'lg:col-span-2')}>
            <DivisionStatusPanel />
          </div>
        </div>
      </div>
    </div>
  )
}
