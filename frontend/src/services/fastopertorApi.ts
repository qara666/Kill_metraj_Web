const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001'

// Swagger API imports
import { SwaggerApiParams, SwaggerApiResponse } from '../types/SwaggerApiTypes'
import { ProcessedExcelData } from '../types'
import { transformSwaggerData, formatDateForSwagger, formatDateTimeForSwagger } from '../utils/data/swaggerDataTransformer'

export interface FastopertorConfig {
  apiUrl: string
  apiKey: string
  endpoint?: string
}

export interface FastopertorResponse {
  success: boolean
  data?: any
  error?: string
}

class FastopertorApiService {
  /**
   * Валидация API подключения (совместимость со старым кодом)
   */
  async validateApi(config: FastopertorConfig): Promise<{ success: boolean; valid: boolean; message?: string; error?: string }> {
    // В новой архитектуре мы используем Swagger API, поэтому просто проверим наличие ключа
    // или можно сделать реальный запрос к health endpoints
    if (!config.apiKey) {
      return { success: false, valid: false, error: 'API key is required' };
    }
    return { success: true, valid: true, message: 'Swagger API ready' };
  }

  /**
   * Получить данные из Fastopertor API (обертка над Swagger API для совместимости)
   */
  async fetchData(config: FastopertorConfig): Promise<FastopertorResponse> {
    try {
      // Создаем параметры для Swagger API на основе конфига
      const params = this.createDefaultSwaggerParams(config.apiKey);

      // Вызываем новый метод
      const result = await this.fetchOrdersFromSwagger(params);

      if (result.success && result.data) {
        return {
          success: true,
          data: result.data
        };
      } else {
        return {
          success: false,
          error: result.error || 'Failed to fetch data'
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Получить заказы из Swagger API
   * @param params Параметры запроса к Swagger API
   * @returns Преобразованные данные в формате ProcessedExcelData
   */
  async fetchOrdersFromSwagger(params: SwaggerApiParams): Promise<{ success: boolean; data?: ProcessedExcelData; error?: string }> {
    try {
      // Формирование URL с query параметрами
      const queryParams = new URLSearchParams();

      queryParams.append('top', String(params.top || 1000));

      if (params.apiKey) {
        queryParams.append('apiKey', params.apiKey);
      }

      if (params.dateShift && params.dateShift.trim() && params.dateShift !== 'undefined') {
        queryParams.append('dateShift', params.dateShift);
      }

      if (params.timeDeliveryBeg) {
        queryParams.append('timeDeliveryBeg', params.timeDeliveryBeg);
      }

      if (params.timeDeliveryEnd) {
        queryParams.append('timeDeliveryEnd', params.timeDeliveryEnd);
      }

      if (params.departmentId) {
        queryParams.append('departmentId', String(params.departmentId));
      }

      // Отправка запроса к Swagger API
      // ВАЖНО: Мы НЕ передаем кастомные заголовки (x-api-key, Content-Type),
      // чтобы запрос считался "Simple Request" и браузер не делал OPTIONS pre-flight check.
      const response = await fetch(`${API_URL}/api/swagger/orders?${queryParams.toString()}`, {
        method: 'GET',
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
      }

      const swaggerData: SwaggerApiResponse = await response.json()

      // Преобразование данных Swagger в формат ProcessedExcelData
      const processedData = transformSwaggerData(
        swaggerData,
        params.dateShift || '',
        params.timeDeliveryBeg
      )

      console.log(`✅ Загружено ${processedData.orders.length} заказов и ${processedData.couriers.length} курьеров из Swagger API`)

      return {
        success: true,
        data: processedData,
      }
    } catch (error) {
      console.error('Ошибка получения данных из Swagger API:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      }
    }
  }

  /**
   * Вспомогательный метод для создания параметров Swagger API на основе текущей даты
   */
  createDefaultSwaggerParams(apiKey: string, departmentId?: number): SwaggerApiParams {
    const today = new Date()
    const dateShift = formatDateForSwagger(today)

    // Окно доставки: с 11:00 до 23:00 текущего дня
    const deliveryStart = new Date(today)
    deliveryStart.setHours(11, 0, 0, 0)

    const deliveryEnd = new Date(today)
    deliveryEnd.setHours(23, 0, 0, 0)

    return {
      top: 1000,
      dateShift,
      timeDeliveryBeg: formatDateTimeForSwagger(deliveryStart),
      timeDeliveryEnd: formatDateTimeForSwagger(deliveryEnd),
      departmentId,
      apiKey,
    }
  }
}

export const fastopertorApi = new FastopertorApiService()


