import axios from 'axios';
import { API_URL } from '../../config/apiConfig';

// Интерфейс для ответа от API
export interface FetchDashboardDataResponse {
    success: boolean;
    data: any;
    error?: string;
    details?: any;
}

// Интерфейс для запроса
export interface FetchDashboardDataRequest {
    date: string;       // DD.MM.YYYY
    divisionId?: string; // Опционально, если админ хочет конкретное подразделение
    force?: boolean;     // Принудительно запросить данные из API, игнорируя кэш
    apiKey?: string;     // Опционально, если пользователь хочет использовать свой ключ
}

const API_BASE_URL = `${API_URL}/api/v1`;

export const dashboardApiService = {
    /**
     * Запрос данных дашборда на конкретную дату
     */
    async fetchDataForDate(request: FetchDashboardDataRequest): Promise<FetchDashboardDataResponse> {
        try {
            // Получаем токен из localStorage
            const token = localStorage.getItem('km_access_token');

            if (!token) {
                return {
                    success: false,
                    data: null,
                    error: 'Не авторизован'
                };
            }

            const executeFetch = async () => {
                return await axios.post<FetchDashboardDataResponse>(
                    `${API_BASE_URL}/dashboard/fetch`,
                    request,
                    {
                        headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                        },
                        timeout: 60000 // 60 секунд тайм-аут для тяжелых запросов
                    }
                );
            };

            let response;
            try {
                response = await executeFetch();
            } catch (err: any) {
                // v5.204: Retry once if server is recycling (502/503/504)
                if (err.response && [502, 503, 504].includes(err.response.status)) {
                    console.warn('[dashboardApiService] Server recycling, retrying in 2s...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    response = await executeFetch();
                } else {
                    throw err;
                }
            }

            return response.data;
        } catch (error: any) {
            console.error('❌ Ошибка запроса данных дашборда:', error);

            if (error.response) {
                // Сервер ответил с кодом ошибки
                return {
                    success: false,
                    data: null,
                    error: error.response.data?.error || 'Ошибка сервера',
                    details: error.response.data?.details
                };
            } else if (error.request) {
                // Запрос был сделан, но ответ не получен
                return {
                    success: false,
                    data: null,
                    error: 'Нет ответа от сервера. Проверьте соединение.'
                };
            } else {
                // Произошла ошибка при настройке запроса
                return {
                    success: false,
                    data: null,
                    error: error.message || 'Ошибка выполнения запроса'
                };
            }
        }
    },

    /**
     * Преобразование даты в формат API (DD.MM.YYYY)
     */
    convertDateToApiFormat(dateStr: string): string {
        // Если уже в нужном формате
        if (/^\d{2}\.\d{2}\.\d{4}$/.test(dateStr)) {
            return dateStr;
        }

        // Если формат YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            const [year, month, day] = dateStr.split('-');
            return `${day}.${month}.${year}`;
        }

        return dateStr;
    }
};
