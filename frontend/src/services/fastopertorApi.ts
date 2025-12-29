const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001'

export interface FastopertorConfig {
  apiUrl: string
  apiKey: string
  endpoint?: string
}

export interface FastopertorData {
  orders: any[]
  couriers: any[]
  paymentMethods: any[]
  routes: any[]
  errors: any[]
  warnings: any[]
}

export interface FastopertorResponse {
  success: boolean
  data?: FastopertorData
  raw?: any
  message?: string
  error?: string
  details?: any
}

class FastopertorApiService {
  /**
   * Получить данные из Fastopertor API
   */
  async fetchData(config: FastopertorConfig): Promise<FastopertorResponse> {
    try {
      const response = await fetch(`${API_URL}/api/fastopertor/fetch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
      }

      const result: FastopertorResponse = await response.json()
      return result
    } catch (error) {
      console.error('Ошибка получения данных из Fastopertor API:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
        data: {
          orders: [],
          couriers: [],
          paymentMethods: [],
          routes: [],
          errors: [],
          warnings: []
        }
      }
    }
  }

  /**
   * Валидация API подключения
   */
  async validateApi(config: FastopertorConfig): Promise<{ success: boolean; valid: boolean; message?: string; error?: string }> {
    try {
      const response = await fetch(`${API_URL}/api/fastopertor/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
      }

      const result = await response.json()
      return result
    } catch (error) {
      console.error('Ошибка валидации Fastopertor API:', error)
      return {
        success: false,
        valid: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка'
      }
    }
  }
}

export const fastopertorApi = new FastopertorApiService()


