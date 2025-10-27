import React from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'

interface ExcelDebugLogsProps {
  logs: any[]
  isVisible: boolean
  onClose: () => void
}

export const ExcelDebugLogs: React.FC<ExcelDebugLogsProps> = ({
  logs,
  isVisible,
  onClose
}) => {
  if (!isVisible) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-4xl max-h-[80vh] overflow-hidden">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Логи обработки Excel
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>
        
        <div className="overflow-y-auto max-h-[60vh]">
          {logs.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400">Логи отсутствуют</p>
          ) : (
            <div className="space-y-2">
              {logs.map((log, index) => (
                <div
                  key={index}
                  className={`p-3 rounded border-l-4 ${
                    log.type === 'error'
                      ? 'bg-red-50 border-red-400 text-red-800 dark:bg-red-900/20 dark:text-red-300'
                      : log.type === 'warning'
                      ? 'bg-yellow-50 border-yellow-400 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-300'
                      : 'bg-blue-50 border-blue-400 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300'
                  }`}
                >
                  <div className="font-medium">{log.message}</div>
                  {log.details && (
                    <div className="text-sm mt-1 opacity-75">
                      {typeof log.details === 'string' 
                        ? log.details 
                        : JSON.stringify(log.details, null, 2)
                      }
                    </div>
                  )}
                  <div className="text-xs mt-1 opacity-60">
                    {new Date(log.timestamp).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
