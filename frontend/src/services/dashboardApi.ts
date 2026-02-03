import { API_URL } from '../config/apiConfig'

// Dashboard API imports
import { DashboardApiParams, DashboardApiResponse } from '../types/DashboardApiTypes'
import { ProcessedExcelData } from '../types'
import { transformDashboardData, formatDateForApi, formatDateTimeForApi } from '../utils/data/apiDataTransformer'

export interface DashboardApiConfig {
  apiUrl: string
  apiKey: string
  endpoint?: string
}

export interface DashboardApiResponseWrapper {
  success: boolean
  data?: any
  error?: string
}

class DashboardApiService {
  /**
   * Валидация API подключения
   */
  async validateApi(config: DashboardApiConfig): Promise<{ success: boolean; valid: boolean; message?: string; error?: string }> {
    if (!config.apiKey) {
      return { success: false, valid: false, error: 'API key is required' };
    }
    return { success: true, valid: true, message: 'Dashboard API ready' };
  }

  /**
   * Получить данные из Dashboard API
   */
  async fetchData(config: DashboardApiConfig): Promise<DashboardApiResponseWrapper> {
    try {
      // Создаем параметры для API на основе конфига
      const params = this.createDefaultApiParams(config.apiKey);

      // Вызываем метод получения данных
      const result = await this.fetchOrdersFromDashboard(params);

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
   * Получить заказы из Dashboard API
   * @param params Параметры запроса к API
   * @returns Преобразованные данные в формате ProcessedExcelData
   */
  async fetchOrdersFromDashboard(params: DashboardApiParams): Promise<{ success: boolean; data?: ProcessedExcelData; error?: string }> {
    try {
      // Формирование URL с query параметрами
      const queryParams = new URLSearchParams();

      queryParams.append('top', String(params.top || 1000));

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

      // Retrieve auth token
      const token = localStorage.getItem('km_access_token');

      // Переключаемся на новый оптимизированный эндпоинт /api/dashboard/latest
      // Он использует кэширование и не требует EXTERNAL_API_KEY на каждый запрос
      const response = await fetch(`${API_URL}/api/dashboard/latest?${queryParams.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': token ? `Bearer ${token}` : '',
          'Content-Type': 'application/json'
        }
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`)
      }

      const responseData = await response.json()

      // /api/dashboard/latest возвращает { success, data, ... }, где data - это полезная нагрузка
      const apiData: DashboardApiResponse = responseData.success ? responseData.data : responseData;

      // Преобразование данных API в формат ProcessedExcelData
      const processedData = transformDashboardData(
        apiData,
        params.dateShift || '',
        params.timeDeliveryBeg
      )

      console.log(` Загружено ${processedData.orders.length} заказов и ${processedData.couriers.length} курьеров из Dashboard API`)

      return {
        success: true,
        data: processedData,
      }
    } catch (error) {
      console.error('Ошибка получения данных из Dashboard API:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      }
    }
  }

  /**
   * Вспомогательный метод для создания параметров API на основе текущей даты
   */
  createDefaultApiParams(apiKey: string, departmentId?: number): DashboardApiParams {
    const today = new Date()
    const dateShift = formatDateForApi(today)

    // Окно доставки: с 11:00 до 23:00 текущего дня
    const deliveryStart = new Date(today)
    deliveryStart.setHours(11, 0, 0, 0)

    const deliveryEnd = new Date(today)
    deliveryEnd.setHours(23, 0, 0, 0)

    const res = {
      top: 1000,
      dateShift,
      timeDeliveryBeg: formatDateTimeForApi(deliveryStart),
      timeDeliveryEnd: formatDateTimeForApi(deliveryEnd),
      departmentId,
      apiKey,
    };
    console.log('[DashboardAPI] Default params:', res);
    return res;
  }
}

export const dashboardApi = new DashboardApiService()


