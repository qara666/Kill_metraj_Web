import React, { useState, useEffect } from 'react'
import {
  XMarkIcon,
  MapPinIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  MagnifyingGlassIcon
} from '@heroicons/react/24/outline'
import { clsx } from 'clsx'
import { GeocodingService, GeocodingResult } from '../../services/geocodingService'
import { AddressValidationService } from '../../services/addressValidation'

import { robustGeocodingService } from '../../services/robust-geocoding/RobustGeocodingService'
import { getCityBounds } from '../../services/robust-geocoding/cityBounds'
import {
  CheckBadgeIcon,
  HomeIcon,
  MapIcon,
  ExclamationCircleIcon
} from '@heroicons/react/24/solid'

// v6.33: РУССКАЯ ЛОКАЛИЗАЦИЯ (AddressEditModal)
// Все статусы и метрики переведены на русский язык

interface AddressEditModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (newAddress: string, coords?: { lat: number; lng: number }) => void
  currentAddress: string
  orderNumber: string
  customerName?: string
  isDark?: boolean
  cityContext?: string
  activeBounds?: any
}

import { createPortal } from 'react-dom'
import { loadLeaflet } from '../../utils/maps/leafletLoader'

export const AddressEditModal: React.FC<AddressEditModalProps> = ({
  isOpen,
  onClose,
  onSave,
  currentAddress,
  orderNumber,
  customerName,
  isDark = false,
  cityContext,
  activeBounds
}) => {
  const [editedAddress, setEditedAddress] = useState(currentAddress)
  const [isGeocoding, setIsGeocoding] = useState(false)
  const [geocodingResult, setGeocodingResult] = useState<GeocodingResult | null>(null)
  const [kmlZone, setKmlZone] = useState<string | null>(null)
  const [kmlHub, setKmlHub] = useState<string | null>(null)
  const [manualCoords, setManualCoords] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    if (isOpen) {
      setEditedAddress(currentAddress)
      setGeocodingResult(null)
      setManualCoords(null)
      setKmlZone(null)
      setKmlHub(null)
    }
  }, [isOpen, currentAddress])

  useEffect(() => {
    if (editedAddress.trim()) {
      AddressValidationService.validateAddress(editedAddress)
    }
  }, [editedAddress])

  useEffect(() => {
    if (!isOpen) return;

    let map: any = null;
    let marker: any = null;

    const initMap = async () => {
      await new Promise(r => setTimeout(r, 100));
      const container = document.getElementById('edit-address-map');
      if (!container || (container as any)._leafletMap) return;

      try {
        const L = await loadLeaflet();
        let center: [number, number] = [50.4501, 30.5234];
        const cityInfo = getCityBounds(cityContext || currentAddress);
        if (cityInfo && cityInfo.center) center = [cityInfo.center[1], cityInfo.center[0]];
        if (geocodingResult?.latitude && geocodingResult?.longitude) center = [geocodingResult.latitude, geocodingResult.longitude];

        map = L.map(container, { zoomControl: false }).setView(center, 13);
        const tileUrl = isDark ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png' : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
        L.tileLayer(tileUrl).addTo(map);

        map.on('click', (e: any) => {
          const { lat, lng } = e.latlng;
          setManualCoords({ lat, lng });
          if (marker) marker.remove();
          marker = L.marker([lat, lng], {
            icon: L.divIcon({
              className: 'custom-manual-icon',
              html: `<div style="background-color: #ef4444; width: 14px; height: 14px; border: 2px solid white; border-radius: 50%; box-shadow: 0 0 10px rgba(239,68,68,0.5);"></div>`,
              iconSize: [14, 14], iconAnchor: [7, 7]
            })
          }).addTo(map);
        });
        (container as any)._leafletMap = map;
      } catch (err) { console.error('Failed to init edit address map:', err); }
    };
    initMap();
    return () => { if (map) { map.remove(); map = null; } };
  }, [isOpen, isDark]);

  useEffect(() => {
    if (geocodingResult?.latitude && geocodingResult?.longitude) {
      const map = (document.getElementById('edit-address-map') as any)?._leafletMap;
      if (map) map.setView([geocodingResult.latitude, geocodingResult.longitude], 16);
    }
  }, [geocodingResult]);

  const handleGeocode = async () => {
    if (!editedAddress.trim()) return
    setIsGeocoding(true); setGeocodingResult(null)
    try {
      let queryAddress = editedAddress;
      if (cityContext && !queryAddress.toLowerCase().includes(cityContext.toLowerCase())) queryAddress = `${queryAddress}, ${cityContext}, Украина`;
      const result = await GeocodingService.geocodeAndCleanAddress(queryAddress, { region: 'UA', language: 'ru', bounds: activeBounds })
      if (result.success && result.latitude && result.longitude) {
        const cityMatch = !cityContext || result.formattedAddress.toLowerCase().includes(cityContext.toLowerCase()) || (cityContext.toLowerCase() === 'киев' && result.formattedAddress.toLowerCase().includes('київ')) || (cityContext.toLowerCase() === 'київ' && result.formattedAddress.toLowerCase().includes('киев'));
        if (!cityMatch) { setGeocodingResult({ success: false, formattedAddress: result.formattedAddress, error: `Найден адрес в другом городе. Пожалуйста, укажите "${cityContext}" в поиске.` }); setIsGeocoding(false); return; }
        const zoneInfo = await robustGeocodingService.findZoneForCoords(result.latitude, result.longitude);
        const hasActiveZones = (robustGeocodingService.getZoneContext()?.activePolygons?.length || 0) > 0;
        if (hasActiveZones && !zoneInfo) { setGeocodingResult({ success: false, formattedAddress: result.formattedAddress, error: 'Адрес вне активных зон доставки. Используйте ручной выбор на карте.' }); setKmlZone(null); setKmlHub(null); setIsGeocoding(false); return; }
        setGeocodingResult(result); setEditedAddress(result.formattedAddress); setKmlZone(zoneInfo?.zoneName || null); setKmlHub(zoneInfo?.hubName || null);
      } else { setGeocodingResult(result); }
    } catch (error) { setGeocodingResult({ success: false, formattedAddress: editedAddress, error: 'Ошибка при геокодировании адреса' }) } finally { setIsGeocoding(false) }
  }

  const handleSave = () => { if (editedAddress.trim() || manualCoords) { let coords = manualCoords || (geocodingResult?.success ? { lat: geocodingResult.latitude!, lng: geocodingResult.longitude! } : undefined); onSave(editedAddress.trim() || 'Выбрано на карте', coords); onClose(); } }
  const handleCancel = () => { setEditedAddress(currentAddress); setGeocodingResult(null); onClose(); }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999]">
      <div className={clsx('rounded-3xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col border', isDark ? 'bg-gray-800 border-white/10' : 'bg-white border-gray-200')}>
        <div className={clsx('px-7 py-5 border-b shrink-0', isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-100 bg-gray-50')}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className={clsx('p-3 rounded-2xl', isDark ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-50 text-blue-600')}><MapPinIcon className="h-6 w-6" /></div>
              <div><h3 className={clsx('text-lg font-black tracking-tight', isDark ? 'text-white' : 'text-gray-900')}>Редактирование адреса</h3><p className={clsx('text-[10px] font-black uppercase tracking-widest opacity-60', isDark ? 'text-gray-400' : 'text-gray-500')}>Заказ #{orderNumber} {customerName && `(${customerName})`}</p></div>
            </div>
            <button onClick={handleCancel} className={clsx('p-3 rounded-2xl transition-all hover:scale-110', isDark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100')}><XMarkIcon className="h-6 w-6" /></button>
          </div>
        </div>

        <div className="px-7 py-6 space-y-6 overflow-y-auto flex-1">
          <div className="space-y-2">
            <label className="text-[10px] font-black uppercase tracking-widest opacity-40 px-1">Текущий адрес</label>
            <div className={clsx('p-5 rounded-2xl border border-dashed text-sm font-bold', isDark ? 'bg-white/5 border-white/10 text-gray-300' : 'bg-gray-50 border-gray-200 text-gray-600')}>{currentAddress}</div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black uppercase tracking-widest opacity-40 px-1">Новый адрес</label>
            <div className="flex gap-3">
              <input type="text" value={editedAddress} onChange={(e) => setEditedAddress(e.target.value)} onKeyPress={(e) => e.key==='Enter' && !isGeocoding && handleGeocode()} placeholder="Введите новый адрес..." className={clsx('flex-1 px-5 py-4 border-2 rounded-2xl text-sm font-bold outline-none transition-all', isDark ? 'bg-gray-700 border-white/5 text-white placeholder-gray-500 focus:border-blue-500' : 'bg-white border-gray-100 text-gray-900 placeholder-gray-400 focus:border-blue-400')} />
              <button onClick={handleGeocode} disabled={!editedAddress.trim() || isGeocoding} className={clsx('px-8 py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center gap-2 shadow-lg', isGeocoding || !editedAddress.trim() ? 'opacity-50 cursor-not-allowed' : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95')}>{isGeocoding ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <MagnifyingGlassIcon className="h-4 w-4" />}<span>{isGeocoding ? 'Поиск...' : 'Найти'}</span></button>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between px-1"><h4 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-40">Ручной выбор на карте</h4></div>
            <div id="edit-address-map" className={clsx("w-full h-72 rounded-2xl border-2 overflow-hidden relative", isDark ? "bg-black/40 border-white/5" : "bg-gray-100 border-gray-100")}></div>
            <p className="text-[9px] font-bold opacity-30 px-1 italic">* Кликните на карту, чтобы установить точку вручную.</p>
          </div>

          {geocodingResult?.success && (
            <div className={clsx('p-5 rounded-3xl border-2', isDark ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-green-50 border-green-100 text-green-600')}>
              <div className="flex items-center space-x-3 mb-3"><CheckCircleIcon className="h-6 w-6" /><span className="text-xs font-black uppercase tracking-widest">Адрес найден</span></div>
              <div className="pl-9 space-y-4">
                <p className="text-sm font-black leading-tight">{geocodingResult.formattedAddress}</p>
                <div className="flex flex-wrap gap-2">
                  {geocodingResult.locationType === 'ROOFTOP' && <div className={clsx("flex items-center gap-1.5 px-3 py-1 rounded-xl border text-[9px] font-black tracking-widest leading-none h-7", isDark ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-emerald-50 border-emerald-200 text-emerald-700")}><CheckBadgeIcon className="w-4 h-4" />ТОЧНЫЙ АДРЕС</div>}
                  {manualCoords && <div className={clsx("flex items-center gap-1.5 px-3 py-1 rounded-xl border text-[9px] font-black tracking-widest leading-none h-7", isDark ? "bg-green-500/10 border-green-500/30 text-green-400" : "bg-green-50 border-green-200 text-green-700")}><CheckBadgeIcon className="w-4 h-4" />ПРОВЕРЕНО</div>}
                  {(kmlZone || kmlHub) && <div className={clsx("flex items-center gap-1.5 px-3 py-1 rounded-xl border text-[9px] font-black tracking-widest leading-none h-7", isDark ? "bg-indigo-500/10 border-indigo-500/30 text-indigo-300" : "bg-indigo-50 border-indigo-100 text-indigo-700")}><MapIcon className="w-4 h-4" /><span className="opacity-60">СЕКТОР:</span>{`${kmlHub ? kmlHub + ' - ' : ''}${kmlZone}`.toUpperCase()}</div>}
                  {geocodingResult.locationType && <div className={clsx("flex items-center gap-1.5 px-3 py-1 rounded-xl border text-[9px] font-black tracking-widest leading-none h-7", isDark ? "bg-teal-500/10 border-teal-500/30 text-teal-400" : "bg-teal-50 border-teal-100 text-teal-700")}><MapIcon className="w-4 h-4" /><span className="opacity-60">УЛИЦА:</span>{geocodingResult.locationType !== 'APPROXIMATE' ? 'ДА' : 'НЕТ'}</div>}
                  {(geocodingResult.locationType === 'ROOFTOP' || geocodingResult.locationType === 'RANGE_INTERPOLATED') && <div className={clsx("flex items-center gap-1.5 px-3 py-1 rounded-xl border text-[9px] font-black tracking-widest leading-none h-7", isDark ? "bg-cyan-500/10 border-cyan-500/30 text-cyan-400" : "bg-cyan-50 border-cyan-100 text-cyan-700")}><HomeIcon className="w-4 h-4" /><span className="opacity-60">ДОМ:</span>ДА</div>}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className={clsx('px-7 py-6 border-t flex items-center justify-between shrink-0', isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-100 bg-gray-50')}>
          <div>{manualCoords && <div className="flex items-center gap-2 animate-pulse"><div className="w-2.5 h-2.5 rounded-full bg-red-500" /><span className="text-[10px] font-black uppercase tracking-widest opacity-50">Точка установлена вручную</span></div>}</div>
          <div className="flex gap-4"><button onClick={handleCancel} className={clsx('px-8 py-3.5 text-[10px] font-black uppercase tracking-widest rounded-2xl transition-all', isDark ? 'text-gray-400 bg-gray-700 hover:text-white' : 'text-gray-500 bg-white border border-gray-200 hover:bg-gray-50')}>Отмена</button><button onClick={handleSave} disabled={!editedAddress.trim() && !manualCoords} className="px-10 py-3.5 bg-blue-600 text-white text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-blue-700 active:scale-95 shadow-xl shadow-blue-600/20">{manualCoords ? 'Подтвердить точку' : 'Сохранить адрес'}</button></div>
        </div>
      </div>
    </div>,
    document.body
  )
}
