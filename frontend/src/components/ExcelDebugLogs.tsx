import React, { useState, useEffect } from 'react';
import { 
  ClockIcon, 
  InformationCircleIcon, 
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XMarkIcon,
  ArrowPathIcon 
} from '@heroicons/react/24/outline';

interface DebugLog {
  timestamp: string;
  message: string;
  data?: string | null;
}

interface ExcelDebugLogsProps {
  logs: DebugLog[];
  isVisible: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

export const ExcelDebugLogs: React.FC<ExcelDebugLogsProps> = ({ 
  logs, 
  isVisible, 
  onClose, 
  onRefresh 
}) => {
  const [expandedLogs, setExpandedLogs] = useState<Set<number>>(new Set());
  const [autoScroll, setAutoScroll] = useState(true);

  useEffect(() => {
    if (autoScroll && isVisible) {
      const logContainer = document.getElementById('debug-logs-container');
      if (logContainer) {
        logContainer.scrollTop = logContainer.scrollHeight;
      }
    }
  }, [logs, autoScroll, isVisible]);

  const toggleLogExpansion = (index: number) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedLogs(newExpanded);
  };

  const getLogIcon = (message: string) => {
    if (message.includes('Ошибка') || message.includes('ERROR')) {
      return <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />;
    }
    if (message.includes('Найден') || message.includes('Создан') || message.includes('завершен')) {
      return <CheckCircleIcon className="h-4 w-4 text-green-500" />;
    }
    return <InformationCircleIcon className="h-4 w-4 text-blue-500" />;
  };

  const formatTimestamp = (timestamp: string) => {
    try {
      return new Date(timestamp).toLocaleTimeString('uk-UA');
    } catch {
      return timestamp;
    }
  };

  const formatData = (data: string | null) => {
    if (!data) return null;
    try {
      const parsed = JSON.parse(data);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return data;
    }
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center space-x-2">
            <ClockIcon className="h-5 w-5 text-gray-600" />
            <h3 className="text-lg font-semibold text-gray-900">
              Логи обработки Excel ({logs.length})
            </h3>
          </div>
          <div className="flex items-center space-x-2">
            <label className="flex items-center text-sm text-gray-600">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="mr-1"
              />
              Автопрокрутка
            </label>
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
                title="Обновить логи"
              >
                <ArrowPathIcon className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Logs Container */}
        <div 
          id="debug-logs-container"
          className="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50"
        >
          {logs.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              <InformationCircleIcon className="h-8 w-8 mx-auto mb-2 text-gray-400" />
              <p>Логи отсутствуют</p>
            </div>
          ) : (
            logs.map((log, index) => (
              <div 
                key={index} 
                className="bg-white rounded-md border border-gray-200 shadow-sm"
              >
                <div 
                  className="p-3 cursor-pointer hover:bg-gray-50"
                  onClick={() => toggleLogExpansion(index)}
                >
                  <div className="flex items-start space-x-3">
                    {getLogIcon(log.message)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {log.message}
                        </p>
                        <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                          {formatTimestamp(log.timestamp)}
                        </span>
                      </div>
                      {log.data && expandedLogs.has(index) && (
                        <div className="mt-2">
                          <pre className="text-xs bg-gray-100 p-2 rounded border overflow-x-auto">
                            {formatData(log.data)}
                          </pre>
                        </div>
                      )}
                    </div>
                    {log.data && (
                      <div className="flex-shrink-0">
                        <span className="text-xs text-blue-500">
                          {expandedLogs.has(index) ? '▼' : '▶'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Всего записей: {logs.length}</span>
            <span>
              Последнее обновление: {logs.length > 0 ? formatTimestamp(logs[logs.length - 1].timestamp) : '-'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};



