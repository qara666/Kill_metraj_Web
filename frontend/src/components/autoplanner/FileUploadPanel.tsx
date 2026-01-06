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
            'rounded-xl p-4 border-2 transition-all hover:shadow-lg',
            isDark
                ? 'border-blue-700/50 bg-gradient-to-br from-gray-800/50 to-gray-900/50 hover:border-blue-600'
                : 'border-blue-200 bg-gradient-to-br from-blue-50/50 to-indigo-50/50 hover:border-blue-300'
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
                    'block w-full cursor-pointer border-2 border-dashed rounded-xl p-4 transition-all text-center',
                    isDark
                        ? 'border-gray-700 bg-gray-800/50 hover:border-blue-500/50 hover:bg-gray-800'
                        : 'border-gray-200 bg-gray-50/50 hover:border-blue-400 hover:bg-gray-100'
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

                {/* Swagger Import Button removed - moved to Control Panel */}

                <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                    <div className="text-xs font-medium mb-2 opacity-70">Или загрузите по ссылке HTML</div>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={htmlUrl}
                            onChange={(e) => setHtmlUrl(e.target.value)}
                            placeholder="https://..."
                            className={clsx(
                                'flex-1 px-3 py-2 text-xs rounded-lg border focus:ring-2 outline-none transition-all',
                                isDark ? 'bg-gray-800 border-gray-700 focus:ring-blue-500/30' : 'bg-white border-gray-300 focus:ring-blue-500/20'
                            )}
                        />
                        <button
                            onClick={onHtmlLoad}
                            disabled={isProcessingHtml || !htmlUrl}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                        >
                            {isProcessingHtml ? '...' : 'Загрузить'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
});
