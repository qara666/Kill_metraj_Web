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
    if (!apiId) {
      return { valid: false, error: 'API ID обязателен' };
    }
    
    const apiIdStr = String(apiId).trim();
    if (apiIdStr.length === 0) {
      return { valid: false, error: 'API ID не может быть пустым' };
    }
    
    const apiIdNum = parseInt(apiIdStr);
    if (isNaN(apiIdNum) || apiIdNum <= 0) {
      return { valid: false, error: `API ID должен быть положительным числом (получено: ${apiIdStr})` };
    }

    // Валидация API Hash
    if (!apiHash) {
      return { valid: false, error: 'API Hash обязателен' };
    }
    
    if (typeof apiHash !== 'string') {
      return { valid: false, error: `API Hash должен быть строкой (получен тип: ${typeof apiHash})` };
    }
    
    // Более агрессивная очистка: убираем все пробелы, переносы строк и невидимые символы
    const apiHashStr = String(apiHash).replace(/[\s\n\r\t\u00A0\u2000-\u200B\u2028\u2029\uFEFF]/g, '').trim();
    
    if (apiHashStr.length < 20) {
      return { valid: false, error: `API Hash должен быть строкой длиной не менее 20 символов (получено: ${apiHashStr.length} после очистки)` };
    }
    
    // Проверяем, что API Hash содержит только допустимые символы (hex)
    if (!/^[a-f0-9]+$/i.test(apiHashStr)) {
      // Логируем проблемные символы для отладки
      const invalidChars = apiHashStr.match(/[^a-f0-9]/gi);
      return { 
        valid: false, 
        error: `API Hash должен содержать только шестнадцатеричные символы (0-9, a-f). Найдены недопустимые символы: ${invalidChars ? invalidChars.join(', ') : 'неизвестно'}` 
      };
    }

    // Валидация номера телефона и нормализация для Telegram API
    if (!phoneNumber) {
      return { valid: false, error: 'Номер телефона обязателен' };
    }
    
    if (typeof phoneNumber !== 'string') {
      return { valid: false, error: `Номер телефона должен быть строкой (получен тип: ${typeof phoneNumber})` };
    }
    
    // Telegram API требует номер без плюса, только цифры
    // Убираем все нецифровые символы
    let cleanPhone = phoneNumber.replace(/\D/g, '');
    
    // Проверяем длину и формат
    // Минимум 7 цифр (для коротких номеров), максимум 15 (международный формат)
    if (cleanPhone.length < 7 || cleanPhone.length > 15) {
      return { valid: false, error: `Номер телефона должен содержать от 7 до 15 цифр (получено: ${cleanPhone.length} цифр из "${phoneNumber}")` };
    }
    
    // Проверяем, что номер не начинается с 0 (кроме некоторых стран, но для Украины это недопустимо)
    if (cleanPhone.startsWith('0')) {
      return { valid: false, error: 'Номер телефона не должен начинаться с 0. Используйте формат 380XXXXXXXXX' };
    }
    
    // Проверяем, что номер содержит только цифры
    if (!/^\d+$/.test(cleanPhone)) {
      return { valid: false, error: `Номер телефона должен содержать только цифры (получено: "${phoneNumber}")` };
    }

    return { valid: true, cleanPhone, cleanApiHash: apiHashStr };
  }

  /**
   * Инициализация подключения к Telegram
   */
  async initialize(sessionId, apiId, apiHash, phoneNumber) {
    try {
      // Валидация API данных (обязательны всегда)
      if (!apiId) {
        return { valid: false, error: 'API ID обязателен' };
      }
      const apiIdStr = String(apiId).trim();
      if (apiIdStr.length === 0) {
        return { valid: false, error: 'API ID не может быть пустым' };
      }
      const apiIdNum = parseInt(apiIdStr);
      if (isNaN(apiIdNum) || apiIdNum <= 0) {
        return {
          success: false,
          error: `API ID должен быть положительным числом (получено: ${apiIdStr})`
        };
      }

      // Валидация API Hash
      if (!apiHash) {
        return {
          success: false,
          error: 'API Hash обязателен'
        };
      }
      const cleanApiHash = String(apiHash).replace(/[\s\n\r\t\u00A0\u2000-\u200B\u2028\u2029\uFEFF]/g, '').trim();
      if (cleanApiHash.length < 20) {
        return {
          success: false,
          error: `API Hash должен быть строкой длиной не менее 20 символов (получено: ${cleanApiHash.length} после очистки)`
        };
      }
      if (!/^[a-f0-9]+$/i.test(cleanApiHash)) {
        return {
          success: false,
          error: 'API Hash должен содержать только шестнадцатеричные символы (0-9, a-f)'
        };
      }

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
      let hasExistingSession = false;
      
      try {
        const sessionData = await fs.readFile(sessionPath, 'utf-8');
        // Проверяем, что сессия не пустая и имеет правильный формат
        if (sessionData && sessionData.trim().length > 0) {
          stringSession = sessionData.trim();
          hasExistingSession = true;
        }
      } catch (error) {
        // Файл не существует, создадим новую сессию
        stringSession = '';
        hasExistingSession = false;
      }

      // Номер телефона полностью опционален - обрабатываем его локально
      let processedPhone = '';
      if (phoneNumber && typeof phoneNumber === 'string' && phoneNumber.trim().length > 0) {
        // Валидация номера телефона только если он передан
        const tempPhone = phoneNumber.replace(/\D/g, '');
        if (tempPhone.length >= 7 && tempPhone.length <= 15 && !tempPhone.startsWith('0') && /^\d+$/.test(tempPhone)) {
          processedPhone = tempPhone;
        }
      }

      // Логируем входные данные для отладки
      console.log('Инициализация Telegram:', {
        apiId: apiIdNum,
        apiIdType: typeof apiIdNum,
        apiIdOriginal: apiId,
        apiHashOriginal: apiHash ? `${apiHash.substring(0, 10)}...` : 'undefined',
        apiHashCleaned: cleanApiHash ? `${cleanApiHash.substring(0, 10)}...` : 'undefined',
        apiHashLength: cleanApiHash ? cleanApiHash.length : 0,
        apiHashType: typeof cleanApiHash,
        phoneOriginal: phoneNumber || 'не требуется (сессия существует)',
        phoneProcessed: processedPhone || 'не требуется',
        phoneLength: processedPhone ? processedPhone.length : 0,
        hasExistingSession: hasExistingSession,
        sessionExists: !!stringSession,
        sessionLength: stringSession ? stringSession.length : 0
      });
      
      // Создаем сессию и клиент с проверками
      let session;
      let client;
      
      try {
        session = new StringSession(stringSession || '');
        console.log('Сессия создана успешно');
      } catch (sessionError) {
        console.error('Ошибка создания сессии:', sessionError);
        return {
          success: false,
          error: 'Ошибка создания сессии: ' + (sessionError.message || 'Неизвестная ошибка')
        };
      }
      
      try {
        // Используем уже очищенный API Hash
        client = new TelegramClient(session, apiIdNum, cleanApiHash, {
          connectionRetries: 5,
        });
        console.log('Клиент Telegram создан успешно');
      } catch (clientError) {
        console.error('Ошибка создания клиента:', clientError);
        console.error('Детали ошибки создания клиента:', {
          message: clientError.message,
          stack: clientError.stack,
          apiId: apiIdNum,
          apiIdType: typeof apiIdNum,
          apiHashType: typeof apiHash,
          apiHashLength: apiHash ? apiHash.length : 0
        });
        return {
          success: false,
          error: 'Ошибка создания клиента Telegram: ' + (clientError.message || 'Неизвестная ошибка')
        };
      }

      await client.connect();

      // Проверяем авторизацию
      if (!(await client.checkAuthorization())) {
        // Нужна авторизация
        // Номер телефона опционален - если не передан, просто возвращаем ошибку
        
        if (!processedPhone || processedPhone.length === 0) {
          return {
            success: false,
            error: 'Требуется авторизация. Если у вас нет сохраненной сессии, укажите номер телефона для получения кода подтверждения. Если сессия уже была сохранена ранее, попробуйте переподключиться.'
          };
        }
        
        try {
          // Валидация длины номера перед отправкой
          if (processedPhone.length < 10 || processedPhone.length > 15) {
            throw new Error(`Номер телефона должен содержать от 10 до 15 цифр (получено: ${processedPhone.length} цифр)`);
          }
          
          // Используем локальную переменную processedPhone
          console.log('Отправка кода на номер:', {
            phone: processedPhone,
            phoneLength: processedPhone.length,
            phoneType: typeof processedPhone,
            apiId: apiIdNum,
            apiIdType: typeof apiIdNum,
            apiHashLength: cleanApiHash.length,
            apiHashType: typeof cleanApiHash,
            apiHashPrefix: cleanApiHash.substring(0, 5) + '...',
            apiHashValid: /^[a-f0-9]+$/i.test(cleanApiHash)
          });
          
          // Логируем финальные параметры перед вызовом
          console.log('Вызов client.sendCode с параметрами:', {
            phone: processedPhone,
            phoneLength: processedPhone.length,
            phoneType: typeof processedPhone,
            apiId: apiIdNum,
            apiHashLength: cleanApiHash.length,
            apiHashValid: /^[a-f0-9]+$/i.test(cleanApiHash)
          });
          
          const result = await client.sendCode(processedPhone);

          // Проверяем результат
          if (!result || !result.phoneCodeHash) {
            throw new Error('Не удалось получить phoneCodeHash от Telegram');
          }

          // Сохраняем временные данные для авторизации
          return {
            success: false,
            needsAuth: true,
            phoneCodeHash: result.phoneCodeHash,
            message: 'Требуется код подтверждения из Telegram'
          };
        } catch (sendCodeError) {
          console.error('Ошибка отправки кода:', sendCodeError);
          
          // Безопасное извлечение информации об ошибке
          const errorMessage = sendCodeError?.message || String(sendCodeError) || 'Неизвестная ошибка';
          const errorName = sendCodeError?.name || 'Error';
          const errorStack = sendCodeError?.stack || '';
          const errorCode = sendCodeError?.code || '';
          const errorType = (sendCodeError && typeof sendCodeError === 'object' && sendCodeError.constructor) 
            ? sendCodeError.constructor.name 
            : typeof sendCodeError;
          
          // Используем локальную переменную processedPhone из области видимости
          const phoneForLog = processedPhone || '';
          const phoneLength = phoneForLog ? phoneForLog.length : 0;
          
          console.error('Детали ошибки:', {
            message: errorMessage,
            stack: errorStack,
            code: errorCode,
            name: errorName,
            type: errorType,
            phone: phoneForLog || 'не указан',
            phoneLength: phoneLength,
            apiId: apiIdNum,
            apiIdType: typeof apiIdNum,
            apiHashCleaned: cleanApiHash ? `${cleanApiHash.substring(0, 10)}...` : 'undefined',
            apiHashLength: cleanApiHash ? cleanApiHash.length : 0,
            apiHashType: typeof cleanApiHash,
            apiHashValid: cleanApiHash ? /^[a-f0-9]+$/i.test(cleanApiHash) : false
          });
          
          // Безопасное извлечение сообщения об ошибке
          const originalErrorMessage = errorMessage || 'Проверьте номер телефона и API данные';
          const errorString = String(originalErrorMessage).toLowerCase();
          const errorNameLower = errorName ? String(errorName).toLowerCase() : '';
          
          let finalErrorMessage = originalErrorMessage;
          
          // Более детальная обработка ошибок
          if (errorString.includes('pattern') || errorString.includes('phone_number') || errorString.includes('constructor') || errorString.includes('invalid') || errorNameLower.includes('invalid')) {
            // Проверяем конкретные проблемы
            if (errorString.includes('phone') || errorString.includes('number') || errorNameLower.includes('phone')) {
              finalErrorMessage = `Неверный формат номера телефона. Проверьте, что номер в формате +380XXXXXXXXX или 380XXXXXXXXX (получено: ${phoneForLog || 'не указан'}, длина: ${phoneLength}). Убедитесь, что номер начинается с кода страны (380 для Украины).`;
            } else if (errorString.includes('api') || errorString.includes('id') || errorNameLower.includes('api')) {
              finalErrorMessage = `Неверные API данные. Проверьте API ID (${apiIdNum}) и API Hash (длина: ${cleanApiHash ? cleanApiHash.length : 0}) на my.telegram.org/apps. Убедитесь, что вы используете правильные учетные данные.`;
            } else {
              // Более детальное сообщение с информацией о всех параметрах
              finalErrorMessage = `Неверный формат данных. Проверьте все поля:\n- Номер: ${phoneForLog || 'не указан'} (длина: ${phoneLength})\n- API ID: ${apiIdNum}\n- API Hash: длина ${cleanApiHash ? cleanApiHash.length : 0}, валиден: ${cleanApiHash ? /^[a-f0-9]+$/i.test(cleanApiHash) : false}\n\nОригинальная ошибка: ${originalErrorMessage}`;
            }
          } else if (errorString.includes('api_id') || errorString.includes('api_hash') || errorNameLower.includes('api')) {
            finalErrorMessage = 'Неверные API данные. Проверьте API ID и API Hash на my.telegram.org/apps. Убедитесь, что вы используете правильные учетные данные из вашего приложения.';
          } else if (errorString.includes('flood') || errorString.includes('wait') || errorNameLower.includes('flood')) {
            finalErrorMessage = 'Слишком много запросов. Подождите несколько минут и попробуйте снова.';
          } else if (errorString.includes('undefined') || errorString.includes('null') || errorString.includes('is not defined') || errorString.includes('cannot read')) {
            // Обработка ошибок типа "Cannot read properties of undefined"
            finalErrorMessage = `Ошибка инициализации Telegram API. Проверьте правильность введенных данных:\n- Номер телефона: ${phoneForLog || 'не указан'} (длина: ${phoneLength})\n- API ID: ${apiIdNum}\n- API Hash: длина ${cleanApiHash ? cleanApiHash.length : 0}, валиден: ${cleanApiHash ? /^[a-f0-9]+$/i.test(cleanApiHash) : false}\n\nВозможно, проблема в формате данных или в самом Telegram API. Попробуйте проверить данные на my.telegram.org/apps.`;
          } else {
            // Если это неизвестная ошибка, показываем оригинальное сообщение с контекстом
            finalErrorMessage = `Ошибка Telegram API: ${originalErrorMessage}. Проверьте правильность введенных данных (API ID, API Hash).`;
          }
          
          return {
            success: false,
            error: `Ошибка отправки кода: ${finalErrorMessage}`
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
        errorMessage = 'Неверный формат данных. Проверьте API ID и API Hash.';
      } else if (errorMessage.includes('PHONE')) {
        errorMessage = 'Ошибка авторизации. Проверьте API ID и API Hash на my.telegram.org/apps';
      } else if (errorMessage.includes('API')) {
        errorMessage = 'Неверные API данные. Проверьте API ID и API Hash на my.telegram.org/apps';
      } else if (errorMessage.includes('is not defined') || errorMessage.includes('undefined')) {
        // Если ошибка связана с неопределенными переменными, добавляем контекст
        errorMessage = `Ошибка инициализации: ${errorMessage}. Проверьте правильность введенных данных (API ID, API Hash).`;
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
      // Валидация API данных (номер телефона не требуется)
      if (!apiId) {
        return {
          success: false,
          error: 'API ID обязателен'
        };
      }
      const apiIdStr = String(apiId).trim();
      if (apiIdStr.length === 0) {
        return {
          success: false,
          error: 'API ID не может быть пустым'
        };
      }
      const apiIdNum = parseInt(apiIdStr);
      if (isNaN(apiIdNum) || apiIdNum <= 0) {
        return {
          success: false,
          error: `API ID должен быть положительным числом (получено: ${apiIdStr})`
        };
      }

      // Валидация API Hash
      if (!apiHash) {
        return {
          success: false,
          error: 'API Hash обязателен'
        };
      }
      const cleanApiHash = String(apiHash).replace(/[\s\n\r\t\u00A0\u2000-\u200B\u2028\u2029\uFEFF]/g, '').trim();
      if (cleanApiHash.length < 20) {
        return {
          success: false,
          error: `API Hash должен быть строкой длиной не менее 20 символов (получено: ${cleanApiHash.length} после очистки)`
        };
      }
      if (!/^[a-f0-9]+$/i.test(cleanApiHash)) {
        return {
          success: false,
          error: 'API Hash должен содержать только шестнадцатеричные символы (0-9, a-f)'
        };
      }

      // Номер телефона опционален - обрабатываем только если передан
      let processedPhone = '';
      if (phoneNumber && typeof phoneNumber === 'string' && phoneNumber.trim().length > 0) {
        const tempPhone = phoneNumber.replace(/\D/g, '');
        if (tempPhone.length >= 7 && tempPhone.length <= 15 && !tempPhone.startsWith('0') && /^\d+$/.test(tempPhone)) {
          processedPhone = tempPhone;
        }
      }

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

      // apiIdNum уже определен выше
      
      // Создаем сессию и клиент с проверками
      let session;
      let client;
      
      try {
        session = new StringSession(stringSession || '');
      } catch (sessionError) {
        console.error('Ошибка создания сессии:', sessionError);
        return {
          success: false,
          error: 'Ошибка создания сессии: ' + (sessionError.message || 'Неизвестная ошибка')
        };
      }
      
      try {
        // Используем уже очищенный API Hash из валидации
        client = new TelegramClient(session, apiIdNum, cleanApiHash, {
          connectionRetries: 5,
        });
      } catch (clientError) {
        console.error('Ошибка создания клиента:', clientError);
        return {
          success: false,
          error: 'Ошибка создания клиента Telegram: ' + (clientError.message || 'Неизвестная ошибка')
        };
      }

      await client.connect();

      // Завершаем авторизацию
      try {
        // Номер телефона опционален - используем только если был передан
        const phoneForSignIn = processedPhone || '';
        
        console.log('Завершение авторизации:', {
          phone: phoneForSignIn || 'не требуется',
          codeLength: phoneCode.trim().length,
          hashLength: phoneCodeHash.trim().length
        });
        
        // gramjs signInUser принимает параметры в другом формате
        // Если номер не передан, используем пустую строку (сессия уже должна быть сохранена)
        await client.signInUser({
          phoneNumber: phoneForSignIn,
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

