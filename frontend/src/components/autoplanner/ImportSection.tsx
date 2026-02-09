import React, { useCallback, useState } from 'react';
import { clsx } from 'clsx';
import { FileUploadPanel } from './FileUploadPanel';
import { processHtmlUrl, isValidUrl } from '../../utils/data/htmlProcessor';
import { logger } from '../../utils/ui/logger';
import { useError } from '../../contexts/ErrorContext';
import { ProcessedExcelData } from '../../types';
import { useExcelImporter } from '../../hooks/useExcelImporter';
import { useTheme } from '../../contexts/ThemeContext';

interface ImportSectionProps {
    isDark: boolean;
    excelData: ProcessedExcelData | null;
    setExcelData: (data: ProcessedExcelData | null) => void;
    setCourierSchedules: (schedules: any[]) => void;
    ordersCount: number;
}

export const ImportSection: React.FC<ImportSectionProps> = React.memo(({
    isDark,
    setExcelData,
    setCourierSchedules,
    ordersCount
}) => {
    const { isDark: themeDark } = useTheme();
    const actualIsDark = isDark !== undefined ? isDark : themeDark;
    const [fileName, setFileName] = useState('');
    const [htmlUrl, setHtmlUrl] = useState('');
    const [isProcessingHtml, setIsProcessingHtml] = useState(false);
    const { addError } = useError();

    const { handleExcelUpload, isImporting: isProcessingExcel } = useExcelImporter(setExcelData, setCourierSchedules);

    const handleFile = useCallback(async (file: File) => {
        setFileName(file.name);
        await handleExcelUpload(file);
    }, [handleExcelUpload, setFileName]);

    const handleHtmlUrlLoad = useCallback(async () => {
        if (!htmlUrl.trim()) { alert('Введите URL HTML страницы'); return; }
        if (!isValidUrl(htmlUrl.trim())) { alert('Неверный формат URL. URL должен начинаться с http://, https:// или file://'); return; }

        setIsProcessingHtml(true);
        try {
            const data = await processHtmlUrl(htmlUrl.trim());
            setExcelData(data);
            setFileName('HTML данные');
            setHtmlUrl('');
        } catch (error: any) {
            logger.error('Ошибка загрузки HTML:', error);
            addError(`Ошибка загрузки HTML: ${error.message || 'Неизвестная ошибка'}`);
        } finally {
            setIsProcessingHtml(false);
        }
    }, [htmlUrl, addError, setIsProcessingHtml, setHtmlUrl, setExcelData, setFileName]);

    const onFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) await handleFile(file);
    }, [handleFile]);

    // Dashboard API Import moved to AutoPlanner.tsx -> ExtraSettingsPanel

    const [isImportExpanded, setIsImportExpanded] = useState(true);

    return (
        <div className={clsx(
            'card overflow-hidden transition-all duration-300 transform-gpu',
            actualIsDark ? 'bg-[#151B2C]/50' : 'bg-white'
        )}>
            <button
                onClick={() => setIsImportExpanded(!isImportExpanded)}
                className={clsx(
                    'w-full px-5 py-3.5 flex items-center justify-between transition-colors',
                    actualIsDark ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50'
                )}
            >
                <div className={clsx('text-sm font-medium flex items-center gap-2', actualIsDark ? 'text-gray-300' : 'text-gray-700')}>
                    <span>{isImportExpanded ? '▼' : '▶'}</span>
                    <span> Загрузка данных</span>
                </div>
            </button>

            {isImportExpanded && (
                <div className="p-4 pt-0">
                    <FileUploadPanel
                        onFileChange={onFileChange}
                        isProcessing={isProcessingExcel}
                        fileName={fileName}
                        ordersCount={ordersCount}
                        htmlUrl={htmlUrl}
                        setHtmlUrl={setHtmlUrl}
                        onHtmlLoad={handleHtmlUrlLoad}
                        isProcessingHtml={isProcessingHtml}
                        isDark={actualIsDark}
                    />
                </div>
            )}
        </div>
    );
});
