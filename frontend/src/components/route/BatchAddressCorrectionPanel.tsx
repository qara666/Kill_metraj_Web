import React, { useState, useMemo } from 'react';
import { clsx } from 'clsx';
import {
    ExclamationTriangleIcon,
    SparklesIcon,
    CheckCircleIcon,
    EyeIcon,
    ChevronRightIcon,
} from '@heroicons/react/24/outline';
import type { Order } from '../../types';
import type { ValidationResult, AddressSuggestion } from '../../services/addressZoneValidator';
import { getAddressZoneValidator } from '../../services/addressZoneValidator';

interface BatchAddressCorrectionPanelProps {
    problemOrders: Array<{ order: Order; validationResult: ValidationResult }>;
    isDark?: boolean;
    onAutoCorrectAll: (corrections: Map<string, AddressSuggestion>) => void;
    onReviewManually: () => void;
    onClose: () => void;
}

export const BatchAddressCorrectionPanel: React.FC<BatchAddressCorrectionPanelProps> = ({
    problemOrders,
    isDark = false,
    onAutoCorrectAll,
    onReviewManually,
    onClose,
}) => {
    const [processing, setProcessing] = useState(false);
    const [processed, setProcessed] = useState(0);

    const validator = getAddressZoneValidator();

    // Анализируем заказы
    const analysis = useMemo(() => {
        const highConfidence: Array<{ order: Order; suggestion: AddressSuggestion }> = [];
        const lowConfidence: Array<{ order: Order; validationResult: ValidationResult }> = [];

        problemOrders.forEach(({ order, validationResult }) => {
            const suggestions = validationResult.suggestedCorrections || [];
            const bestSuggestion = suggestions[0];

            if (bestSuggestion && validator.canAutoCorrect(bestSuggestion)) {
                highConfidence.push({ order, suggestion: bestSuggestion });
            } else {
                lowConfidence.push({ order, validationResult });
            }
        });

        return { highConfidence, lowConfidence };
    }, [problemOrders, validator]);

    const handleAutoCorrectAll = async () => {
        setProcessing(true);
        setProcessed(0);

        const corrections = new Map<string, AddressSuggestion>();

        // Симулируем обработку с прогрессом
        for (let i = 0; i < analysis.highConfidence.length; i++) {
            const { order, suggestion } = analysis.highConfidence[i];
            corrections.set(String(order.id || order.orderNumber), suggestion);
            setProcessed(i + 1);
            // Небольшая задержка для визуального эффекта
            await new Promise((resolve) => setTimeout(resolve, 100));
        }

        setProcessing(false);
        onAutoCorrectAll(corrections);
    };

    return (
        <div
            className={clsx(
                'rounded-2xl border-2 shadow-xl overflow-hidden',
                isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'
            )}
        >
            {/* Header */}
            <div
                className={clsx(
                    'p-6 border-b-2',
                    isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gradient-to-r from-orange-50 to-yellow-50 border-orange-200'
                )}
            >
                <div className="flex items-center gap-3">
                    <div className="p-3 rounded-2xl bg-orange-500/10">
                        <ExclamationTriangleIcon className="w-6 h-6 text-orange-500" />
                    </div>
                    <div className="flex-1">
                        <h3 className={clsx('text-xl font-bold', isDark ? 'text-white' : 'text-gray-900')}>
                            Обнаружены адреса вне зоны доставки
                        </h3>
                        <p className={clsx('text-sm', isDark ? 'text-gray-400' : 'text-gray-600')}>
                            Найдено {problemOrders.length} заказов с проблемными адресами
                        </p>
                    </div>
                </div>
            </div>

            {/* Stats */}
            <div className="p-6 grid grid-cols-2 gap-4">
                <div
                    className={clsx(
                        'p-4 rounded-xl border-2',
                        isDark ? 'bg-green-500/10 border-green-500/30' : 'bg-green-50 border-green-200'
                    )}
                >
                    <div className="flex items-center gap-2 mb-2">
                        <CheckCircleIcon className="w-5 h-5 text-green-500" />
                        <span className="text-sm font-bold text-green-600">Готовы к авто-коррекции</span>
                    </div>
                    <p className={clsx('text-3xl font-bold', isDark ? 'text-white' : 'text-gray-900')}>
                        {analysis.highConfidence.length}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Уверенность {'>'} 90%</p>
                </div>

                <div
                    className={clsx(
                        'p-4 rounded-xl border-2',
                        isDark ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-yellow-50 border-yellow-200'
                    )}
                >
                    <div className="flex items-center gap-2 mb-2">
                        <EyeIcon className="w-5 h-5 text-yellow-500" />
                        <span className="text-sm font-bold text-yellow-600">Требуют проверки</span>
                    </div>
                    <p className={clsx('text-3xl font-bold', isDark ? 'text-white' : 'text-gray-900')}>
                        {analysis.lowConfidence.length}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Ручная проверка</p>
                </div>
            </div>

            {/* Progress */}
            {processing && (
                <div className="px-6 pb-6">
                    <div className="relative">
                        <div
                            className={clsx(
                                'h-3 rounded-full overflow-hidden',
                                isDark ? 'bg-gray-800' : 'bg-gray-200'
                            )}
                        >
                            <div
                                className="h-full bg-gradient-to-r from-blue-600 to-purple-600 transition-all duration-300"
                                style={{ width: `${(processed / analysis.highConfidence.length) * 100}%` }}
                            />
                        </div>
                        <p className={clsx('text-xs text-center mt-2', isDark ? 'text-gray-400' : 'text-gray-600')}>
                            Обработано {processed} из {analysis.highConfidence.length}
                        </p>
                    </div>
                </div>
            )}

            {/* Actions */}
            <div
                className={clsx(
                    'p-6 border-t-2 flex flex-col gap-3',
                    isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'
                )}
            >
                {analysis.highConfidence.length > 0 && (
                    <button
                        onClick={handleAutoCorrectAll}
                        disabled={processing}
                        className={clsx(
                            'w-full px-6 py-4 rounded-xl font-bold transition-all shadow-lg flex items-center justify-between group',
                            processing
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white'
                        )}
                    >
                        <div className="flex items-center gap-3">
                            <SparklesIcon className="w-6 h-6" />
                            <div className="text-left">
                                <p className="text-sm">Автоматическая коррекция</p>
                                <p className="text-xs opacity-80">Применить {analysis.highConfidence.length} предложений</p>
                            </div>
                        </div>
                        <ChevronRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </button>
                )}

                {analysis.lowConfidence.length > 0 && (
                    <button
                        onClick={onReviewManually}
                        className={clsx(
                            'w-full px-6 py-4 rounded-xl font-bold transition-all flex items-center justify-between group border-2',
                            isDark
                                ? 'bg-gray-800 border-gray-700 text-white hover:bg-gray-700'
                                : 'bg-white border-gray-200 text-gray-900 hover:bg-gray-50 shadow-sm'
                        )}
                    >
                        <div className="flex items-center gap-3">
                            <EyeIcon className="w-6 h-6 text-yellow-500" />
                            <div className="text-left">
                                <p className="text-sm">Проверить вручную</p>
                                <p className={clsx('text-xs', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                    {analysis.lowConfidence.length} заказов требуют внимания
                                </p>
                            </div>
                        </div>
                        <ChevronRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </button>
                )}

                <button
                    onClick={onClose}
                    className={clsx(
                        'w-full px-6 py-3 rounded-xl font-medium transition-all',
                        isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    )}
                >
                    Закрыть
                </button>
            </div>

            {/* Preview List */}
            {analysis.highConfidence.length > 0 && (
                <div
                    className={clsx(
                        'max-h-64 overflow-y-auto border-t-2',
                        isDark ? 'bg-gray-800/30 border-gray-700' : 'bg-gray-50 border-gray-200'
                    )}
                >
                    <div className="p-4">
                        <p className={clsx('text-xs font-bold uppercase mb-3', isDark ? 'text-gray-400' : 'text-gray-500')}>
                            Предпросмотр коррекций
                        </p>
                        <div className="space-y-2">
                            {analysis.highConfidence.slice(0, 5).map(({ order, suggestion }, index) => (
                                <div
                                    key={index}
                                    className={clsx(
                                        'p-3 rounded-xl text-sm',
                                        isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
                                    )}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <p className={clsx('font-bold text-xs mb-1', isDark ? 'text-gray-400' : 'text-gray-500')}>
                                                Заказ #{order.orderNumber}
                                            </p>
                                            <p className={clsx('text-xs line-through mb-1', isDark ? 'text-gray-500' : 'text-gray-400')}>
                                                {order.address}
                                            </p>
                                            <p className={clsx('text-xs font-medium', isDark ? 'text-green-400' : 'text-green-600')}>
                                                → {suggestion.address}
                                            </p>
                                        </div>
                                        <span className="text-xs font-bold text-green-500">{suggestion.confidence}%</span>
                                    </div>
                                </div>
                            ))}
                            {analysis.highConfidence.length > 5 && (
                                <p className={clsx('text-xs text-center py-2', isDark ? 'text-gray-500' : 'text-gray-400')}>
                                    ... и ещё {analysis.highConfidence.length - 5}
                                </p>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
