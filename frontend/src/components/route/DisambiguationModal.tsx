import React, { useEffect, useRef } from 'react';
import { clsx } from 'clsx';
import {
  QuestionMarkCircleIcon,
  TrashIcon
} from '@heroicons/react/24/outline';
import { 
  CheckBadgeIcon as CheckBadgeIconSolid, 
  HomeIcon as HomeIconSolid, 
  MapIcon as MapIconSolid, 
  ExclamationCircleIcon as ExclamationCircleIconSolid 
} from '@heroicons/react/24/solid';
import { loadLeaflet } from '../../utils/maps/leafletLoader';

interface DisambiguationModalProps {
  open: boolean;
  title: string;
  options: any[];
  isDark: boolean;
  onResolve: (choice: any | null) => void;
}

const formatDisplayDistance = (meters?: number) => {
  if (meters === undefined) return undefined;
  if (meters < 1000) return `${Math.round(meters)} м`;
  return `${(meters / 1000).toFixed(1)} км`;
};



export const DisambiguationModal: React.FC<DisambiguationModalProps> = React.memo(({
  open,
  title,
  options,
  isDark,
  onResolve
}) => {
  const mapInstanceRef = useRef<any>(null);
  const lastTitleRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
      lastTitleRef.current = null;
      return;
    }

    // Skip re-init if title is the same (prevents jitter from parent re-renders)
    if (lastTitleRef.current === title && mapInstanceRef.current) {
      return;
    }
    lastTitleRef.current = title;

    const initMap = async () => {
      // Small delay to ensure container is in DOM
      await new Promise(r => setTimeout(r, 100));
      const container = document.getElementById('disamb-map-container');
      if (!container) return;

      try {
        const L = await loadLeaflet();
        if (mapInstanceRef.current) return;

        let center: [number, number] = [50.4501, 30.5234];
        if (options && options.length > 0) {
          const first = options[0].res;
          const lat = typeof first.geometry.location.lat === 'function' ? first.geometry.location.lat() : first.geometry.location.lat;
          const lng = typeof first.geometry.location.lng === 'function' ? first.geometry.location.lng() : first.geometry.location.lng;
          if (lat && lng) center = [lat, lng];
        }

        const map = L.map(container, { zoomControl: false }).setView(center, 13);
        mapInstanceRef.current = map;

        const tileUrl = isDark 
          ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
          : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        L.tileLayer(tileUrl).addTo(map);

        options.forEach((opt: any, idx: number) => {
          const res = opt.res;
          const lat = typeof res.geometry.location.lat === 'function' ? res.geometry.location.lat() : res.geometry.location.lat;
          const lng = typeof res.geometry.location.lng === 'function' ? res.geometry.location.lng() : res.geometry.location.lng;
          if (lat && lng) {
            L.marker([lat, lng], { 
                icon: L.divIcon({ 
                    className: 'disamb-candidate-icon',
                    html: `<div style="background-color: #3b82f6; color: white; border: 2px solid white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: bold;">${idx + 1}</div>`,
                    iconSize: [20, 20]
                }) 
            })
              .addTo(map)
              .bindPopup(`<b>${idx + 1}.</b> ${opt.label}`);
          }
        });

        let manualMarker: any = null;
        map.on('click', (e: any) => {
          const { lat, lng } = e.latlng;
          if (manualMarker) manualMarker.remove();
          
          manualMarker = L.marker([lat, lng], {
            icon: L.divIcon({
              className: 'custom-manual-icon',
              html: `<div style="background-color: #ef4444; width: 14px; height: 14px; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(239,68,68,0.5);"></div>`,
              iconSize: [14, 14],
              iconAnchor: [7, 7]
            })
          }).addTo(map);

          const coordEl = document.getElementById('manual-selection-coord');
          const btnEl = document.getElementById('confirm-manual-btn');
          if (coordEl) coordEl.classList.remove('hidden');
          if (btnEl) {
            btnEl.classList.remove('hidden');
            (btnEl as any).onclick = () => {
              onResolve({
                geometry: { location: { lat, lng } },
                formatted_address: 'Выбрано вручную на карте',
                manual: true
              });
            };
          }
        });
      } catch (err) {
        console.error('Failed to init disamb map:', err);
      }
    };

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [open, title, options, isDark, onResolve]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md transition-all duration-300 animate-in fade-in">
      <div className={clsx(
        "w-full max-w-xl rounded-2xl shadow-2xl border overflow-hidden animate-in zoom-in-95 duration-300",
        isDark ? "bg-gray-900 border-white/10" : "bg-white border-gray-200"
      )}
      style={{ willChange: 'transform' }}
      >
        <div className={clsx("px-6 py-4 flex items-center gap-3 border-b", isDark ? "bg-gray-800/50 border-white/5" : "bg-gray-50 border-gray-100")}>
          <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center">
            <QuestionMarkCircleIcon className="w-6 h-6 text-blue-500" />
          </div>
          <div className="flex-1">
            <h3 className={clsx("text-lg font-black uppercase tracking-tight", isDark ? "text-white" : "text-gray-900")}>Уточнение адреса</h3>
            <p className={clsx("text-xs font-bold opacity-60", isDark ? "text-gray-400" : "text-gray-500")}>
              {title}
            </p>
          </div>
          <button
            onClick={() => onResolve(null)}
            className={clsx("p-2 rounded-xl transition-colors", isDark ? "hover:bg-white/10 text-gray-400" : "hover:bg-gray-100 text-gray-500")}
          >
            <TrashIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 max-h-[85vh] overflow-y-auto custom-scrollbar">
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
               <h4 className={clsx("text-[10px] font-black uppercase tracking-[0.2em] opacity-40")}>Ручной выбор на карте</h4>
               {options[0]?.res?.geometry?.location && (
                 <button 
                    onClick={() => {
                       const res = options[0].res;
                       const lat = typeof res.geometry.location.lat === 'function' ? res.geometry.location.lat() : res.geometry.location.lat;
                       const lng = typeof res.geometry.location.lng === 'function' ? res.geometry.location.lng() : res.geometry.location.lng;
                       if (mapInstanceRef.current) mapInstanceRef.current.setView([lat, lng], 16);
                    }}
                    className="text-[9px] font-bold text-blue-500 hover:underline"
                 >
                    Центрировать на результате
                 </button>
               )}
            </div>
            <div 
              id="disamb-map-container"
              className={clsx(
                "w-full h-64 rounded-xl border-2 overflow-hidden relative",
                isDark ? "bg-black/40 border-white/5" : "bg-gray-100 border-gray-100"
              )}
            >
              {/* Leaflet Map will be injected here */}
            </div>
            <p className={clsx("text-[9px] font-bold opacity-40 px-1 italic")}>
              * Кликните на карту, чтобы поставить точку вручную, затем нажмите «ПОДТВЕРДИТЬ МОЮ ТОЧКУ» ниже.
            </p>
            <div id="manual-selection-coord" className="hidden flex items-center justify-between bg-blue-500/10 p-2 rounded-lg border border-blue-500/20">
               <span className="text-[10px] font-bold text-blue-500 uppercase">Точка выбрана на карте</span>
               <button 
                 id="confirm-manual-btn"
                 className="hidden text-[10px] font-black uppercase tracking-widest bg-blue-500 text-white px-3 py-1 rounded-md shadow-lg shadow-blue-500/40 hover:scale-105 active:scale-95 transition-all"
               >
                 Подтвердить мою точку
               </button>
            </div>
          </div>

          <div 
            className="space-y-3 pt-2"
            style={{ 
              contentVisibility: 'auto',
              containIntrinsicSize: '0 500px'
            }}
          >
            <h4 className={clsx("text-[10px] font-black uppercase tracking-[0.2em] opacity-40 px-1")}>Результаты поиска ({options.length})</h4>
            {options.map((option, idx) => {
              const isTechnical = option.res?.zone?.name?.toLowerCase().includes('авторозвантаження') ||
                                option.res?.zone?.name?.toLowerCase().includes('разгрузка');

              return (
                <div key={`disamb-${idx}-${option.label}`} className="group relative">
                  <button
                    onClick={() => onResolve(option.res)}
                    className={clsx(
                      "w-full p-4 rounded-xl border text-left transition-all relative overflow-hidden",
                      isDark
                        ? "bg-white/5 border-white/10 hover:border-blue-500/50 hover:bg-white/10"
                        : "bg-gray-50 border-gray-100 hover:border-blue-400 hover:bg-white hover:shadow-lg"
                    )}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={clsx("text-sm font-bold", isDark ? "text-gray-200" : "text-gray-800")}>
                            {option.label}
                          </span>
                          {isTechnical && (
                            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-black uppercase">ТЕХНИЧЕСКИЙ</span>
                          )}
                          {/* Unified Badges v42.1 - Premium "Cool" Labels */}
                          <div className="flex flex-wrap items-center gap-1.5 mt-2">
                            {/* Verified Status v42.1 */}
                            {option.res.geometry.location_type === 'ROOFTOP' && (
                              <div className={clsx(
                                "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 transition-all duration-300 shadow-sm",
                                isDark ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-700"
                              )}>
                                <CheckBadgeIconSolid className="w-3.5 h-3.5" />
                                ТОЧНИЙ АДРЕС
                              </div>
                            )}

                            {/* Sector / Zone Info v42.3 (Smart Deduplication) */}
                            {option.res.kmlZone && (
                              <div className={clsx(
                                "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 transition-all duration-300 shadow-sm",
                                isTechnical
                                  ? (isDark ? "bg-amber-500/10 border-amber-500/30 text-amber-500" : "bg-amber-50 border-amber-200 text-amber-600")
                                  : (isDark ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300" : "bg-indigo-50 border-indigo-100 text-indigo-700")
                              )}>
                                <MapIconSolid className="w-3.5 h-3.5 opacity-70" />
                                <span className="opacity-60 mr-0.5">СЕКТОР:</span>
                                {`KML:${option.res.kmlHub ? option.res.kmlHub + ' - ' : ''}${option.res.kmlZone}`.toUpperCase()}
                              </div>
                            )}

                            {/* Street Match v42.1 */}
                            {option.res.geometry.location_type && (
                              <div className={clsx(
                                "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 transition-all duration-300 shadow-sm",
                                option.res.geometry.location_type !== 'APPROXIMATE'
                                  ? (isDark ? "bg-teal-500/10 border-teal-500/30 text-teal-400" : "bg-teal-50 border-teal-100 text-teal-700")
                                  : (isDark ? "bg-rose-500/10 border-rose-500/30 text-rose-400" : "bg-rose-50 border-rose-200 text-rose-700")
                              )}>
                                <MapIconSolid className="w-3.5 h-3.5 opacity-70" />
                                <span className="opacity-60 mr-0.5">ВУЛИЦЯ:</span>
                                {option.res.geometry.location_type !== 'APPROXIMATE' ? 'ТАК' : 'НІ'}
                              </div>
                            )}

                            {/* House Match v42.1 */}
                            {(option.res.geometry.location_type === 'RANGE_INTERPOLATED' || option.res.geometry.location_type === 'ROOFTOP') && (
                              <div className={clsx(
                                "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 transition-all duration-300 shadow-sm",
                                isDark ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400" : "bg-cyan-50 border-cyan-100 text-cyan-700"
                              )}>
                                <HomeIconSolid className="w-3.5 h-3.5 opacity-70" />
                                <span className="opacity-60 mr-0.5">БУДИНОК:</span>
                                ТАК
                              </div>
                            )}

                            {/* Unverified Warning - Only if coordinates are missing */}
                            {(!(option.res.geometry.location.lat || (option.res as any).coords?.lat) || !(option.res.geometry.location.lng || (option.res as any).coords?.lng)) && (
                              <div className={clsx(
                                "flex items-center gap-1.5 px-2 py-0.5 rounded-lg border text-[9px] font-black tracking-widest leading-none h-6 shadow-sm",
                                isDark ? "bg-amber-500/10 border-amber-500/30 text-amber-500" : "bg-amber-50 border-amber-200 text-amber-700 shadow-amber-500/10"
                              )}>
                                <ExclamationCircleIconSolid className="w-3.5 h-3.5" />
                                УТОЧНИТИ АДРЕСУ
                              </div>
                            )}

                            {option.distanceMeters !== undefined && (
                              <div className={clsx(
                                "px-2 py-0.5 rounded-lg border text-[9px] font-bold opacity-60 flex items-center h-6 transition-all duration-300 shadow-sm",
                                isDark ? 'bg-white/5 border-white/10 text-gray-300' : 'bg-gray-100 border-gray-200 text-gray-600'
                              )}>
                                ДИСТАНЦІЯ: {formatDisplayDistance(option.distanceMeters)}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
        
        <div className={clsx("p-4 border-t flex justify-end gap-3", isDark ? "bg-gray-800/50 border-white/5" : "bg-gray-50 border-gray-100")}>
           <button
             onClick={() => onResolve(null)}
             className={clsx(
               "px-6 py-2 rounded-xl text-xs font-black uppercase tracking-tighter transition-all",
               isDark ? "bg-white/5 hover:bg-white/10 text-gray-400" : "bg-white border hover:bg-gray-50 text-gray-700"
             )}
           >
             Отмена
           </button>
        </div>
      </div>
    </div>
  );
});
