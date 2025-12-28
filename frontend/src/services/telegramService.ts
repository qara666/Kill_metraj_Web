/**
 * Сервис для работы с Telegram API через backend
 * Парсинг сообщений из групп и чатов
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';


export interface TelegramChat {
  id: string
  name: string
  type: 'group' | 'channel' | 'private'
  username?: string
  membersCount?: number
}

export interface TelegramMessage {
  id: number
  chatId: string
  chatName: string
  text: string
  date: Date
  author?: string
  authorId?: string
  isForwarded?: boolean
  forwardedFrom?: string
}

export interface SearchOptions {
  query: string
  chatIds?: string[]
  dateFrom?: Date
  dateTo?: Date
  limit?: number
}

class TelegramService {
  private sessionId: string | null = null
  private isConnected: boolean = false

  /**
   * Генерация уникального sessionId
   */
  private generateSessionId(): string {
    return `telegram_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Получение или создание sessionId
   */
  private getSessionId(): string {
    if (!this.sessionId) {
      // Пытаемся загрузить из localStorage
      const saved = localStorage.getItem('telegram_session_id');
      if (saved) {
        this.sessionId = saved;
      } else {
        this.sessionId = this.generateSessionId();
        localStorage.setItem('telegram_session_id', this.sessionId);
      }
    }
    return this.sessionId;
  }

  /**
   * Инициализация подключения к Telegram
   */
  async initialize(apiId: string, apiHash: string, phoneNumber: string): Promise<{ success: boolean; needsAuth?: boolean; phoneCodeHash?: string; message?: string; error?: string }> {
    try {
      // Проверяем доступность API перед запросом
      try {
        const healthCheck = await fetch(`${API_BASE_URL}/api/health`, { 
          method: 'GET',
          signal: AbortSignal.timeout(3000) // 3 секунды таймаут
        });
        if (!healthCheck.ok) {
          return {
            success: false,
            error: `Backend сервер недоступен (HTTP ${healthCheck.status}). Убедитесь, что сервер запущен на ${API_BASE_URL}`
          };
        }
      } catch (healthError: any) {
        return {
          success: false,
          error: `Не удалось подключиться к backend серверу (${API_BASE_URL}). Убедитесь, что сервер запущен. Ошибка: ${healthError.message || 'Сервер недоступен'}`
        };
      }

      const sessionId = this.getSessionId();
      
      const response = await fetch(`${API_BASE_URL}/api/telegram/initialize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          apiId,
          apiHash,
          phoneNumber
        })
      });

      // Проверяем статус ответа
      if (!response.ok) {
        let errorText = '';
        try {
          errorText = await response.text();
          // Пытаемся распарсить как JSON
          try {
            const errorJson = JSON.parse(errorText);
            errorText = errorJson.error || errorText;
          } catch {
            // Если не JSON, используем как есть
          }
        } catch (e) {
          errorText = `HTTP ${response.status}: ${response.statusText}`;
        }
        
        console.error('Ошибка HTTP:', response.status, errorText);
        
        if (response.status === 404) {
          return {
            success: false,
            error: `Роут /api/telegram/initialize не найден (404). Проверьте, что backend сервер запущен и роуты подключены правильно. URL: ${API_BASE_URL}`
          };
        }
        
        return {
          success: false,
          error: `Ошибка сервера (${response.status}): ${errorText}`
        };
      }

      // Пытаемся распарсить JSON
      let result;
      try {
        const text = await response.text();
        if (!text || text.trim().length === 0) {
          return {
            success: false,
            error: 'Пустой ответ от сервера'
          };
        }
        result = JSON.parse(text);
      } catch (parseError: any) {
        console.error('Ошибка парсинга JSON:', parseError);
        return {
          success: false,
          error: `Ошибка парсинга ответа: ${parseError.message || 'Неверный формат ответа от сервера. Убедитесь, что сервер возвращает JSON.'}`
        };
      }
      
      if (result.success) {
        this.isConnected = true;
      } else if (result.needsAuth) {
        // Требуется авторизация, но это не ошибка
        return result;
      }
      
      return result;
    } catch (error: any) {
      console.error('Ошибка инициализации Telegram:', error);
      return {
        success: false,
        error: error.message || 'Неизвестная ошибка'
      };
    }
  }

  /**
   * Завершение авторизации с кодом
   */
  async completeAuth(apiId: string, apiHash: string, phoneNumber: string, phoneCode: string, phoneCodeHash: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const sessionId = this.getSessionId();
      
      const response = await fetch(`${API_BASE_URL}/api/telegram/complete-auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId,
          apiId,
          apiHash,
          phoneNumber,
          phoneCode,
          phoneCodeHash
        })
      });

      const result = await response.json();
      
      if (result.success) {
        this.isConnected = true;
      }
      
      return result;
    } catch (error: any) {
      console.error('Ошибка завершения авторизации:', error);
      return {
        success: false,
        error: error.message || 'Неизвестная ошибка'
      };
    }
  }

  /**
   * Проверка статуса подключения
   */
  async checkConnectionStatus(): Promise<boolean> {
    try {
      const sessionId = this.getSessionId();
      const response = await fetch(`${API_BASE_URL}/api/telegram/status/${sessionId}`);
      const result = await response.json();
      
      this.isConnected = result.success && result.connected;
      return this.isConnected;
    } catch (error) {
      console.error('Ошибка проверки статуса:', error);
      this.isConnected = false;
      return false;
    }
  }

  /**
   * Получение статуса подключения (синхронное)
   */
  getConnectionStatus(): boolean {
    return this.isConnected;
  }

  /**
   * Получение списка всех чатов и групп
   */
  async getChats(): Promise<TelegramChat[]> {
    try {
      const sessionId = this.getSessionId();
      const response = await fetch(`${API_BASE_URL}/api/telegram/chats/${sessionId}`);
      const result = await response.json();
      
      if (result.success && result.chats) {
        return result.chats;
      } else {
        throw new Error(result.error || 'Не удалось получить список чатов');
      }
    } catch (error: any) {
      console.error('Ошибка получения списка чатов:', error);
      throw error;
    }
  }

  /**
   * Поиск сообщений по запросу в выбранных чатах
   */
  async searchMessages(options: SearchOptions): Promise<TelegramMessage[]> {
    try {
      const sessionId = this.getSessionId();
      const { query, chatIds, dateFrom, dateTo, limit } = options;
      
      const response = await fetch(`${API_BASE_URL}/api/telegram/search/${sessionId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          chatIds,
          dateFrom: dateFrom ? dateFrom.toISOString() : undefined,
          dateTo: dateTo ? dateTo.toISOString() : undefined,
          limit
        })
      });

      const result = await response.json();
      
      if (result.success && result.messages) {
        // Преобразуем даты из строк в Date объекты
        return result.messages.map((msg: any) => ({
          ...msg,
          date: new Date(msg.date)
        }));
      } else {
        throw new Error(result.error || 'Не удалось выполнить поиск');
      }
    } catch (error: any) {
      console.error('Ошибка поиска сообщений:', error);
      throw error;
    }
  }

  /**
   * Извлечение семизначных цифр из текста
   */
  extractSevenDigitNumbers(text: string): string[] {
    const regex = /\b\d{7}\b/g
    const matches = text.match(regex) || []
    return [...new Set(matches)] // Убираем дубликаты
  }

  /**
   * Извлечение частичных номеров (4-6 цифр) из текста
   */
  extractPartialNumbers(text: string): string[] {
    const regex = /\b\d{4,6}\b/g
    const matches = text.match(regex) || []
    return [...new Set(matches)] // Убираем дубликаты
  }

  /**
   * Проверка, заканчивается ли семизначный номер на указанную часть
   */
  numberEndsWith(fullNumber: string, part: string): boolean {
    if (!fullNumber || !part || fullNumber.length !== 7) return false
    return fullNumber.endsWith(part)
  }

  /**
   * Извлечение всех семизначных номеров из текста, которые заканчиваются на указанную часть
   */
  extractFullNumbersEndingWith(text: string, part: string): string[] {
    if (!text || !part) return []
    const regex = /\b\d{7}\b/g
    const matches = text.match(regex) || []
    return matches.filter(num => this.numberEndsWith(num, part))
  }

  /**
   * Генерация вариантов поиска для семизначного номера
   * Возвращает полный номер и его части (последние 4-6 цифр)
   */
  generateSearchVariants(fullNumber: string): string[] {
    if (!fullNumber || fullNumber.length !== 7) {
      return [fullNumber]
    }
    
    const variants = [fullNumber] // Полный номер
    // Последние 6 цифр
    if (fullNumber.length >= 6) {
      variants.push(fullNumber.slice(1))
    }
    // Последние 5 цифр
    if (fullNumber.length >= 5) {
      variants.push(fullNumber.slice(2))
    }
    // Последние 4 цифры
    if (fullNumber.length >= 4) {
      variants.push(fullNumber.slice(3))
    }
    
    return [...new Set(variants)] // Убираем дубликаты
  }

  /**
   * Проверка, содержит ли текст номер или его часть
   */
  containsNumberOrPart(text: string, fullNumber: string): boolean {
    if (!text || !fullNumber) return false
    
    // Проверяем полный номер
    if (text.includes(fullNumber)) return true
    
    // Проверяем части номера (последние 4-6 цифр)
    const variants = this.generateSearchVariants(fullNumber)
    for (const variant of variants) {
      if (variant !== fullNumber && text.includes(variant)) {
        return true
      }
    }
    
    return false
  }

  /**
   * Поиск сообщений по конкретному номеру в конкретном чате
   */
  async searchByNumberInChat(chatId: string, number: string): Promise<TelegramMessage[]> {
    return this.searchMessages({
      query: number,
      chatIds: [chatId],
      limit: 50
    })
  }

  /**
   * Получение информации о чате
   */
  async getChatInfo(chatId: string): Promise<TelegramChat | null> {
    try {
      const chats = await this.getChats();
      return chats.find(chat => chat.id === chatId) || null;
    } catch (error) {
      console.error('Ошибка получения информации о чате:', error);
      return null;
    }
  }

  /**
   * Отключение от Telegram
   */
  async disconnect(): Promise<void> {
    try {
      const sessionId = this.getSessionId();
      await fetch(`${API_BASE_URL}/api/telegram/disconnect/${sessionId}`, {
        method: 'POST'
      });
      
      this.isConnected = false;
      this.sessionId = null;
      localStorage.removeItem('telegram_session_id');
    } catch (error) {
      console.error('Ошибка отключения:', error);
      this.isConnected = false;
    }
  }
}

// Экспортируем singleton
export const telegramService = new TelegramService()
