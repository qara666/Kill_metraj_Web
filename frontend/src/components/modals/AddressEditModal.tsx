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
import { AddressValidationService, AddressValidationResult } from '../../services/addressValidation'

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
  const [validationResult, setValidationResult] = useState<AddressValidationResult | null>(null)

  // Сбрасываем состояние при открытии модального окна
  useEffect(() => {
    if (isOpen) {
      setEditedAddress(currentAddress)
      setGeocodingResult(null)
      setValidationResult(null)
    }
  }, [isOpen, currentAddress])

  // Валидация адреса при изменении
  useEffect(() => {
    if (editedAddress.trim()) {
      const validation = AddressValidationService.validateAddress(editedAddress)
      setValidationResult(validation)
    } else {
      setValidationResult(null)
    }
  }, [editedAddress])

  const handleGeocode = async () => {
    if (!editedAddress.trim()) return

    setIsGeocoding(true)
    setGeocodingResult(null)

    try {
      // v5.52: Apply city context to prevent finding addresses in other cities (e.g. Lviv)
      let queryAddress = editedAddress;
      if (cityContext && !queryAddress.toLowerCase().includes(cityContext.toLowerCase())) {
        queryAddress = `${queryAddress}, ${cityContext}, Україна`;
      }

      const result = await GeocodingService.geocodeAndCleanAddress(queryAddress, {
        region: 'UA',
        language: 'uk',
        bounds: activeBounds
      })

      setGeocodingResult(result)

      if (result.success) {
        setEditedAddress(result.formattedAddress)
      }
    } catch (error) {
      console.error('Ошибка геокодирования:', error)
      setGeocodingResult({
        success: false,
        formattedAddress: editedAddress,
        error: 'Ошибка при геокодировании адреса'
      })
    } finally {
      setIsGeocoding(false)
    }
  }

  const handleSave = () => {
    if (editedAddress.trim()) {
      let coords: { lat: number; lng: number } | undefined;

      // If we have a successful geocoding result with coordinates, lock them in
      if (geocodingResult?.success && geocodingResult.latitude !== undefined && geocodingResult.longitude !== undefined) {
        coords = { lat: geocodingResult.latitude, lng: geocodingResult.longitude };
      }

      onSave(editedAddress.trim(), coords);
      onClose();
    }
  }

  const handleCancel = () => {
    setEditedAddress(currentAddress)
    setGeocodingResult(null)
    setValidationResult(null)
    onClose()
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isGeocoding) {
      handleGeocode()
    }
  }

  if (!isOpen) return null

  return createPortal(
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[9999] animate-in fade-in duration-300">
      <div className={clsx(
        'rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col border',
        'animate-in zoom-in-95 duration-300',
        isDark ? 'bg-gray-800 border-white/10' : 'bg-white border-gray-200'
      )}>
        {/* Header */}
        <div className={clsx(
          'px-6 py-4 border-b shrink-0',
          isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-100 bg-gray-50'
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={clsx(
                'p-2 rounded-xl',
                isDark ? 'bg-blue-900/40 text-blue-400' : 'bg-blue-50 text-blue-600'
              )}>
                <MapPinIcon className="h-6 w-6" />
              </div>
              <div>
                <h3 className={clsx(
                  'text-lg font-black tracking-tight',
                  isDark ? 'text-white' : 'text-gray-900'
                )}>
                  Редактирование адреса
                </h3>
                <p className={clsx(
                  'text-[10px] font-black uppercase tracking-widest opacity-60',
                  isDark ? 'text-gray-400' : 'text-gray-500'
                )}>
                  Заказ #{orderNumber} {customerName && `(${customerName})`}
                </p>
              </div>
            </div>
            <button
              onClick={handleCancel}
              className={clsx(
                'p-2 rounded-xl transition-all hover:scale-110 active:scale-95',
                isDark
                  ? 'text-gray-400 hover:text-white hover:bg-white/5'
                  : 'text-gray-400 hover:text-gray-900 hover:bg-gray-100'
              )}
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-6 overflow-y-auto custom-scrollbar flex-1">
          {/* Current Address */}
          <div className="space-y-2">
            <label className={clsx(
              'text-[10px] font-black uppercase tracking-widest block opacity-60 px-1',
              isDark ? 'text-gray-400' : 'text-gray-500'
            )}>
              Текущий адрес
            </label>
            <div className={clsx(
              'p-4 rounded-xl border border-dashed text-sm font-bold',
              isDark ? 'bg-white/5 border-white/10 text-gray-300' : 'bg-gray-50 border-gray-200 text-gray-600'
            )}>
              {currentAddress}
            </div>
          </div>

          {/* New Address Input */}
          <div className="space-y-2">
            <label className={clsx(
              'text-[10px] font-black uppercase tracking-widest block opacity-60 px-1',
              isDark ? 'text-gray-400' : 'text-gray-500'
            )}>
              Новый адрес
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={editedAddress}
                onChange={(e) => setEditedAddress(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Введите новый адрес..."
                className={clsx(
                  'flex-1 px-4 py-3 border-2 rounded-xl text-sm font-bold outline-none transition-all',
                  isDark
                    ? 'bg-gray-700 border-white/5 text-white placeholder-gray-500 focus:border-blue-500/50 focus:bg-gray-700/50'
                    : 'bg-white border-gray-100 text-gray-900 placeholder-gray-400 focus:border-blue-400 focus:bg-blue-50/20'
                )}
              />
              <button
                onClick={handleGeocode}
                disabled={!editedAddress.trim() || isGeocoding}
                className={clsx(
                  'px-6 py-3 rounded-xl font-black uppercase tracking-widest text-[10px] transition-all flex items-center gap-2 shadow-lg shadow-blue-500/20',
                  isGeocoding || !editedAddress.trim()
                    ? isDark
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed opacity-50'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700 active:scale-95'
                )}
              >
                {isGeocoding ? (
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                ) : (
                  <MagnifyingGlassIcon className="h-4 w-4" />
                )}
                <span>{isGeocoding ? 'Поиск...' : 'Найти'}</span>
              </button>
            </div>
          </div>

          {/* Validation Results */}
          {validationResult && (
            <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
              {/* Errors */}
              {validationResult.errors.length > 0 && (
                <div className={clsx(
                  'p-4 rounded-xl border-2',
                  isDark ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-red-50 border-red-100 text-red-600'
                )}>
                  <div className="flex items-center space-x-2 mb-2">
                    <ExclamationTriangleIcon className="h-5 w-5" />
                    <span className="text-xs font-black uppercase tracking-widest">
                      Ошибки в адресе
                    </span>
                  </div>
                  <ul className="text-xs font-bold space-y-1 pl-7 opacity-80">
                    {validationResult.errors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Geocoding Results */}
          {geocodingResult && (
            <div className={clsx(
              'p-4 rounded-xl border-2 animate-in fade-in slide-in-from-top-2 duration-300',
              geocodingResult.success
                ? isDark ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-green-50 border-green-100 text-green-600'
                : isDark ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-red-50 border-red-100 text-red-600'
            )}>
              <div className="flex items-center space-x-2 mb-2">
                {geocodingResult.success ? (
                  <CheckCircleIcon className="h-5 w-5" />
                ) : (
                  <ExclamationTriangleIcon className="h-5 w-5" />
                )}
                <span className="text-xs font-black uppercase tracking-widest">
                  {geocodingResult.success ? 'Адрес найден' : 'Ошибка поиска'}
                </span>
              </div>

              <div className="pl-7 space-y-2">
                {geocodingResult.success ? (
                  <>
                    <p className="text-sm font-bold break-words">{geocodingResult.formattedAddress}</p>
                    {geocodingResult.warnings && geocodingResult.warnings.length > 0 && (
                      <div className={clsx(
                        'text-[10px] font-black uppercase tracking-widest opacity-80 mt-2',
                        isDark ? 'text-amber-400' : 'text-amber-600'
                      )}>
                        Предупреждения:
                        <ul className="mt-1 space-y-1 list-none lowercase first-letter:uppercase">
                          {geocodingResult.warnings.map((warning, index) => (
                            <li key={index}>• {warning}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm font-bold">{geocodingResult.error}</p>
                )}
              </div>
            </div>
          )}

          {/* Map Link */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => {
                const query = encodeURIComponent(editedAddress)
                window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank')
              }}
              className={clsx(
                'w-full p-4 rounded-xl border-2 transition-all group flex items-center justify-between',
                isDark
                  ? 'bg-white/5 border-white/5 hover:border-blue-500/50 hover:bg-blue-500/5'
                  : 'bg-gray-50 border-gray-100 hover:border-blue-300 hover:bg-blue-50/30'
              )}
            >
              <div className="flex items-center gap-3">
                <div className={clsx(
                  "p-2 rounded-lg flex items-center justify-center",
                  isDark ? "bg-blue-500/20 text-blue-400" : "bg-blue-600 text-white"
                )}>
                  <MapPinIcon className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <p className={clsx("text-sm font-black", isDark ? "text-white" : "text-gray-900")}>Открыть в Google Maps</p>
                  <p className={clsx("text-[10px] font-bold opacity-50", isDark ? "text-gray-400" : "text-gray-500")}>проверить местоположение вручную</p>
                </div>
              </div>
              <ArrowPathIcon className="h-4 w-4 text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className={clsx(
          'px-6 py-4 border-t flex justify-end gap-3 shrink-0',
          isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-100 bg-gray-50'
        )}>
          <button
            onClick={handleCancel}
            className={clsx(
              'px-6 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all',
              isDark
                ? 'text-gray-400 bg-gray-700 hover:text-white hover:bg-gray-600'
                : 'text-gray-500 bg-white border border-gray-200 hover:bg-gray-50 hover:text-gray-700'
            )}
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
            disabled={!editedAddress.trim() || (validationResult ? !validationResult.isValid : false)}
            className={clsx(
              'px-8 py-2.5 text-xs font-black uppercase tracking-widest rounded-xl transition-all shadow-xl',
              !editedAddress.trim() || (validationResult ? !validationResult.isValid : false)
                ? isDark
                  ? 'text-gray-500 bg-gray-700 cursor-not-allowed grayscale'
                  : 'text-gray-400 bg-gray-100 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/20 active:scale-95'
            )}
          >
            Сохранить адрес
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
