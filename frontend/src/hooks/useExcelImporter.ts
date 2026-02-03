import { useCallback, useState } from 'react';
import { parseCourierScheduleFromExcel } from '../utils/routes/courierSchedule';
import { processExcelFile } from '../utils/data/excelProcessor';
import { logger } from '../utils/ui/logger';
import { ProcessedExcelData } from '../types';

export const useExcelImporter = (
    setExcelData: (data: ProcessedExcelData | null) => void,
    setCourierSchedules: (schedules: any[]) => void
) => {
    const [isImporting, setIsImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);

    const handleExcelUpload = useCallback(async (file: File) => {
        console.log(' [useExcelImporter] handleExcelUpload started with file:', file.name, 'size:', file.size);
        setIsImporting(true);
        setImportError(null);
        try {
            console.log(' [useExcelImporter] Calling processExcelFile...');
            const data = await processExcelFile(file);
            console.log(' [useExcelImporter] processExcelFile returned:', {
                orders: data.orders.length,
                couriers: data.couriers.length,
                paymentMethods: data.paymentMethods.length,
                errors: data.errors.length
            });
            console.log(' [useExcelImporter] Full data:', data);

            setExcelData(data);
            logger.info(` Успешно загружено ${data.orders.length} заказов из ${file.name}`);

            // Также пытаемся найти графики курьеров в том же файле
            try {
                const arrayBuffer = await file.arrayBuffer();
                const XLSX = await import('xlsx');
                const workbook = XLSX.read(arrayBuffer, { type: 'array' });

                let totalSchedules = 0;
                for (const sheetName of workbook.SheetNames) {
                    const worksheet = workbook.Sheets[sheetName];
                    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
                    const parsedSchedules = parseCourierScheduleFromExcel(jsonData);

                    if (parsedSchedules.length > 0) {
                        setCourierSchedules(parsedSchedules);
                        totalSchedules = parsedSchedules.length;
                        break; // Берем первые найденные графики
                    }
                }

                if (totalSchedules > 0) {
                    logger.info(` Автоматически загружено ${totalSchedules} графиков курьеров`);
                }
            } catch (err) {
                console.warn('Silent skip: courier schedule not found in same file or parse error', err);
            }
        } catch (error: any) {
            console.error(' [useExcelImporter] Error in handleExcelUpload:', error);
            const msg = error.message || 'Ошибка при разборе Excel файла';
            setImportError(msg);
            logger.error('Excel Import Error:', error);
        } finally {
            setIsImporting(false);
            console.log(' [useExcelImporter] handleExcelUpload finished');
        }
    }, [setExcelData, setCourierSchedules]);

    const handleScheduleOnlyUpload = useCallback(async (file: File) => {
        setIsImporting(true);
        setImportError(null);
        try {
            const arrayBuffer = await file.arrayBuffer();
            const XLSX = await import('xlsx');
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });

            let found = false;
            for (const sheetName of workbook.SheetNames) {
                const worksheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
                const parsedSchedules = parseCourierScheduleFromExcel(jsonData);

                if (parsedSchedules.length > 0) {
                    setCourierSchedules(parsedSchedules);
                    logger.info(` Загружено ${parsedSchedules.length} графиков из листа "${sheetName}"`);
                    found = true;
                    break;
                }
            }

            if (!found) {
                setImportError('Графики курьеров не найдены в файле');
            }
        } catch (error: any) {
            setImportError(error.message || 'Ошибка загрузки графика');
            logger.error('Schedule Upload Error:', error);
        } finally {
            setIsImporting(false);
        }
    }, [setCourierSchedules]);

    return {
        isImporting,
        importError,
        handleExcelUpload,
        handleScheduleOnlyUpload
    };
};
