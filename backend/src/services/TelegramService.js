/**
 * Сервис для работы с Telegram API через gramjs
 * Парсинг сообщений из групп и чатов
 */

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Api } = require('telegram/tl');
const fs = require('fs').promises;
const path = require('path');

class TelegramService {
  constructor() {
    this.clients = new Map(); // Храним клиенты по sessionId
    this.sessionsDir = path.join(__dirname, '../../sessions');
    this.ensureSessionsDir();
  }

  async ensureSessionsDir() {
    try {
      await fs.mkdir(this.sessionsDir, { recursive: true });
    } catch (error) {
      console.error('Ошибка создания директории sessions:', error);
    }
  }

  /**
   * Получить путь к файлу сессии
   */
  getSessionPath(sessionId) {
    return path.join(this.sessionsDir, `${sessionId}.session`);
  }

  /**
   * Валидация входных данных
   */
  validateInputs(apiId, apiHash, phoneNumber) {
    // Валидация API ID
    const apiIdNum = parseInt(apiId);
    if (isNaN(apiIdNum) || apiIdNum <= 0) {
      return { valid: false, error: 'API ID должен быть положительным числом' };
    }

    // Валидация API Hash
    if (!apiHash || typeof apiHash !== 'string' || apiHash.length < 20) {
      return { valid: false, error: 'API Hash должен быть строкой длиной не менее 20 символов' };
    }

    // Валидация номера телефона и нормализация для Telegram API
    // Telegram API требует номер без плюса, только цифры
    // Убираем все нецифровые символы
    let cleanPhone = phoneNumber.replace(/\D/g, '');
    
    // Проверяем длину и формат
    // Минимум 7 цифр (для коротких номеров), максимум 15 (международный формат)
    if (cleanPhone.length < 7 || cleanPhone.length > 15) {
      return { valid: false, error: 'Номер телефона должен содержать от 7 до 15 цифр' };
    }
    
    // Проверяем, что номер не начинается с 0 (кроме некоторых стран, но для Украины это недопустимо)
    if (cleanPhone.startsWith('0')) {
      return { valid: false, error: 'Номер телефона не должен начинаться с 0. Используйте формат 380XXXXXXXXX' };
    }

    return { valid: true, cleanPhone };
  }

  /**
   * Инициализация подключения к Telegram
   */
  async initialize(sessionId, apiId, apiHash, phoneNumber) {
    try {
      // Валидация входных данных
      const validation = this.validateInputs(apiId, apiHash, phoneNumber);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error
        };
      }

      const cleanPhone = validation.cleanPhone;

      // Проверяем, есть ли уже клиент для этой сессии
      if (this.clients.has(sessionId)) {
        const client = this.clients.get(sessionId);
        if (client.connected) {
          return { success: true, message: 'Уже подключено' };
        }
      }

      // Загружаем или создаем сессию
      let stringSession = '';
      const sessionPath = this.getSessionPath(sessionId);
      
      try {
        const sessionData = await fs.readFile(sessionPath, 'utf-8');
        // Проверяем, что сессия не пустая и имеет правильный формат
        if (sessionData && sessionData.trim().length > 0) {
          stringSession = sessionData.trim();
        }
      } catch (error) {
        // Файл не существует, создадим новую сессию
        stringSession = '';
      }

      const apiIdNum = parseInt(apiId);
      
      // Логируем входные данные для отладки
      console.log('Инициализация Telegram:', {
        apiId: apiIdNum,
        apiHashLength: apiHash.length,
        phoneOriginal: phoneNumber,
        phoneCleaned: cleanPhone,
        phoneLength: cleanPhone.length
      });
      
      const session = new StringSession(stringSession);
      const client = new TelegramClient(session, apiIdNum, apiHash, {
        connectionRetries: 5,
      });

      await client.connect();

      // Проверяем авторизацию
      if (!(await client.checkAuthorization())) {
        // Нужна авторизация
        try {
          // gramjs требует номер телефона как строку без плюса
          // Убеждаемся, что номер содержит только цифры
          const phoneForApi = cleanPhone.replace(/\D/g, '');
          
          console.log('Отправка кода на номер:', phoneForApi);
          
          // В gramjs 2.26+ sendCode принимает только номер телефона
          const result = await client.sendCode(phoneForApi);

          // Сохраняем временные данные для авторизации
          return {
            success: false,
            needsAuth: true,
            phoneCodeHash: result.phoneCodeHash,
            message: 'Требуется код подтверждения из Telegram'
          };
        } catch (sendCodeError) {
          console.error('Ошибка отправки кода:', sendCodeError);
          console.error('Детали ошибки:', {
            message: sendCodeError.message,
            code: sendCodeError.code,
            phone: cleanPhone,
            apiId: apiIdNum
          });
          
          let errorMessage = sendCodeError.message || 'Проверьте номер телефона и API данные';
          
          // Более детальная обработка ошибок
          if (errorMessage.includes('pattern') || errorMessage.includes('PHONE_NUMBER')) {
            errorMessage = 'Неверный формат номера телефона. Используйте формат +380XXXXXXXXX (без пробелов и дефисов)';
          } else if (errorMessage.includes('API')) {
            errorMessage = 'Неверные API данные. Проверьте API ID и API Hash на my.telegram.org/apps';
          } else if (errorMessage.includes('FLOOD')) {
            errorMessage = 'Слишком много запросов. Подождите несколько минут и попробуйте снова.';
          }
          
          return {
            success: false,
            error: `Ошибка отправки кода: ${errorMessage}`
          };
        }
      }

      // Сохраняем сессию
      const sessionString = client.session.save();
      if (sessionString && sessionString.trim().length > 0) {
        await fs.writeFile(sessionPath, sessionString, 'utf-8');
      }

      // Сохраняем клиент
      this.clients.set(sessionId, client);

      return { success: true, message: 'Успешно подключено' };
    } catch (error) {
      console.error('Ошибка инициализации Telegram:', error);
      let errorMessage = error.message || 'Неизвестная ошибка';
      
      // Более понятные сообщения об ошибках
      if (errorMessage.includes('pattern') || errorMessage.includes('format')) {
        errorMessage = 'Неверный формат данных. Проверьте API ID, API Hash и номер телефона.';
      } else if (errorMessage.includes('PHONE')) {
        errorMessage = 'Неверный формат номера телефона. Используйте формат +380XXXXXXXXX';
      } else if (errorMessage.includes('API')) {
        errorMessage = 'Неверные API данные. Проверьте API ID и API Hash на my.telegram.org/apps';
      }
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Завершение авторизации с кодом
   */
  async completeAuth(sessionId, apiId, apiHash, phoneNumber, phoneCode, phoneCodeHash) {
    try {
      // Валидация входных данных
      const validation = this.validateInputs(apiId, apiHash, phoneNumber);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error
        };
      }

      const cleanPhone = validation.cleanPhone;

      // Валидация кода
      if (!phoneCode || typeof phoneCode !== 'string' || phoneCode.length < 4) {
        return {
          success: false,
          error: 'Код подтверждения должен содержать не менее 4 символов'
        };
      }

      // Валидация phoneCodeHash
      if (!phoneCodeHash || typeof phoneCodeHash !== 'string') {
        return {
          success: false,
          error: 'Неверный phoneCodeHash. Попробуйте подключиться заново.'
        };
      }

      const sessionPath = this.getSessionPath(sessionId);
      let stringSession = '';
      
      try {
        const sessionData = await fs.readFile(sessionPath, 'utf-8');
        if (sessionData && sessionData.trim().length > 0) {
          stringSession = sessionData.trim();
        }
      } catch (error) {
        stringSession = '';
      }

      const apiIdNum = parseInt(apiId);
      const session = new StringSession(stringSession);
      const client = new TelegramClient(session, apiIdNum, apiHash, {
        connectionRetries: 5,
      });

      await client.connect();

      // Завершаем авторизацию
      try {
        // Убеждаемся, что номер содержит только цифры
        const phoneForApi = cleanPhone.replace(/\D/g, '');
        
        console.log('Завершение авторизации:', {
          phone: phoneForApi,
          codeLength: phoneCode.trim().length,
          hashLength: phoneCodeHash.trim().length
        });
        
        // gramjs signInUser принимает параметры в другом формате
        await client.signInUser({
          phoneNumber: phoneForApi,
          phoneCodeHash: phoneCodeHash.trim(),
          phoneCode: phoneCode.trim()
        });
      } catch (signInError) {
        console.error('Ошибка входа:', signInError);
        let errorMessage = signInError.message || 'Неизвестная ошибка';
        
        if (errorMessage.includes('PHONE_CODE') || errorMessage.includes('code')) {
          errorMessage = 'Неверный код подтверждения. Проверьте код и попробуйте снова.';
        } else if (errorMessage.includes('expired') || errorMessage.includes('timeout')) {
          errorMessage = 'Код подтверждения истек. Запросите новый код.';
        }
        
        return {
          success: false,
          error: errorMessage
        };
      }

      // Сохраняем сессию
      const sessionString = client.session.save();
      if (sessionString && sessionString.trim().length > 0) {
        await fs.writeFile(sessionPath, sessionString, 'utf-8');
      }

      // Сохраняем клиент
      this.clients.set(sessionId, client);

      return { success: true, message: 'Авторизация завершена' };
    } catch (error) {
      console.error('Ошибка завершения авторизации:', error);
      let errorMessage = error.message || 'Неизвестная ошибка';
      
      if (errorMessage.includes('pattern') || errorMessage.includes('format')) {
        errorMessage = 'Неверный формат данных. Проверьте все поля.';
      }
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Получение клиента по sessionId
   */
  getClient(sessionId) {
    const client = this.clients.get(sessionId);
    if (!client || !client.connected) {
      throw new Error('Клиент не подключен. Выполните инициализацию.');
    }
    return client;
  }

  /**
   * Проверка статуса подключения
   */
  isConnected(sessionId) {
    const client = this.clients.get(sessionId);
    return client && client.connected;
  }

  /**
   * Получение списка всех чатов и групп
   */
  async getChats(sessionId) {
    try {
      const client = this.getClient(sessionId);
      const dialogs = await client.getDialogs({ limit: 200 });

      const chats = dialogs.map(dialog => {
        const entity = dialog.entity;
        let type = 'private';
        let name = 'Без названия';

        if (entity instanceof Api.Channel) {
          type = 'channel';
          name = entity.title || 'Без названия';
        } else if (entity instanceof Api.Chat) {
          type = 'group';
          name = entity.title || 'Без названия';
        } else if (entity instanceof Api.User) {
          type = 'private';
          name = `${entity.firstName || ''} ${entity.lastName || ''}`.trim() || entity.username || 'Без названия';
        }

        return {
          id: entity.id.toString(),
          name: name,
          type: type,
          username: entity.username || null,
          membersCount: entity.participantsCount || null
        };
      });

      return { success: true, chats };
    } catch (error) {
      console.error('Ошибка получения списка чатов:', error);
      return {
        success: false,
        error: error.message || 'Неизвестная ошибка'
      };
    }
  }

  /**
   * Поиск сообщений по запросу в выбранных чатах
   */
  async searchMessages(sessionId, options) {
    try {
      const { query, chatIds, dateFrom, dateTo, limit = 100 } = options;
      const client = this.getClient(sessionId);
      const results = [];

      // Извлекаем семизначные номера
      const sevenDigitNumbers = this.extractSevenDigitNumbers(query);

      // Если есть семизначные номера, ищем по каждому
      if (sevenDigitNumbers.length > 0) {
        for (const number of sevenDigitNumbers) {
          for (const chatId of chatIds || []) {
            try {
              const entity = await client.getEntity(chatId);
              const messages = await client.getMessages(entity, {
                search: number,
                limit: limit
              });

              for (const msg of messages) {
                const messageText = msg.text || msg.message || '';
                if (messageText && messageText.includes(number)) {
                  const sender = msg.sender;
                  results.push({
                    id: msg.id,
                    chatId: chatId,
                    chatName: entity.title || entity.firstName || entity.name || 'Без названия',
                    text: messageText,
                    date: msg.date,
                    author: sender ? (sender.firstName || sender.username || 'Неизвестно') : undefined,
                    authorId: msg.senderId ? msg.senderId.toString() : undefined,
                    isForwarded: msg.fwdFrom !== undefined,
                    forwardedFrom: msg.fwdFrom?.fromId?.toString()
                  });
                }
              }
            } catch (error) {
              console.error(`Ошибка поиска в чате ${chatId}:`, error);
            }
          }
        }
      }

      // Если есть текст запроса (не только цифры), ищем и по нему
      if (query.trim() && sevenDigitNumbers.length === 0) {
        for (const chatId of chatIds || []) {
          try {
            const entity = await client.getEntity(chatId);
            const messages = await client.getMessages(entity, {
              search: query,
              limit: limit
            });

            for (const msg of messages) {
              const messageText = msg.text || msg.message || '';
              const sender = msg.sender;
              results.push({
                id: msg.id,
                chatId: chatId,
                chatName: entity.title || entity.firstName || entity.name || 'Без названия',
                text: messageText,
                date: msg.date,
                author: sender ? (sender.firstName || sender.username || 'Неизвестно') : undefined,
                authorId: msg.senderId ? msg.senderId.toString() : undefined,
                isForwarded: msg.fwdFrom !== undefined,
                forwardedFrom: msg.fwdFrom?.fromId?.toString()
              });
            }
          } catch (error) {
            console.error(`Ошибка поиска в чате ${chatId}:`, error);
          }
        }
      }

      // Убираем дубликаты
      const uniqueResults = results.filter((result, index, self) =>
        index === self.findIndex(r => r.id === result.id && r.chatId === result.chatId)
      );

      return { success: true, messages: uniqueResults };
    } catch (error) {
      console.error('Ошибка поиска сообщений:', error);
      return {
        success: false,
        error: error.message || 'Неизвестная ошибка'
      };
    }
  }

  /**
   * Извлечение семизначных цифр из текста
   */
  extractSevenDigitNumbers(text) {
    const regex = /\b\d{7}\b/g;
    const matches = text.match(regex) || [];
    return [...new Set(matches)]; // Убираем дубликаты
  }

  /**
   * Отключение от Telegram
   */
  async disconnect(sessionId) {
    try {
      const client = this.clients.get(sessionId);
      if (client && client.connected) {
        await client.disconnect();
      }
      this.clients.delete(sessionId);
      return { success: true, message: 'Отключено' };
    } catch (error) {
      console.error('Ошибка отключения:', error);
      return {
        success: false,
        error: error.message || 'Неизвестная ошибка'
      };
    }
  }
}

// Экспортируем singleton
module.exports = new TelegramService();

