import { useState, useEffect } from 'react'

export const useApiKey = () => {
  const [hasApiKey, setHasApiKey] = useState(false)

  useEffect(() => {
    const checkApiKey = () => {
      const apiKey = localStorage.getItem('google_maps_api_key')
      setHasApiKey(!!apiKey)
    }

    checkApiKey()
    const interval = setInterval(checkApiKey, 1000)
    
    return () => clearInterval(interval)
  }, [])

  return { hasApiKey }
}

