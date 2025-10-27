import { useState, useEffect } from 'react'

interface ApiKeyState {
  apiKey: string | null
  isValid: boolean
  isLoading: boolean
  error: string | null
}

export const useApiKey = () => {
  const [state, setState] = useState<ApiKeyState>({
    apiKey: null,
    isValid: false,
    isLoading: true,
    error: null
  })

  useEffect(() => {
    // Загружаем API ключ из localStorage
    const savedApiKey = localStorage.getItem('google_maps_api_key')
    
    if (savedApiKey) {
      // Простая валидация ключа (должен начинаться с AIza)
      const isValid = savedApiKey.startsWith('AIza') && savedApiKey.length > 20
      
      setState({
        apiKey: savedApiKey,
        isValid,
        isLoading: false,
        error: isValid ? null : 'Неверный формат API ключа'
      })
    } else {
      setState({
        apiKey: null,
        isValid: false,
        isLoading: false,
        error: 'API ключ не найден'
      })
    }
  }, [])

  const setApiKey = (apiKey: string) => {
    const isValid = apiKey.startsWith('AIza') && apiKey.length > 20
    
    if (isValid) {
      localStorage.setItem('google_maps_api_key', apiKey)
      setState({
        apiKey,
        isValid: true,
        isLoading: false,
        error: null
      })
    } else {
      setState(prev => ({
        ...prev,
        error: 'Неверный формат API ключа'
      }))
    }
  }

  const clearApiKey = () => {
    localStorage.removeItem('google_maps_api_key')
    setState({
      apiKey: null,
      isValid: false,
      isLoading: false,
      error: 'API ключ удален'
    })
  }

  return {
    ...state,
    hasApiKey: !!state.apiKey,
    setApiKey,
    clearApiKey
  }
}
