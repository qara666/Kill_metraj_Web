import React from 'react'

interface ExcelDebugLogsProps {
  logs: any[]
  isVisible: boolean
  onClose: () => void
}

export const ExcelDebugLogs: React.FC<ExcelDebugLogsProps> = ({ logs, isVisible, onClose }) => {
  if (!isVisible) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl max-h-96 overflow-auto">
        <h2 className="text-xl font-bold mb-4">Debug Logs</h2>
        <div className="space-y-2">
          {logs.map((log, index) => (
            <div key={index} className="text-sm">
              {JSON.stringify(log, null, 2)}
            </div>
          ))}
        </div>
        <button onClick={onClose} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded">
          Close
        </button>
      </div>
    </div>
  )
}


