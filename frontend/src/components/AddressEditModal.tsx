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
import { GeocodingService, GeocodingResult } from '../services/geocodingService'
import { AddressValidationService, AddressValidationResult } from '../services/addressValidation'

interface AddressEditModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (newAddress: string) => void
  currentAddress: string
  orderNumber: string
  customerName?: string
  isDark?: boolean
}

export const AddressEditModal: React.FC<AddressEditModalProps> = ({
  isOpen,
  onClose,
  onSave,
  currentAddress,
  orderNumber,
  customerName,
  isDark = false
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
      const result = await GeocodingService.geocodeAndCleanAddress(editedAddress, {
        region: 'UA',
        language: 'uk'
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
      onSave(editedAddress.trim())
      onClose()
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className={clsx(
        'rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto',
        isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
      )}>
        {/* Header */}
        <div className={clsx(
          'px-6 py-4 border-b',
          isDark ? 'border-gray-700' : 'border-gray-200'
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className={clsx(
                'p-2 rounded-lg',
                isDark ? 'bg-blue-900/50' : 'bg-blue-100'
              )}>
                <MapPinIcon className={clsx(
                  'h-6 w-6',
                  isDark ? 'text-blue-400' : 'text-blue-600'
                )} />
              </div>
              <div>
                <h3 className={clsx(
                  'text-lg font-semibold',
                  isDark ? 'text-gray-100' : 'text-gray-900'
                )}>
                  Редактирование адреса
                </h3>
                <p className={clsx(
                  'text-sm',
                  isDark ? 'text-gray-400' : 'text-gray-500'
                )}>
                  Заказ #{orderNumber} {customerName && `(${customerName})`}
                </p>
              </div>
            </div>
            <button
              onClick={handleCancel}
              className={clsx(
                'p-2 rounded-lg transition-colors',
                isDark 
                  ? 'text-gray-400 hover:text-gray-300 hover:bg-gray-700' 
                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
              )}
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-6">
          {/* Current Address */}
          <div>
            <label className={clsx(
              'block text-sm font-medium mb-2',
              isDark ? 'text-gray-300' : 'text-gray-700'
            )}>
              Текущий адрес
            </label>
            <div className={clsx(
              'p-3 rounded-lg border',
              isDark ? 'bg-gray-700 border-gray-600 text-gray-300' : 'bg-gray-50 border-gray-200 text-gray-600'
            )}>
              {currentAddress}
            </div>
          </div>

          {/* New Address Input */}
          <div>
            <label className={clsx(
              'block text-sm font-medium mb-2',
              isDark ? 'text-gray-300' : 'text-gray-700'
            )}>
              Новый адрес
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={editedAddress}
                onChange={(e) => setEditedAddress(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Введите новый адрес..."
                className={clsx(
                  'flex-1 px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors',
                  isDark 
                    ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400' 
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                )}
              />
              <button
                onClick={handleGeocode}
                disabled={!editedAddress.trim() || isGeocoding}
                className={clsx(
                  'px-4 py-3 rounded-lg font-medium transition-all duration-200 flex items-center space-x-2',
                  isGeocoding || !editedAddress.trim()
                    ? isDark 
                      ? 'bg-gray-700 text-gray-500 cursor-not-allowed' 
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : isDark
                      ? 'bg-blue-600 text-white hover:bg-blue-700'
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                )}
              >
                {isGeocoding ? (
                  <ArrowPathIcon className="h-5 w-5 animate-spin" />
                ) : (
                  <MagnifyingGlassIcon className="h-5 w-5" />
                )}
                <span>{isGeocoding ? 'Поиск...' : 'Найти'}</span>
              </button>
            </div>
          </div>

          {/* Validation Results */}
          {validationResult && (
            <div className="space-y-3">
              {/* Errors */}
              {validationResult.errors.length > 0 && (
                <div className={clsx(
                  'p-4 rounded-lg border-l-4',
                  isDark ? 'bg-red-900/20 border-red-500' : 'bg-red-50 border-red-500'
                )}>
                  <div className="flex items-center space-x-2 mb-2">
                    <ExclamationTriangleIcon className={clsx(
                      'h-5 w-5',
                      isDark ? 'text-red-400' : 'text-red-600'
                    )} />
                    <span className={clsx(
                      'font-medium',
                      isDark ? 'text-red-300' : 'text-red-800'
                    )}>
                      Ошибки в адресе
                    </span>
                  </div>
                  <ul className={clsx(
                    'text-sm space-y-1',
                    isDark ? 'text-red-300' : 'text-red-700'
                  )}>
                    {validationResult.errors.map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Warnings */}
              {validationResult.warnings.length > 0 && (
                <div className={clsx(
                  'p-4 rounded-lg border-l-4',
                  isDark ? 'bg-yellow-900/20 border-yellow-500' : 'bg-yellow-50 border-yellow-500'
                )}>
                  <div className="flex items-center space-x-2 mb-2">
                    <ExclamationTriangleIcon className={clsx(
                      'h-5 w-5',
                      isDark ? 'text-yellow-400' : 'text-yellow-600'
                    )} />
                    <span className={clsx(
                      'font-medium',
                      isDark ? 'text-yellow-300' : 'text-yellow-800'
                    )}>
                      Предупреждения
                    </span>
                  </div>
                  <ul className={clsx(
                    'text-sm space-y-1',
                    isDark ? 'text-yellow-300' : 'text-yellow-700'
                  )}>
                    {validationResult.warnings.map((warning, index) => (
                      <li key={index}>• {warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Suggestions */}
              {validationResult.suggestions.length > 0 && (
                <div className={clsx(
                  'p-4 rounded-lg border-l-4',
                  isDark ? 'bg-blue-900/20 border-blue-500' : 'bg-blue-50 border-blue-500'
                )}>
                  <div className="flex items-center space-x-2 mb-2">
                    <CheckCircleIcon className={clsx(
                      'h-5 w-5',
                      isDark ? 'text-blue-400' : 'text-blue-600'
                    )} />
                    <span className={clsx(
                      'font-medium',
                      isDark ? 'text-blue-300' : 'text-blue-800'
                    )}>
                      Рекомендации
                    </span>
                  </div>
                  <ul className={clsx(
                    'text-sm space-y-1',
                    isDark ? 'text-blue-300' : 'text-blue-700'
                  )}>
                    {validationResult.suggestions.map((suggestion, index) => (
                      <li key={index}>• {suggestion}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Geocoding Results */}
          {geocodingResult && (
            <div className={clsx(
              'p-4 rounded-lg border-l-4',
              geocodingResult.success 
                ? isDark ? 'bg-green-900/20 border-green-500' : 'bg-green-50 border-green-500'
                : isDark ? 'bg-red-900/20 border-red-500' : 'bg-red-50 border-red-500'
            )}>
              <div className="flex items-center space-x-2 mb-2">
                {geocodingResult.success ? (
                  <CheckCircleIcon className={clsx(
                    'h-5 w-5',
                    isDark ? 'text-green-400' : 'text-green-600'
                  )} />
                ) : (
                  <ExclamationTriangleIcon className={clsx(
                    'h-5 w-5',
                    isDark ? 'text-red-400' : 'text-red-600'
                  )} />
                )}
                <span className={clsx(
                  'font-medium',
                  geocodingResult.success 
                    ? isDark ? 'text-green-300' : 'text-green-800'
                    : isDark ? 'text-red-300' : 'text-red-800'
                )}>
                  {geocodingResult.success ? 'Адрес найден' : 'Ошибка поиска'}
                </span>
              </div>
              
              {geocodingResult.success ? (
                <div className="space-y-2">
                  <p className={clsx(
                    'text-sm',
                    isDark ? 'text-green-300' : 'text-green-700'
                  )}>
                    <strong>Найденный адрес:</strong> {geocodingResult.formattedAddress}
                  </p>
                  {geocodingResult.warnings && geocodingResult.warnings.length > 0 && (
                    <div className={clsx(
                      'text-sm',
                      isDark ? 'text-yellow-300' : 'text-yellow-700'
                    )}>
                      <strong>Предупреждения:</strong>
                      <ul className="ml-4 space-y-1">
                        {geocodingResult.warnings.map((warning, index) => (
                          <li key={index}>• {warning}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className={clsx(
                  'text-sm',
                  isDark ? 'text-red-300' : 'text-red-700'
                )}>
                  {geocodingResult.error}
                </p>
              )}
            </div>
          )}

          {/* Google Maps Integration */}
          <div>
            <label className={clsx(
              'block text-sm font-medium mb-2',
              isDark ? 'text-gray-300' : 'text-gray-700'
            )}>
              Выбор адреса на карте
            </label>
            <div className={clsx(
              'p-4 rounded-lg border h-64',
              isDark ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'
            )}>
              {/* Google Maps будет интегрирован здесь */}
              <div className="flex items-center justify-center h-full">
                <button
                  type="button"
                  onClick={() => {
                    const query = encodeURIComponent(editedAddress)
                    window.open(`https://www.google.com/maps/search/?api=1&query=${query}`, '_blank')
                  }}
                  className={clsx(
                    'px-4 py-2 rounded-lg font-medium transition-colors flex items-center space-x-2',
                    isDark 
                      ? 'bg-blue-600 text-white hover:bg-blue-700' 
                      : 'bg-blue-600 text-white hover:bg-blue-700'
                  )}
                >
                  <MapPinIcon className="h-5 w-5" />
                  <span>Открыть в Google Maps</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className={clsx(
          'px-6 py-4 border-t flex justify-end space-x-3',
          isDark ? 'border-gray-700' : 'border-gray-200'
        )}>
          <button
            onClick={handleCancel}
            className={clsx(
              'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
              isDark 
                ? 'text-gray-300 bg-gray-700 hover:bg-gray-600' 
                : 'text-gray-700 bg-gray-100 hover:bg-gray-200'
            )}
          >
            Отмена
          </button>
          <button
            onClick={handleSave}
              disabled={!editedAddress.trim() || (validationResult ? !validationResult.isValid : false)}
              className={clsx(
                'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                !editedAddress.trim() || (validationResult ? !validationResult.isValid : false)
                ? isDark 
                  ? 'text-gray-500 bg-gray-700 cursor-not-allowed' 
                  : 'text-gray-400 bg-gray-100 cursor-not-allowed'
                : isDark
                  ? 'text-white bg-blue-600 hover:bg-blue-700'
                  : 'text-white bg-blue-600 hover:bg-blue-700'
            )}
          >
            Сохранить адрес
          </button>
        </div>
      </div>
    </div>
  )
}
