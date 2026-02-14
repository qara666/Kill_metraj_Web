/**
 * Интеграция умной коррекции адресов в RouteManagement
 * Этот файл содержит логику для автоматической проверки и исправления адресов вне зон доставки
 */

import { useCallback, useEffect } from 'react';
import { getAddressZoneValidator, type AddressSuggestion, type ValidationResult } from '../services/addressZoneValidator';
import toast from 'react-hot-toast';

interface Order {
    id: string;
    orderNumber: string;
    address: string;
    coords?: { lat: number; lng: number };
    [key: string]: any;
}

interface UseSmartAddressCorrectionProps {
    updateExcelData: (updater: (prevData: any) => any) => void;
    onCorrectionComplete?: () => void;
}

export function useSmartAddressCorrection({ updateExcelData, onCorrectionComplete }: UseSmartAddressCorrectionProps) {
    const validator = getAddressZoneValidator();

    /**
     * Проверяет заказы на наличие адресов вне зон доставки
     */
    const validateOrders = useCallback(async (orders: Order[]) => {
        const problems: Array<{ order: Order; validationResult: ValidationResult }> = [];

        for (const order of orders) {
            if (order.coords) {
                const result = await validator.validateAddress(
                    order.address,
                    order.coords,
                    order
                );

                if (!result.isValid) {
                    problems.push({ order, validationResult: result });
                }
            }
        }

        return problems;
    }, [validator]);

    /**
     * Применяет коррекцию к одному заказу
     */
    const applyCorrection = useCallback((order: Order, suggestion: AddressSuggestion) => {
        updateExcelData((prevData: any) => {
            if (!prevData) return prevData;

            const updatedOrders = (prevData.orders || []).map((o: Order) => {
                if (String(o.id) === String(order.id) || String(o.orderNumber) === String(order.orderNumber)) {
                    return {
                        ...o,
                        address: suggestion.address,
                        coords: suggestion.coords,
                        correctedBy: 'smart_system',
                        correctionConfidence: suggestion.confidence,
                    };
                }
                return o;
            });

            return { ...prevData, orders: updatedOrders };
        });

        toast.success(`✅ Адрес исправлен: ${suggestion.address}`);
        onCorrectionComplete?.();
    }, [updateExcelData, onCorrectionComplete]);

    /**
     * Применяет batch коррекцию к нескольким заказам
     */
    const applyBatchCorrections = useCallback((corrections: Map<string, AddressSuggestion>) => {
        updateExcelData((prevData: any) => {
            if (!prevData) return prevData;

            const updatedOrders = (prevData.orders || []).map((o: Order) => {
                const orderId = String(o.id || o.orderNumber);
                const correction = corrections.get(orderId);

                if (correction) {
                    return {
                        ...o,
                        address: correction.address,
                        coords: correction.coords,
                        correctedBy: 'smart_system_batch',
                        correctionConfidence: correction.confidence,
                    };
                }
                return o;
            });

            return { ...prevData, orders: updatedOrders };
        });

        toast.success(`✅ Автоматически исправлено ${corrections.size} адресов`);
        onCorrectionComplete?.();
    }, [updateExcelData, onCorrectionComplete]);

    /**
     * Применяет ручную коррекцию
     */
    const applyManualEdit = useCallback((order: Order, newAddress: string) => {
        updateExcelData((prevData: any) => {
            if (!prevData) return prevData;

            const updatedOrders = (prevData.orders || []).map((o: Order) => {
                if (String(o.id) === String(order.id) || String(o.orderNumber) === String(order.orderNumber)) {
                    return {
                        ...o,
                        address: newAddress,
                        correctedBy: 'manual',
                    };
                }
                return o;
            });

            return { ...prevData, orders: updatedOrders };
        });

        toast.success('✏️ Адрес обновлен вручную');
        onCorrectionComplete?.();
    }, [updateExcelData, onCorrectionComplete]);

    return {
        validateOrders,
        applyCorrection,
        applyBatchCorrections,
        applyManualEdit,
        validator,
    };
}

/**
 * Показывает умную систему коррекции для проблемных заказов
 */
export function showSmartCorrection(
    problems: Array<{ order: Order; validationResult: ValidationResult }>,
    onApplyCorrection: (order: Order, suggestion: AddressSuggestion) => void,
    onApplyBatch: (corrections: Map<string, AddressSuggestion>) => void,
    onManualEdit: (order: Order, newAddress: string) => void
) {
    // Эта функция будет вызываться из RouteManagement для показа модалок
    // Пока просто возвращаем данные для отображения
    return {
        problems,
        onApplyCorrection,
        onApplyBatch,
        onManualEdit,
    };
}
