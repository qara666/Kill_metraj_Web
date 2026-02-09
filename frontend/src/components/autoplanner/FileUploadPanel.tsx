import React from 'react';
import { clsx } from 'clsx';
import { DocumentArrowUpIcon } from '@heroicons/react/24/outline';

interface FileUploadPanelProps {
    onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    isProcessing: boolean;
    fileName: string | null;
    ordersCount: number;
    htmlUrl: string;
    setHtmlUrl: (val: string) => void;
    onHtmlLoad: () => void;
    isProcessingHtml: boolean;
    isDark: boolean;
}

export const FileUploadPanel: React.FC<FileUploadPanelProps> = React.memo(({
    onFileChange,
    isProcessing,
    fileName,
    ordersCount,
    htmlUrl,
    setHtmlUrl,
    onHtmlLoad,
    isProcessingHtml,
    isDark
}) => {
    return (
        <div className={clsx(
            'rounded-2xl p-5 border shadow-sm transition-all duration-200 transform-gpu hover:shadow-md hover:-translate-y-0.5',
            isDark
                ? 'border-gray-800 bg-[#1A2133] hover:border-blue-900/50'
                : 'border-blue-100 bg-blue-50/30 hover:border-blue-200'
        )}>
            <div className="flex items-center gap-2 mb-3">
                <div className={clsx(
                    'p-1.5 rounded-lg',
                    isDark ? 'bg-blue-600/20' : 'bg-blue-100'
                )}>
                    <DocumentArrowUpIcon className={clsx('w-5 h-5', isDark ? 'text-blue-400' : 'text-blue-600')} />
                </div>
                <div className={clsx('text-sm font-semibold', isDark ? 'text-white' : 'text-gray-900')}>
                    Загрузка данных
                </div>
            </div>

            <div className="space-y-4">
                <label className={clsx(
                    'block w-full cursor-pointer border-2 border-dashed rounded-2xl p-6 transition-all text-center group transform-gpu',
                    isDark
                        ? 'border-gray-800 bg-gray-900/50 hover:border-blue-600/50 hover:bg-gray-900'
                        : 'border-blue-100 bg-white/50 hover:border-blue-300 hover:bg-white'
                )}>
                    <input
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={onFileChange}
                        disabled={isProcessing}
                        className="hidden"
                    />
                    <DocumentArrowUpIcon className={clsx('w-10 h-10 mx-auto mb-2 opacity-50')} />
                    <div className="text-sm font-medium">
                        {isProcessing ? 'Обработка файла...' : (fileName || 'Выберите Excel файл')}
                    </div>
                    {fileName && ordersCount > 0 && (
                        <div className="text-xs opacity-60 mt-1">
                            Загружено {ordersCount} заказов
                        </div>
                    )}
                </label>

                {/* Dashboard API Import Button removed - moved to Control Panel */}

                <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                    <div className="text-xs font-medium mb-2 opacity-70">Или загрузите по ссылке HTML</div>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={htmlUrl}
                            onChange={(e) => setHtmlUrl(e.target.value)}
                            placeholder="https://..."
                            className={clsx(
                                'flex-1 px-4 py-2.5 text-sm rounded-xl border outline-none transition-all',
                                isDark ? 'bg-gray-900 border-gray-800 focus:border-blue-600/50' : 'bg-white border-blue-100 focus:border-blue-400'
                            )}
                        />
                        <button
                            onClick={onHtmlLoad}
                            disabled={isProcessingHtml || !htmlUrl}
                            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-all transform-gpu active:scale-95 disabled:opacity-50 shadow-md shadow-blue-600/20"
                        >
                            {isProcessingHtml ? '...' : 'Загрузить'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
});
