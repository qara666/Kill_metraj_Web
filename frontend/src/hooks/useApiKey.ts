import { useState, useEffect } from 'react'
import { localStorageUtils } from '../utils/localStorage'

export const useApiKey = () => {
  const [apiKey, setApiKey] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Load API key from localStorage
    const savedApiKey = localStorageUtils.getApiKey()
    setApiKey(savedApiKey)
    setIsLoading(false)
  }, [])

  const updateApiKey = (newApiKey: string) => {
    localStorageUtils.setApiKey(newApiKey)
    setApiKey(newApiKey)
  }

  const hasApiKey = () => {
    return localStorageUtils.hasApiKey()
  }

  return {
    apiKey,
    updateApiKey,
    hasApiKey,
    isLoading
  }
}

export default useApiKey




