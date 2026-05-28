import React, { useState, useEffect } from 'react'
import { 
  ArrowPathIcon, 
  PlusIcon, 
  CloudArrowUpIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  GlobeAltIcon,
  InformationCircleIcon
} from '@heroicons/react/24/outline'
import { API_URL } from '../../config/apiConfig'
import { clsx } from 'clsx'
import { toast } from 'react-hot-toast'

interface KmlHub {
  id: number
  name: string
  sourceUrl: string
  isActive: boolean
  lastSyncAt: string | null
  zoneCount: number
}

const KmlManagementPanel: React.FC = () => {
  const [hubs, setHubs] = useState<KmlHub[]>([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState<number | null>(null)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [newHub, setNewHub] = useState({ name: '', url: '' })

  const fetchHubs = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/geocache/hubs`)
      const data = await response.json()
      if (data.success) {
        setHubs(data.hubs)
      }
    } catch (error) {
      toast.error('Ошибка загрузки хабов KML')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHubs()
  }, [])

  const handleSync = async (hub: KmlHub) => {
    setSyncing(hub.id)
    try {
      const response = await fetch(`${API_URL}/api/geocache/kml-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hubName: hub.name, url: hub.sourceUrl })
      })
      const data = await response.json()
      if (data.success) {
        toast.success(`Синхронизировано ${data.count} зон для ${hub.name}`)
        fetchHubs()
      } else {
        toast.error(`Ошибка: ${data.error}`)
      }
    } catch (error) {
      toast.error('Сетевая ошибка при синхронизации')
    } finally {
      setSyncing(null)
    }
  }

  const handleAddHub = async () => {
    if (!newHub.name || !newHub.url) return
    
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/geocache/kml-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hubName: newHub.name, url: newHub.url })
      })
      const data = await response.json()
      if (data.success) {
        toast.success(`Hub ${newHub.name} добавлен (${data.count} зон)`)
        setIsAddOpen(false)
        setNewHub({ name: '', url: '' })
        fetchHubs()
      } else {
        toast.error(`Ошибка: ${data.error}`)
      }
    } catch (error) {
      toast.error('Ошибка добавления хаба')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold flex items-center gap-2">
          <GlobeAltIcon className="h-6 w-6 text-blue-500" />
          Управление KML зонами на сервере
        </h2>
        <div className="flex gap-2">
          <button 
            onClick={fetchHubs}
            disabled={loading}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <ArrowPathIcon className={clsx("h-5 w-5", loading && "animate-spin")} />
          </button>
          <button 
            onClick={() => setIsAddOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors font-medium"
          >
            <PlusIcon className="h-5 w-5" />
            Добавить Хаб
          </button>
        </div>
      </div>

      <div className="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 p-4 rounded-r-lg flex gap-3">
        <InformationCircleIcon className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-800 dark:text-blue-200">
          KML зоны теперь хранятся централизованно в базе данных. Это обеспечивает консистентность секторов и зон для всех пользователей системы.
        </p>
      </div>

      <div className="overflow-hidden border border-gray-200 dark:border-gray-700 rounded-xl">
        <table className="w-full text-left">
          <thead className="bg-gray-50 dark:bg-gray-800/50 text-xs font-bold uppercase text-gray-500 tracking-wider">
            <tr>
              <th className="px-6 py-4">Имя Хаба / URL</th>
              <th className="px-6 py-4">Зоны</th>
              <th className="px-6 py-4">Последняя синхронизация</th>
              <th className="px-6 py-4">Статус</th>
              <th className="px-6 py-4 text-right">Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
            {hubs.length === 0 && !loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-gray-500">
                  Хабы не найдены. Добавьте первый хаб, чтобы начать.
                </td>
              </tr>
            ) : hubs.map((hub) => (
              <tr key={hub.id} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-bold">{hub.name}</div>
                  <div className="text-xs text-gray-400 truncate max-w-md">{hub.sourceUrl}</div>
                </td>
                <td className="px-6 py-4 font-mono text-indigo-500 font-bold">{hub.zoneCount}</td>
                <td className="px-6 py-4 text-sm text-gray-500">
                  {hub.lastSyncAt ? new Date(hub.lastSyncAt).toLocaleString() : 'Никогда'}
                </td>
                <td className="px-6 py-4">
                  {hub.isActive ? (
                    <CheckCircleIcon className="h-6 w-6 text-green-500" />
                  ) : (
                    <ExclamationCircleIcon className="h-6 w-6 text-gray-400" />
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <button 
                    onClick={() => handleSync(hub)}
                    disabled={syncing === hub.id}
                    className={clsx(
                      "p-2 rounded-lg transition-all",
                      syncing === hub.id ? "text-gray-400" : "text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                    )}
                    title="Синхронизировать сейчас"
                  >
                    <CloudArrowUpIcon className={clsx("h-6 w-6", syncing === hub.id && "animate-pulse")} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Manual Add Dialog */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            <div className="p-6 border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-xl font-bold">Добавить KML Хаб</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-gray-500">Название Хаба</label>
                <input 
                  type="text" 
                  className="w-full p-3 rounded-xl border dark:bg-gray-900 dark:border-gray-700 outline-none focus:border-blue-500 transition-all font-bold" 
                  value={newHub.name}
                  onChange={(e) => setNewHub({ ...newHub, name: e.target.value })}
                  placeholder="Например: Киев Центр"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase text-gray-500">Google My Maps URL</label>
                <input 
                  type="text" 
                  className="w-full p-3 rounded-xl border dark:bg-gray-900 dark:border-gray-700 outline-none focus:border-blue-500 transition-all text-sm" 
                  value={newHub.url}
                  onChange={(e) => setNewHub({ ...newHub, url: e.target.value })}
                  placeholder="https://www.google.com/maps/d/u/0/kml?mid=..."
                />
              </div>
            </div>
            <div className="p-6 bg-gray-50 dark:bg-gray-900/50 flex justify-end gap-3">
              <button 
                onClick={() => setIsAddOpen(false)}
                className="px-6 py-2 rounded-xl font-bold text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              >
                Отмена
              </button>
              <button 
                onClick={handleAddHub}
                disabled={!newHub.name || !newHub.url || loading}
                className="px-8 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-xl font-bold transition-all shadow-lg shadow-blue-500/25"
              >
                {loading ? 'Синхронизация...' : 'Сохранить и Синхрон'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default KmlManagementPanel
