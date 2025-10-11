// Утилита для проверки валидности Google Maps API ключа

export interface ApiKeyValidationResult {
  isValid: boolean
  error?: string
  details?: {
    status: string
    errorMessage?: string
  }
}

/**
 * Проверяет валидность Google Maps API ключа через реальный запрос
 * @param apiKey - API ключ для проверки
 * @returns Promise с результатом проверки
 */
export async function validateGoogleMapsApiKey(apiKey: string): Promise<ApiKeyValidationResult> {
  if (!apiKey || !apiKey.trim()) {
    return {
      isValid: false,
      error: 'API ключ не предоставлен'
    }
  }

  try {
    // Используем Geocoding API для проверки ключа
    // Это один из самых простых и быстрых способов проверить валидность ключа
    const testAddress = 'New York, NY' // Простой адрес для тестирования
    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(testAddress)}&key=${apiKey.trim()}`

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      }
    })

    if (!response.ok) {
      return {
        isValid: false,
        error: `HTTP ошибка: ${response.status} ${response.statusText}`,
        details: {
          status: 'HTTP_ERROR',
          errorMessage: response.statusText
        }
      }
    }

    const data = await response.json()

    // Проверяем статус ответа от Google Maps API
    switch (data.status) {
      case 'OK':
        return {
          isValid: true,
          details: {
            status: 'OK'
          }
        }

      case 'REQUEST_DENIED':
        return {
          isValid: false,
          error: 'API ключ отклонен. Проверьте правильность ключа и настройки ограничений.',
          details: {
            status: 'REQUEST_DENIED',
            errorMessage: data.error_message || 'Ключ отклонен'
          }
        }

      case 'INVALID_REQUEST':
        return {
          isValid: false,
          error: 'Неверный запрос. Проверьте формат API ключа.',
          details: {
            status: 'INVALID_REQUEST',
            errorMessage: data.error_message || 'Неверный запрос'
          }
        }

      case 'OVER_QUERY_LIMIT':
        return {
          isValid: false,
          error: 'Превышен лимит запросов. Проверьте квоты API ключа.',
          details: {
            status: 'OVER_QUERY_LIMIT',
            errorMessage: data.error_message || 'Превышен лимит'
          }
        }

      case 'ZERO_RESULTS':
        // Это нормально для тестового адреса, ключ валиден
        return {
          isValid: true,
          details: {
            status: 'ZERO_RESULTS'
          }
        }

      default:
        return {
          isValid: false,
          error: `Неизвестный статус ответа: ${data.status}`,
          details: {
            status: data.status,
            errorMessage: data.error_message
          }
        }
    }

  } catch (error) {
    console.error('Ошибка проверки API ключа:', error)
    
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return {
        isValid: false,
        error: 'Ошибка сети. Проверьте подключение к интернету.',
        details: {
          status: 'NETWORK_ERROR',
          errorMessage: error.message
        }
      }
    }

    return {
      isValid: false,
      error: `Ошибка проверки: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`,
      details: {
        status: 'UNKNOWN_ERROR',
        errorMessage: error instanceof Error ? error.message : 'Неизвестная ошибка'
      }
    }
  }
}

/**
 * Проверяет, включены ли необходимые API для работы приложения
 * @param apiKey - API ключ для проверки
 * @returns Promise с результатом проверки API
 */
export async function validateRequiredApis(apiKey: string): Promise<{
  isValid: boolean
  enabledApis: string[]
  missingApis: string[]
  error?: string
}> {
  const requiredApis = [
    'Maps JavaScript API',
    'Geocoding API', 
    'Directions API'
  ]

  try {
    // Проверяем каждый API через соответствующие запросы
    const checks = await Promise.allSettled([
      // Проверка Geocoding API
      fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=test&key=${apiKey}`),
      // Проверка Directions API  
      fetch(`https://maps.googleapis.com/maps/api/directions/json?origin=New+York&destination=Los+Angeles&key=${apiKey}`)
    ])

    const enabledApis: string[] = []
    const missingApis: string[] = []

    // Анализируем результаты
    checks.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const response = result.value
        if (response.ok) {
          enabledApis.push(requiredApis[index])
        } else {
          missingApis.push(requiredApis[index])
        }
      } else {
        missingApis.push(requiredApis[index])
      }
    })

    // Maps JavaScript API всегда считается включенным, если ключ валиден
    if (enabledApis.length > 0) {
      enabledApis.push('Maps JavaScript API')
    }

    return {
      isValid: enabledApis.length >= 2, // Минимум 2 API должны работать
      enabledApis,
      missingApis
    }

  } catch (error) {
    return {
      isValid: false,
      enabledApis: [],
      missingApis: requiredApis,
      error: `Ошибка проверки API: ${error instanceof Error ? error.message : 'Неизвестная ошибка'}`
    }
  }
}

export default {
  validateGoogleMapsApiKey,
  validateRequiredApis
}
