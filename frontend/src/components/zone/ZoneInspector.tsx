import React, { useState, useEffect } from 'react'
import { 
  MagnifyingGlassIcon, 
  MapPinIcon, 
  InformationCircleIcon
} from '@heroicons/react/24/outline'
import { robustGeocodingService } from '../../services/robust-geocoding/RobustGeocodingService'
import { useKmlData } from '../../hooks/useKmlData'
import { clsx } from 'clsx'

const ZoneInspector: React.FC<{ isDark?: boolean }> = ({ isDark }) => {
  const [address, setAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const { cachedAllKmlPolygons } = useKmlData()

  // Ensure service has latest context
  useEffect(() => {
    if (cachedAllKmlPolygons.length > 0) {
      robustGeocodingService.setZoneContext({
        allPolygons: cachedAllKmlPolygons.map(p => ({
            key: p.key,
            name: p.name,
            folderName: p.folderName,
            path: p.path!,
            googlePoly: p.googlePoly,
            bounds: p.bounds
        })),
        activePolygons: [], // not used for raw inspector
        selectedZoneKeys: cachedAllKmlPolygons.map(p => p.key)
      })
    }
  }, [cachedAllKmlPolygons])

  const handleInspect = async () => {
    if (!address.trim()) return
    setLoading(true)
    try {
      const geoResult = await robustGeocodingService.geocode(address, {
        maxVariants: 10,
        skipExhaustiveIfGoodHit: false // we want all variants for inspector
      })
      setResult(geoResult)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <MapPinIcon className="h-6 w-6 text-indigo-500" />
          Инспектор зон и адресов
        </h3>
        <p className="text-xs text-gray-400">
          Введите адрес, чтобы увидеть, как система его нормализует, какие варианты генерирует и в какую KML-зону он попадает.
        </p>
        
        <div className="flex gap-2">
          <input 
            type="text" 
            className="flex-1 p-3 rounded-xl border dark:bg-gray-900 dark:border-gray-700 outline-none focus:border-indigo-500 transition-all font-bold"
            placeholder="Пример: ул. Крещатик 1"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleInspect()}
          />
          <button 
            onClick={handleInspect}
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-indigo-500/25"
          >
            {loading ? <div className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <MagnifyingGlassIcon className="h-5 w-5" />}
            Инспекция
          </button>
        </div>
      </div>

      {result && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* Main Result */}
          <div className={clsx(
            "p-5 rounded-2xl border flex flex-col gap-4",
            isDark ? "bg-gray-800/50 border-gray-700" : "bg-white border-gray-200"
          )}>
            <div className="flex justify-between items-start">
              <h4 className="text-sm font-black uppercase tracking-widest text-gray-500">Лучший кандидат</h4>
              <span className={clsx(
                "px-2 py-0.5 rounded-full text-[10px] font-black uppercase",
                result.best?.score > 80 ? "bg-green-500/20 text-green-500" : "bg-yellow-500/20 text-yellow-500"
              )}>
                Score: {result.best?.score || 0}
              </span>
            </div>
            
            {result.best ? (
              <div className="space-y-4">
                <div>
                  <div className="text-2xl font-black text-indigo-500 leading-tight">
                    {result.best.formattedAddress}
                  </div>
                  <div className="text-xs text-gray-400 mt-1 flex items-center gap-2 font-mono">
                    {result.best.lat.toFixed(6)}, {result.best.lng.toFixed(6)}
                    <span className="bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">{result.best.raw.geometry.location_type}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800">
                    <div className="text-[10px] font-black uppercase text-gray-400 mb-1">KML Зона</div>
                    <div className="font-bold text-sm">{result.best.kmlZone || 'Вне зоны'}</div>
                  </div>
                  <div className={clsx(
                    "p-3 rounded-xl border",
                    result.best.isTechnicalZone ? "bg-red-500/10 border-red-500/30 text-red-400" : "bg-green-500/10 border-green-500/30 text-green-400"
                  )}>
                    <div className="text-[10px] font-black uppercase opacity-60 mb-1">Тип зоны</div>
                    <div className="font-bold text-sm">{result.best.isTechnicalZone ? 'Техническая' : 'Рабочая'}</div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-indigo-500/5 border border-indigo-500/20">
                  <div className="text-[10px] font-black uppercase text-indigo-400 mb-1">Обоснование Score</div>
                  <ul className="text-[10px] space-y-1">
                    {result.best.isInsideZone && <li className="text-green-400 flex items-center gap-1">✓ Находится внутри KML зоны (+{result.best.isTechnicalZone ? 0 : 40} pts)</li>}
                    {result.best.isExactHouse && <li className="text-green-400 flex items-center gap-1">✓ Точное совпадение номера дома (+15 pts)</li>}
                    {result.best.raw.geometry.location_type === 'ROOFTOP' && <li className="text-green-400 flex items-center gap-1">✓ Тип ROOFTOP (макс. точность)</li>}
                    {result.best.raw.formatted_address.includes(result.best.cityBias) && <li className="text-blue-400 flex items-center gap-1">ℹ Подтверждено смещение по городу</li>}
                  </ul>
                </div>
              </div>
            ) : (
              <div className="py-10 text-center text-gray-500 italic">
                Кандидаты не найдены
              </div>
            )}
          </div>

          {/* Variants & Candidates List */}
          <div className="space-y-4">
            <h4 className="text-xs font-black uppercase tracking-widest text-gray-500">Все варианты и кандидаты</h4>
            <div className="max-h-[400px] overflow-y-auto space-y-2 pr-2 custom-scrollbar">
              {result.allCandidates.map((c: any, i: number) => (
                <div key={i} className={clsx(
                  "p-3 rounded-xl border flex items-center justify-between gap-4 transition-all hover:scale-[1.01]",
                  c === result.best ? "border-indigo-500 bg-indigo-500/5 ring-2 ring-indigo-500/20" : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
                )}>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-xs truncate">{c.formattedAddress}</div>
                    <div className="flex gap-2 mt-1">
                      <span className="text-[9px] text-gray-400 font-mono italic">{c.kmlZone || 'OUT'}</span>
                      <span className="text-[9px] text-gray-500">{c.raw.geometry.location_type}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className="text-xs font-black text-indigo-500">{c.score}</span>
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map(star => (
                        <div key={star} className={clsx(
                          "w-1 h-1 rounded-full",
                          (c.score / 20 >= star) ? "bg-indigo-500" : "bg-gray-200 dark:bg-gray-700"
                        )} />
                      ))}
                    </div>
                  </div>
                </div>
              ))}
              {result.allCandidates.length === 0 && (
                <div className="p-8 text-center border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-2xl text-gray-400 text-sm">
                  Результат пуст
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Logic Documentation */}
      <div className="pt-4 border-t border-gray-100 dark:border-gray-700">
        <div className="flex items-start gap-3 text-xs text-gray-400">
          <InformationCircleIcon className="h-5 w-5 text-gray-500 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold">Как работает скоринг?</p>
            <p>Система формирует до 15 вариантов адреса (включая переименованные улицы), опрашивает Google API и оценивает каждого кандидата. Приоритет отдается результатам внутри **активных KML зон** с типом **ROOFTOP**.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ZoneInspector
