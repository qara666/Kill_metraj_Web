import React from 'react'
import { ExclamationTriangleIcon, CheckCircleIcon } from '@heroicons/react/24/outline'
import { useApiKey } from '../../hooks/useApiKey'
import { Link } from 'react-router-dom'

interface ApiKeyStatusProps {
  showLink?: boolean
  className?: string
}

export const ApiKeyStatus: React.FC<ApiKeyStatusProps> = ({ 
  showLink = true, 
  className = '' 
}) => {
  const { hasApiKey } = useApiKey()

  if (!hasApiKey) {
    return (
      <div className={`flex items-center space-x-2 text-orange-600 ${className}`}>
        <ExclamationTriangleIcon className="h-4 w-4" />
        <span className="text-sm">API key not configured</span>
        {showLink && (
          <Link 
            to="/settings" 
            className="text-sm underline hover:text-orange-700"
          >
            Configure
          </Link>
        )}
      </div>
    )
  }

  return (
    <div className={`flex items-center space-x-2 text-green-600 ${className}`}>
      <CheckCircleIcon className="h-4 w-4" />
      <span className="text-sm">API key configured</span>
    </div>
  )
}

export default ApiKeyStatus



























