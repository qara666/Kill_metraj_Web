export interface ApiKeyValidationResult {
  isValid: boolean
  error?: string
  keyType?: 'maps' | 'places' | 'geocoding' | 'unknown'
}

export const apiKeyValidator = {
  /**
   * Валидирует Google Maps API ключ
   */
  validateApiKey: (apiKey: string): ApiKeyValidationResult => {
    if (!apiKey || typeof apiKey !== 'string') {
      return {
        isValid: false,
        error: 'API ключ не предоставлен'
      }
    }

    // Проверяем базовый формат Google API ключа
    if (!apiKey.startsWith('AIza')) {
      return {
        isValid: false,
        error: 'Неверный формат API ключа. Должен начинаться с "AIza"'
      }
    }

    // Проверяем длину ключа
    if (apiKey.length < 30) {
      return {
        isValid: false,
        error: 'API ключ слишком короткий'
      }
    }

    if (apiKey.length > 50) {
      return {
        isValid: false,
        error: 'API ключ слишком длинный'
      }
    }

    // Проверяем на наличие недопустимых символов
    const invalidChars = /[^A-Za-z0-9_-]/
    if (invalidChars.test(apiKey)) {
      return {
        isValid: false,
        error: 'API ключ содержит недопустимые символы'
      }
    }

    return {
      isValid: true,
      keyType: 'maps'
    }
  },

  /**
   * Проверяет, является ли ключ валидным для конкретного сервиса
   */
  validateForService: (apiKey: string, service: 'maps' | 'places' | 'geocoding'): ApiKeyValidationResult => {
    const baseValidation = apiKeyValidator.validateApiKey(apiKey)
    
    if (!baseValidation.isValid) {
      return baseValidation
    }

    // Дополнительные проверки для конкретных сервисов
    switch (service) {
      case 'maps':
        return {
          isValid: true,
          keyType: 'maps'
        }
      
      case 'places':
        return {
          isValid: true,
          keyType: 'places'
        }
      
      case 'geocoding':
        return {
          isValid: true,
          keyType: 'geocoding'
        }
      
      default:
        return {
          isValid: true,
          keyType: 'unknown'
        }
    }
  },

  /**
   * Валидирует Google Maps API ключ (алиас для validateApiKey)
   */
  validateGoogleMapsApiKey: (apiKey: string): ApiKeyValidationResult => {
    return apiKeyValidator.validateApiKey(apiKey)
  },

  /**
   * Проверяет API ключ асинхронно через тестовый запрос
   */
  validateApiKeyAsync: async (apiKey: string): Promise<ApiKeyValidationResult> => {
    const baseValidation = apiKeyValidator.validateApiKey(apiKey)
    
    if (!baseValidation.isValid) {
      return baseValidation
    }

    try {
      // Тестовый запрос к Google Maps API
      const testUrl = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`
      
      await fetch(testUrl, {
        method: 'HEAD',
        mode: 'no-cors'
      })

      return {
        isValid: true,
        keyType: 'maps'
      }
    } catch (error) {
      return {
        isValid: false,
        error: 'Ошибка проверки API ключа'
      }
    }
  },

  /**
   * Маскирует API ключ для безопасного отображения
   */
  maskApiKey: (apiKey: string): string => {
    if (!apiKey || apiKey.length < 8) {
      return '***'
    }
    
    const start = apiKey.substring(0, 4)
    const end = apiKey.substring(apiKey.length - 4)
    const middle = '*'.repeat(Math.max(0, apiKey.length - 8))
    
    return `${start}${middle}${end}`
  }
}
