import React from 'react'

interface ExcelDataPreviewProps {
  data: any
  isVisible: boolean
  onClose: () => void
  onConfirm: () => void
}

export const ExcelDataPreview: React.FC<ExcelDataPreviewProps> = ({ data, isVisible, onClose, onConfirm }) => {
  if (!isVisible) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-4xl max-h-96 overflow-auto">
        <h2 className="text-xl font-bold mb-4">Excel Data Preview</h2>
        <pre className="text-sm">{JSON.stringify(data, null, 2)}</pre>
        <div className="mt-4 flex space-x-2">
          <button onClick={onConfirm} className="px-4 py-2 bg-blue-500 text-white rounded">
            Confirm
          </button>
          <button onClick={onClose} className="px-4 py-2 bg-gray-500 text-white rounded">
            Close
          </button>
        </div>
      </div>
    </div>
  )
}


