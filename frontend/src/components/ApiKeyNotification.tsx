import React, { useState } from 'react'
import { XMarkIcon, KeyIcon } from '@heroicons/react/24/outline'
import { useApiKey } from '../hooks/useApiKey'
import { Link } from 'react-router-dom'

export const ApiKeyNotification: React.FC = () => {
  const { hasApiKey } = useApiKey()
  const [isDismissed, setIsDismissed] = useState(false)

  // Don't show if API key is configured or notification is dismissed
  if (hasApiKey() || isDismissed) {
    return null
  }

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-6">
      <div className="flex items-start">
        <KeyIcon className="h-5 w-5 text-orange-600 mt-0.5 mr-3 flex-shrink-0" />
        <div className="flex-1">
          <h3 className="text-sm font-medium text-orange-800">
            Google Maps API Key Required
          </h3>
          <p className="mt-1 text-sm text-orange-700">
            To use geocoding and route optimization features, please configure your Google Maps API key.
          </p>
          <div className="mt-3 flex space-x-3">
            <Link
              to="/settings"
              className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md text-orange-700 bg-orange-100 hover:bg-orange-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
            >
              Configure API Key
            </Link>
            <button
              onClick={() => setIsDismissed(true)}
              className="inline-flex items-center px-3 py-2 border border-orange-300 text-sm leading-4 font-medium rounded-md text-orange-700 bg-white hover:bg-orange-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
            >
              Dismiss
            </button>
          </div>
        </div>
        <button
          onClick={() => setIsDismissed(true)}
          className="ml-4 flex-shrink-0"
        >
          <XMarkIcon className="h-5 w-5 text-orange-400" />
        </button>
      </div>
    </div>
  )
}

export default ApiKeyNotification
