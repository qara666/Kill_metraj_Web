import React, { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import {
    XMarkIcon,
    MapPinIcon,
    ExclamationTriangleIcon,
    CheckCircleIcon,
    SparklesIcon,
    ClockIcon,
} from '@heroicons/react/24/outline';
import type { Order } from '../../types';
import type { AddressSuggestion, ValidationResult } from '@/services/addressZoneValidator';
import { getAddressZoneValidator } from '@/services/addressZoneValidator';

interface SmartAddressCorrectionModalProps {
    order: Order;
    validationResult: ValidationResult;
    isDark?: boolean;
    onApplyCorrection: (suggestion: AddressSuggestion) => void;
    onManualEdit: (newAddress: string) => void;
    onSkip: () => void;
    onClose: () => void;
}

export const SmartAddressCorrectionModal: React.FC<SmartAddressCorrectionModalProps> = ({
    order,
    validationResult,
    isDark = false,
    onApplyCorrection,
    onManualEdit,
    onSkip,
    onClose,
}) => {
    const [selectedSuggestion, setSelectedSuggestion] = useState<AddressSuggestion | null>(null);
    const [manualAddress, setManualAddress] = useState('');
    const [showManualInput, setShowManualInput] = useState(false);

    const validator = getAddressZoneValidator();
    const suggestions = validationResult.suggestedCorrections || [];
    const bestSuggestion = suggestions.length > 0 ? suggestions[0] : null;

    // Автоматически выбираем лучший вариант
    useEffect(() => {
        if (bestSuggestion && !selectedSuggestion) {
            setSelectedSuggestion(bestSuggestion);
        }
    }, [bestSuggestion, selectedSuggestion]);

    const handleApply = () => {
        if (showManualInput && manualAddress.trim()) {
            onManualEdit(manualAddress.trim());
        } else if (selectedSuggestion) {
            onApplyCorrection(selectedSuggestion);
        }
    };

    const getConfidenceColor = (confidence: number) => {
        if (confidence >= 80) return 'text-green-500';
        if (confidence >= 50) return 'text-yellow-500';
        return 'text-orange-500';
    };

    const getConfidenceBadge = (confidence: number) => {
        if (confidence >= 80) return { text: 'Высокая', color: 'bg-green-500' };
        if (confidence >= 50) return { text: 'Средняя', color: 'bg-yellow-500' };
        return { text: 'Низкая', color: 'bg-orange-500' };
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div
                className={clsx(
                    'relative w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-3xl shadow-2xl border-2',
                    isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
                )}
            >
                {/* Header */}
                <div
                    className={clsx(
                        'p-6 border-b-2',
                        isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gradient-to-r from-orange-50 to-red-50 border-orange-200'
                    )}
                >
                    <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                            <div className="p-3 rounded-2xl bg-orange-500/10">
                                <ExclamationTriangleIcon className="w-8 h-8 text-orange-500" />
                            </div>
                            <div>
                                <h2 className={clsx('text-2xl font-bold mb-1', isDark ? 'text-white' : 'text-gray-900')}>
                                    ⚠️ Адрес вне зоны доставки
                                </h2>
                                <p className={clsx('text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>
                                    Заказ #{order.orderNumber} • {order.customerName || 'Клиент'}
                                </p>
                                {validationResult.distanceToNearestZone && (
                                    <p className="text-sm text-orange-500 mt-1">
                                        📏 {validator.formatDistance(validationResult.distanceToNearestZone)} от ближайшей зоны
                                    </p>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className={clsx(
                                'p-2 rounded-xl transition-all',
                                isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'
                            )}
                        >
                            <XMarkIcon className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Original Address */}
                <div className={clsx('p-6 border-b-2', isDark ? 'bg-gray-800/30 border-gray-700' : 'bg-gray-50 border-gray-200')}>
                    <div className="flex items-start gap-3">
                        <MapPinIcon className="w-5 h-5 text-red-500 mt-1 flex-shrink-0" />
                        <div className="flex-1">
                            <p className="text-xs font-bold text-gray-500 uppercase mb-1">Оригинальный адрес</p>
                            <p className={clsx('font-medium', isDark ? 'text-white' : 'text-gray-900')}>{order.address}</p>
                        </div>
                    </div>
                </div>

                {/* Suggestions */}
                <div className="p-6 overflow-y-auto max-h-[50vh]">
                    {suggestions.length > 0 ? (
                        <>
                            <div className="flex items-center gap-2 mb-4">
                                <SparklesIcon className="w-5 h-5 text-blue-500" />
                                <h3 className={clsx('text-lg font-bold', isDark ? 'text-white' : 'text-gray-900')}>
                                    Умные предложения ({suggestions.length})
                                </h3>
                            </div>

                            <div className="space-y-3">
                                {suggestions.map((suggestion, index) => {
                                    const isSelected = selectedSuggestion === suggestion;
                                    const badge = getConfidenceBadge(suggestion.confidence);

                                    return (
                                        <button
                                            key={index}
                                            onClick={() => {
                                                setSelectedSuggestion(suggestion);
                                                setShowManualInput(false);
                                            }}
                                            className={clsx(
                                                'w-full p-4 rounded-2xl border-2 transition-all text-left',
                                                isSelected
                                                    ? isDark
                                                        ? 'bg-blue-500/10 border-blue-500 shadow-lg'
                                                        : 'bg-blue-50 border-blue-500 shadow-lg'
                                                    : isDark
                                                        ? 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
                                                        : 'bg-white border-gray-200 hover:border-blue-300 shadow-sm'
                                            )}
                                        >
                                            <div className="flex items-start gap-3">
                                                <div
                                                    className={clsx(
                                                        'p-2 rounded-lg flex-shrink-0',
                                                        isSelected
                                                            ? 'bg-blue-500 text-white'
                                                            : isDark
                                                                ? 'bg-gray-700 text-gray-400'
                                                                : 'bg-gray-100 text-gray-500'
                                                    )}
                                                >
                                                    {isSelected ? (
                                                        <CheckCircleIcon className="w-5 h-5" />
                                                    ) : (
                                                        <MapPinIcon className="w-5 h-5" />
                                                    )}
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-2 mb-2">
                                                        <p className={clsx('font-bold', isDark ? 'text-white' : 'text-gray-900')}>
                                                            {suggestion.address}
                                                        </p>
                                                        <div className="flex items-center gap-2 flex-shrink-0">
                                                            <span className={clsx('text-sm font-bold', getConfidenceColor(suggestion.confidence))}>
                                                                {suggestion.confidence}%
                                                            </span>
                                                            <span
                                                                className={clsx(
                                                                    'px-2 py-1 rounded-lg text-xs font-bold text-white',
                                                                    badge.color
                                                                )}
                                                            >
                                                                {badge.text}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-wrap gap-2 text-xs">
                                                        <span
                                                            className={clsx(
                                                                'px-2 py-1 rounded-lg',
                                                                isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
                                                            )}
                                                        >
                                                            ✓ В зоне "{suggestion.zone.name}"
                                                        </span>
                                                        <span
                                                            className={clsx(
                                                                'px-2 py-1 rounded-lg',
                                                                isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'
                                                            )}
                                                        >
                                                            📏 {validator.formatDistance(suggestion.distanceFromOriginal)} от оригинала
                                                        </span>
                                                        {suggestion.isHistorical && (
                                                            <span className="px-2 py-1 rounded-lg bg-purple-500/20 text-purple-600 flex items-center gap-1">
                                                                <ClockIcon className="w-3 h-3" />
                                                                Использовался ранее
                                                            </span>
                                                        )}
                                                    </div>

                                                    <p className={clsx('text-xs mt-2', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                                        {suggestion.reason}
                                                    </p>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </>
                    ) : (
                        <div className="text-center py-8">
                            <ExclamationTriangleIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                            <p className={clsx('text-sm', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                Не удалось найти автоматические предложения
                            </p>
                        </div>
                    )}

                    {/* Manual Input */}
                    <div className="mt-6">
                        <button
                            onClick={() => setShowManualInput(!showManualInput)}
                            className={clsx(
                                'w-full p-3 rounded-xl border-2 border-dashed transition-all text-sm font-medium',
                                isDark
                                    ? 'border-gray-700 text-gray-400 hover:border-gray-600 hover:bg-gray-800/50'
                                    : 'border-gray-300 text-gray-600 hover:border-gray-400 hover:bg-gray-50'
                            )}
                        >
                            {showManualInput ? '✕ Отменить ручной ввод' : '✏️ Ввести адрес вручную'}
                        </button>

                        {showManualInput && (
                            <div className="mt-3">
                                <input
                                    type="text"
                                    value={manualAddress}
                                    onChange={(e) => setManualAddress(e.target.value)}
                                    placeholder="Введите новый адрес..."
                                    className={clsx(
                                        'w-full px-4 py-3 rounded-xl border-2 outline-none transition-all',
                                        isDark
                                            ? 'bg-gray-800 border-gray-700 text-white focus:border-blue-500'
                                            : 'bg-white border-gray-200 focus:border-blue-400'
                                    )}
                                    autoFocus
                                />
                            </div>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div
                    className={clsx(
                        'p-6 border-t-2 flex items-center justify-between gap-3',
                        isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'
                    )}
                >
                    <button
                        onClick={onSkip}
                        className={clsx(
                            'px-6 py-3 rounded-xl font-medium transition-all',
                            isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-white text-gray-700 hover:bg-gray-100 border-2'
                        )}
                    >
                        Пропустить заказ
                    </button>

                    <div className="flex gap-3">
                        {bestSuggestion && validator.canAutoCorrect(bestSuggestion) && !showManualInput && (
                            <button
                                onClick={() => onApplyCorrection(bestSuggestion)}
                                className="px-6 py-3 rounded-xl font-medium bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 transition-all shadow-lg flex items-center gap-2"
                            >
                                <SparklesIcon className="w-5 h-5" />
                                Применить лучший вариант
                            </button>
                        )}

                        <button
                            onClick={handleApply}
                            disabled={!selectedSuggestion && !manualAddress.trim()}
                            className={clsx(
                                'px-6 py-3 rounded-xl font-medium transition-all shadow-lg',
                                !selectedSuggestion && !manualAddress.trim()
                                    ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                                    : 'bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800'
                            )}
                        >
                            {showManualInput ? 'Применить вручную' : 'Применить выбранный'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
