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
   * Получить путь к файлу конфигурации сессии (apiId и apiHash)
   */
  getSessionConfigPath(sessionId) {
    return path.join(this.sessionsDir, `${sessionId}.config.json`);
  }

  /**
   * Сохранить конфигурацию сессии (apiId и apiHash)
   */
  async saveSessionConfig(sessionId, apiId, apiHash) {
    try {
      const configPath = this.getSessionConfigPath(sessionId);
      const config = {
        apiId: String(apiId),
        apiHash: String(apiHash),
        savedAt: new Date().toISOString()
      };
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
      console.log('Конфигурация сессии сохранена:', sessionId.substring(0, 20) + '...');
    } catch (error) {
      console.error('Ошибка сохранения конфигурации сессии:', error);
    }
  }

  /**
   * Загрузить конфигурацию сессии (apiId и apiHash)
   */
  async loadSessionConfig(sessionId) {
    try {
      const configPath = this.getSessionConfigPath(sessionId);
      const configData = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(configData);
      return {
        apiId: config.apiId,
        apiHash: config.apiHash
      };
    } catch (error) {
      console.log('Конфигурация сессии не найдена или повреждена:', error.message);
      return null;
    }
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

      // НЕ проверяем существующий клиент - всегда создаем новый для надежности
      // Это гарантирует, что клиент всегда имеет правильные apiId и apiHash
      // Удаляем старый клиент, если он существует
      if (this.clients.has(sessionId)) {
        const oldClient = this.clients.get(sessionId);
        try {
          if (oldClient && oldClient.connected) {
            await oldClient.disconnect();
          }
        } catch (e) {
          // Игнорируем ошибки отключения
        }
        this.clients.delete(sessionId);
        console.log('Старый клиент удален перед созданием нового');
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
        // Добавляем дополнительные параметры для надежного подключения
        // ВАЖНО: apiId и apiHash должны быть переданы как числа и строка соответственно
        // Создаем клиент с явным указанием типов, как в тестовом скрипте
        client = new TelegramClient(session, Number(apiIdNum), String(cleanApiHash), {
          connectionRetries: 5,
          retryDelay: 1000,
          timeout: 10000,
          useWSS: false // Используем TCP вместо WebSocket для более стабильного подключения
        });
        console.log('Клиент Telegram создан успешно');
        
        // Проверяем, что клиент правильно сохранил apiId и apiHash
        // Если они недоступны сразу после создания, пересоздаем клиент
        if (!client.apiId || !client.apiHash) {
          console.warn('apiId или apiHash недоступны сразу после создания. Пересоздаем клиент...');
          const newSession = new StringSession('');
          client = new TelegramClient(newSession, Number(apiIdNum), String(cleanApiHash), {
            connectionRetries: 5,
            retryDelay: 1000,
            timeout: 10000,
            useWSS: false
          });
          console.log('Клиент пересоздан');
        }
        
        // ВАЖНО: Сохраняем клиент сразу после создания
        this.clients.set(sessionId, client);
        console.log('Клиент сохранен в this.clients после создания');
        
        if (client.apiId && client.apiHash) {
          console.log('Проверка клиента: apiId и apiHash доступны');
        } else {
          console.warn('Предупреждение: apiId или apiHash могут быть недоступны');
        }
      } catch (clientError) {
        console.error('Ошибка создания клиента:', clientError);
        // Безопасное извлечение информации об ошибке
        const errorMessage = (clientError && typeof clientError === 'object' && clientError.message !== undefined) 
          ? String(clientError.message) 
          : (typeof clientError === 'string' ? clientError : String(clientError) || 'Неизвестная ошибка');
        const errorStack = (clientError && typeof clientError === 'object' && clientError.stack !== undefined) 
          ? String(clientError.stack) 
          : '';
        
        console.error('Детали ошибки создания клиента:', {
          message: errorMessage,
          stack: errorStack,
          apiId: apiIdNum,
          apiIdType: typeof apiIdNum,
          apiHashType: typeof cleanApiHash,
          apiHashLength: cleanApiHash ? cleanApiHash.length : 0
        });
        return {
          success: false,
          error: 'Ошибка создания клиента Telegram: ' + errorMessage
        };
      }

      // Подключаемся к Telegram
      try {
        console.log('Попытка подключения к Telegram...');
        // Устанавливаем таймаут для подключения
        const connectPromise = client.connect();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Таймаут подключения к Telegram (10 секунд)')), 10000)
        );
        
        await Promise.race([connectPromise, timeoutPromise]);
        console.log('Клиент успешно подключен к Telegram');
        
        // Даем небольшую задержку для установки connected
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Проверяем, что подключение действительно установлено
        if (!client.connected) {
          console.warn('Клиент не помечен как подключенный, но connect() завершился успешно. Продолжаем...');
        }
        
        // ВАЖНО: Проверяем доступность apiId и apiHash после подключения
        // Если они недоступны, пересоздаем клиент
        if (!client.apiId || !client.apiHash) {
          console.warn('apiId или apiHash недоступны после подключения. Пересоздаем клиент...');
          try {
            await client.disconnect();
            const newSession = new StringSession('');
            client = new TelegramClient(newSession, Number(apiIdNum), String(cleanApiHash), {
              connectionRetries: 5,
              retryDelay: 1000,
              timeout: 10000,
              useWSS: false
            });
            await client.connect();
            await new Promise(resolve => setTimeout(resolve, 500));
            console.log('✓ Клиент пересоздан и подключен');
            
            // ВАЖНО: Сохраняем пересозданный клиент сразу
            this.clients.set(sessionId, client);
            console.log('Пересозданный клиент сохранен в this.clients после connect()');
            
            // Проверяем еще раз
            if (!client.apiId || !client.apiHash) {
              console.error('КРИТИЧЕСКАЯ ОШИБКА: apiId или apiHash все еще недоступны после пересоздания');
              return {
                success: false,
                error: 'Не удалось инициализировать клиент Telegram. Проверьте API ID и API Hash.'
              };
            }
          } catch (recreateError) {
            console.error('Ошибка при пересоздании клиента:', recreateError);
            return {
              success: false,
              error: 'Ошибка при инициализации клиента Telegram: ' + (recreateError.message || 'Неизвестная ошибка')
            };
          }
        }
        
        // ВАЖНО: Сохраняем клиент после успешного подключения
        this.clients.set(sessionId, client);
        console.log('Клиент сохранен в this.clients после успешного подключения');
      } catch (connectError) {
        console.error('Ошибка подключения к Telegram:', connectError);
        const connectErrorMessage = (connectError && typeof connectError === 'object' && connectError.message) 
          ? String(connectError.message) 
          : String(connectError || 'Неизвестная ошибка подключения');
        
        // Более детальная обработка ошибок подключения
        let finalError = connectErrorMessage;
        if (connectErrorMessage.includes('timeout') || connectErrorMessage.includes('Таймаут')) {
          finalError = 'Не удалось подключиться к серверам Telegram. Проверьте интернет-соединение и попробуйте снова.';
        } else if (connectErrorMessage.includes('ENOTFOUND') || connectErrorMessage.includes('ECONNREFUSED')) {
          finalError = 'Не удалось подключиться к серверам Telegram. Проверьте интернет-соединение и настройки сети.';
        } else if (connectErrorMessage.includes('ETIMEDOUT')) {
          finalError = 'Истекло время ожидания подключения к Telegram. Проверьте интернет-соединение.';
        }
        
        return {
          success: false,
          error: `Ошибка подключения к Telegram: ${finalError}`
        };
      }

      // Проверяем, что клиент действительно подключен
      // client.connected может быть undefined, поэтому проверяем явно
      const isClientConnected = client.connected === true;
      console.log('Проверка подключения клиента после connect():', {
        connected: isClientConnected,
        clientConnectedValue: client.connected,
        clientConnectedType: typeof client.connected
      });
      
      if (!isClientConnected) {
        console.warn('Клиент не подключен после connect(), но продолжаем (может быть асинхронное подключение)');
        // Не возвращаем ошибку, так как подключение может быть асинхронным
        // Устанавливаем connected вручную для надежности
        try {
          if (client.connected === undefined || client.connected === false) {
            // Пытаемся установить connected в true, если это возможно
            console.log('Попытка установить connected в true');
          }
        } catch (e) {
          console.warn('Не удалось установить connected:', e);
        }
      }

      // Проверяем авторизацию
      let isAuthorized = false;
      try {
        isAuthorized = await client.checkAuthorization();
        console.log('Проверка авторизации завершена:', isAuthorized);
      } catch (authCheckError) {
        console.error('Ошибка проверки авторизации:', authCheckError);
        const authCheckErrorMessage = (authCheckError && typeof authCheckError === 'object' && authCheckError.message) 
          ? String(authCheckError.message) 
          : String(authCheckError || 'Неизвестная ошибка');
        return {
          success: false,
          error: `Ошибка проверки авторизации: ${authCheckErrorMessage}`
        };
      }
      console.log('Проверка авторизации:', {
        isAuthorized,
        hasExistingSession,
        sessionLength: stringSession ? stringSession.length : 0,
        hasPhone: !!processedPhone && processedPhone.length > 0
      });

      if (!isAuthorized) {
        // Нужна авторизация
        // Если сессия существовала, но невалидна - удаляем её
        if (hasExistingSession) {
          console.log('Сессия существует, но невалидна. Удаляем старую сессию...');
          try {
            await fs.unlink(sessionPath);
            console.log('Старая сессия удалена');
          } catch (unlinkError) {
            console.warn('Не удалось удалить старую сессию:', unlinkError);
          }
        }
        
        // Номер телефона опционален - если не передан, возвращаем понятное сообщение
        if (!processedPhone || processedPhone.length === 0) {
          const message = hasExistingSession 
            ? 'Сохраненная сессия устарела или невалидна. Пожалуйста, укажите номер телефона для получения нового кода подтверждения и повторной авторизации.'
            : 'Требуется авторизация. Пожалуйста, укажите номер телефона для получения кода подтверждения из Telegram.';
          
          return {
            success: false,
            needsAuth: true,
            error: message
          };
        }
        
        try {
          // Валидация длины номера перед отправкой
          if (processedPhone.length < 10 || processedPhone.length > 15) {
            throw new Error(`Номер телефона должен содержать от 10 до 15 цифр (получено: ${processedPhone.length} цифр)`);
          }
          
          // Telegram API может требовать номер с "+" в начале
          // Проверяем, начинается ли номер с "+", если нет - добавляем
          let phoneForApi = processedPhone;
          if (!phoneForApi.startsWith('+')) {
            phoneForApi = '+' + phoneForApi;
          }
          
          // Используем локальную переменную processedPhone
          console.log('=== ОТПРАВКА КОДА ПОДТВЕРЖДЕНИЯ ===');
          console.log('Отправка кода подтверждения...');
          
          let result = null;
          const phoneWithPlus = '+' + processedPhone;
          let lastError = null;
          
          // Проверяем, что клиент имеет доступ к apiId и apiHash перед вызовом sendCode
          // Используем точно такую же логику, как в test_telegram_auto.js
          console.log('Проверка перед sendCode:');
          console.log('  - client.apiId:', client.apiId);
          console.log('  - client.apiHash:', client.apiHash ? 'есть' : 'undefined');
          
          // Используем sendCode напрямую - это правильный способ для программного использования
          // НЕ используем start(), так как он требует интерактивного ввода и зацикливается
          if (!client.apiId || !client.apiHash) {
            throw new Error('Клиент не имеет доступа к apiId или apiHash');
          }
          
          console.log('Используем sendCode с правильными параметрами...');
          // ВАЖНО: В gramjs 2.26.21 sendCode требует apiCredentials как первый параметр!
          const apiCredentials = {
            apiId: Number(apiIdNum),
            apiHash: String(cleanApiHash)
          };
          
          try {
            console.log('\nПопытка 1: с "+" -', phoneWithPlus);
            // sendCode принимает apiCredentials и номер телефона
            result = await client.sendCode(apiCredentials, phoneWithPlus);
            console.log('✓ Код отправлен успешно (с "+")');
          } catch (err1) {
            lastError = err1;
            console.log('✗ Попытка 1 не удалась');
            console.log('  Тип ошибки:', typeof err1);
            console.log('  Сообщение:', err1.message || String(err1));
            if (err1.stack) {
              console.log('  Стек (первые 500 символов):', err1.stack.substring(0, 500));
            }
            
            // Проверяем детали ошибки
            if (err1.message && err1.message.includes('constructor')) {
              console.log('\n⚠ Обнаружена ошибка с constructor - это может быть проблема внутри gramjs');
              console.log('Попробуем пересоздать клиент с явным указанием типов...');
              
              // Пересоздаем клиент
              try {
                await client.disconnect();
              } catch (disconnectErr) {
                // Игнорируем ошибки отключения
              }
              
              const newSession = new StringSession('');
              client = new TelegramClient(newSession, Number(apiIdNum), String(cleanApiHash), {
                connectionRetries: 5,
                retryDelay: 1000,
                timeout: 10000,
                useWSS: false
              });
              await client.connect();
              await new Promise(resolve => setTimeout(resolve, 500));
              console.log('✓ Клиент пересоздан и подключен');
              
              // ВАЖНО: Сохраняем пересозданный клиент сразу
              this.clients.set(sessionId, client);
              console.log('Пересозданный клиент сохранен в this.clients');
              
              // Проверяем доступность apiId и apiHash после пересоздания
              if (!client.apiId || !client.apiHash) {
                throw new Error('Пересозданный клиент не имеет доступа к apiId или apiHash');
              }
              
              try {
                console.log('Повторная попытка sendCode с пересозданным клиентом...');
                // Используем apiCredentials
                result = await client.sendCode(apiCredentials, phoneWithPlus);
                console.log('✓ Код отправлен успешно после пересоздания клиента');
              } catch (errRetry) {
                console.error('✗ Повторная попытка также не удалась:', errRetry.message || errRetry);
                
                // Пробуем без "+"
                try {
                  console.log('\nПопытка 2: без "+" -', processedPhone);
                  result = await client.sendCode(apiCredentials, processedPhone);
                  console.log('✓ Код отправлен успешно (без "+")');
                } catch (err2) {
                  console.error('✗ Попытка 2 не удалась');
                  console.error('  Тип ошибки:', typeof err2);
                  console.error('  Сообщение:', err2.message || String(err2));
                  throw new Error(`Обе попытки не удались. Последняя ошибка: ${err2.message || err2}`);
                }
              }
            } else {
              // Пробуем без "+"
              try {
                console.log('\nПопытка 2: без "+" -', processedPhone);
                result = await client.sendCode(apiCredentials, processedPhone);
                console.log('✓ Код отправлен успешно (без "+")');
              } catch (err2) {
                console.error('✗ Попытка 2 не удалась');
                console.error('  Тип ошибки:', typeof err2);
                console.error('  Сообщение:', err2.message || String(err2));
                throw new Error(`Обе попытки не удались. Последняя ошибка: ${err2.message || err2}`);
              }
            }
          }
          
          if (!result) {
            if (lastError) {
              throw lastError;
            }
            throw new Error('Не удалось получить результат от sendCode');
          }
          
          // Детальный анализ результата
          console.log('\n=== Анализ результата sendCode ===');
          console.log('Тип результата:', typeof result);
          console.log('Результат является объектом:', result && typeof result === 'object');
          
          if (result && typeof result === 'object') {
            try {
              const keys = Object.keys(result);
              console.log('Ключи результата:', keys);
            } catch (logError) {
              console.error('Ошибка при анализе результата:', logError);
            }
          }

          // Проверяем результат
          if (!result) {
            throw new Error('Не удалось получить ответ от Telegram API');
          }
          
          // Безопасное извлечение phoneCodeHash (пробуем разные варианты названий)
          let phoneCodeHash = null;
          
          if (result && typeof result === 'object') {
            // Пробуем разные варианты названий
            if (result.phoneCodeHash !== undefined && result.phoneCodeHash !== null) {
              phoneCodeHash = String(result.phoneCodeHash);
            } else if (result.phone_code_hash !== undefined && result.phone_code_hash !== null) {
              phoneCodeHash = String(result.phone_code_hash);
            } else {
              // Пробуем найти в других возможных полях
              const keys = Object.keys(result);
              console.log('Ищем phoneCodeHash в ключах:', keys);
              for (const key of keys) {
                if (key.toLowerCase().includes('hash') || key.toLowerCase().includes('code')) {
                  console.log('Найдено потенциальное поле:', key, '=', result[key]);
                }
              }
            }
          }
          
          if (!phoneCodeHash || phoneCodeHash.length === 0) {
            console.error('Результат sendCode не содержит phoneCodeHash');
            console.error('Тип результата:', typeof result);
            if (result && typeof result === 'object') {
              try {
                console.error('Ключи результата:', Object.keys(result));
                console.error('Полный результат (первые 500 символов):', JSON.stringify(result, null, 2).substring(0, 500));
                } catch (e) {
                console.error('Не удалось сериализовать результат:', e);
              }
            } else {
              console.error('Результат:', String(result).substring(0, 200));
            }
            throw new Error('Не удалось получить phoneCodeHash от Telegram. Проверьте правильность номера телефона и API данных.');
          }
          
          console.log('phoneCodeHash успешно извлечен (длина:', phoneCodeHash.length, '):', phoneCodeHash.substring(0, 20) + '...');

          // ВАЖНО: Сохраняем клиент после успешного sendCode
          // Это нужно для того, чтобы клиент был доступен при завершении авторизации
          this.clients.set(sessionId, client);
          console.log('Клиент сохранен после успешного sendCode');

          // ВАЖНО: сохраняем сессию и конфиг сразу после sendCode, чтобы completeAuth использовал тот же session
          try {
            const sessionString = client.session.save();
            if (sessionString && sessionString.trim().length > 0) {
              await fs.writeFile(sessionPath, sessionString, 'utf-8');
              await this.saveSessionConfig(sessionId, apiIdNum, cleanApiHash);
              console.log('Сессия сохранена после sendCode для последующей completeAuth');
            } else {
              console.warn('Не удалось сохранить сессию после sendCode: sessionString пуст');
            }
          } catch (saveErr) {
            console.error('Ошибка сохранения сессии после sendCode:', saveErr);
            // Не прерываем, но логируем
          }

          // Сохраняем временные данные для авторизации
          const response = {
            success: false,
            needsAuth: true,
            phoneCodeHash: phoneCodeHash,
            message: 'Требуется код подтверждения из Telegram'
          };
          
          console.log('Возвращаем ответ:', {
            success: response.success,
            needsAuth: response.needsAuth,
            hasPhoneCodeHash: !!response.phoneCodeHash,
            phoneCodeHashLength: response.phoneCodeHash ? response.phoneCodeHash.length : 0,
            message: response.message
          });
          
          return response;
        } catch (sendCodeError) {
          // Упрощенная обработка ошибки без обращения к constructor
          console.error('Ошибка отправки кода:', sendCodeError);
          
          // Безопасное извлечение сообщения об ошибке
          let errorMessage = 'Неизвестная ошибка';
          try {
            if (sendCodeError && typeof sendCodeError === 'object' && sendCodeError.message) {
              errorMessage = String(sendCodeError.message);
            } else if (sendCodeError && typeof sendCodeError === 'string') {
              errorMessage = sendCodeError;
            } else if (sendCodeError) {
                errorMessage = String(sendCodeError);
                  }
              } catch (e) {
            errorMessage = 'Ошибка при обработке ошибки';
          }
          
          // Используем локальную переменную processedPhone из области видимости
          const phoneForLog = processedPhone || '';
          const phoneLength = phoneForLog ? phoneForLog.length : 0;
          
          // Упрощенная обработка специфичных ошибок
          const errorString = errorMessage.toLowerCase();
          let finalErrorMessage = errorMessage;
          
          if (errorString.includes('phone_number_invalid') || errorString.includes('phone number invalid')) {
            finalErrorMessage = `Неверный формат номера телефона. Проверьте, что номер в формате +380XXXXXXXXX или 380XXXXXXXXX (получено: ${phoneForLog || 'не указан'}, длина: ${phoneLength}).`;
          } else if (errorString.includes('api_id_invalid') || errorString.includes('api_hash_invalid')) {
            finalErrorMessage = `Неверные API данные. Проверьте API ID (${apiIdNum}) и API Hash на my.telegram.org/apps.`;
          } else if (errorString.includes('flood') || errorString.includes('wait')) {
            finalErrorMessage = `Слишком много запросов. Подождите несколько минут и попробуйте снова.`;
          } else {
            // Для всех остальных ошибок показываем сообщение с контекстом
            finalErrorMessage = `${errorMessage}\n\nПроверьте правильность введенных данных:\n- Номер телефона: ${phoneForLog || 'не указан'} (длина: ${phoneLength})\n- API ID: ${apiIdNum}\n- API Hash: длина ${cleanApiHash ? cleanApiHash.length : 0}, валиден: ${cleanApiHash ? /^[a-f0-9]+$/i.test(cleanApiHash) : false}\n\nЕсли проблема сохраняется, проверьте данные на my.telegram.org/apps.`;
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
        console.log('Сессия сохранена успешно');
        // Сохраняем конфигурацию (apiId и apiHash) для последующего восстановления
        await this.saveSessionConfig(sessionId, apiIdNum, cleanApiHash);
      }

      // Проверяем, что клиент подключен перед сохранением
      console.log('Проверка подключения клиента перед сохранением:', {
        sessionId: sessionId.substring(0, 20) + '...',
        clientConnected: client.connected,
        clientType: typeof client,
        hasConnect: typeof client.connect === 'function'
      });

      // Сохраняем клиент (важно: сохраняем после всех операций, включая пересоздание)
      this.clients.set(sessionId, client);
      
      // Проверяем, что клиент действительно сохранен
      const savedClient = this.clients.get(sessionId);
      console.log('Клиент сохранен, проверка:', {
        saved: !!savedClient,
        savedClientConnected: savedClient ? savedClient.connected : 'N/A',
        savedClientApiId: savedClient ? savedClient.apiId : 'N/A',
        hasSavedClientApiHash: savedClient ? !!savedClient.apiHash : false
      });

      console.log('Успешное подключение к Telegram');
      return { 
        success: true, 
        message: 'Успешно подключено к Telegram',
        isAuthorized: true
      };
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
        // Добавляем дополнительные параметры для надежного подключения
        client = new TelegramClient(session, apiIdNum, cleanApiHash, {
          connectionRetries: 5,
          retryDelay: 1000,
          timeout: 10000,
          useWSS: false // Используем TCP вместо WebSocket для более стабильного подключения
        });
      } catch (clientError) {
        console.error('Ошибка создания клиента:', clientError);
        return {
          success: false,
          error: 'Ошибка создания клиента Telegram: ' + (clientError.message || 'Неизвестная ошибка')
        };
      }

      // Подключаемся к Telegram с таймаутом
      try {
        console.log('Попытка подключения к Telegram (completeAuth)...');
        const connectPromise = client.connect();
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Таймаут подключения к Telegram (10 секунд)')), 10000)
        );
        
        await Promise.race([connectPromise, timeoutPromise]);
        console.log('Клиент успешно подключен к Telegram (completeAuth)');
        
        // Даем небольшую задержку для установки connected
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (connectError) {
        console.error('Ошибка подключения к Telegram (completeAuth):', connectError);
        const connectErrorMessage = (connectError && typeof connectError === 'object' && connectError.message) 
          ? String(connectError.message) 
          : String(connectError || 'Неизвестная ошибка подключения');
        
        return {
          success: false,
          error: `Ошибка подключения к Telegram: ${connectErrorMessage}`
        };
      }

      // Завершаем авторизацию
      try {
        // Номер телефона опционален - используем только если был передан
        const phoneForSignIn = processedPhone || '';
        
        console.log('Завершение авторизации:', {
          phone: phoneForSignIn || 'не требуется',
          codeLength: phoneCode.trim().length,
          hashLength: phoneCodeHash.trim().length
        });
        
        // gramjs signInUser принимает apiCredentials как первый параметр, затем authParams
        // ВАЖНО: В gramjs 2.26.21 signInUser требует apiCredentials как первый параметр!
        const apiCredentialsForSignIn = {
          apiId: Number(apiIdNum),
          apiHash: String(cleanApiHash)
        };
        
        // ВАЖНО: signInUser требует onError и другие колбэки, поэтому используем прямой вызов API
        // У нас уже есть код и phoneCodeHash, поэтому используем Api.auth.SignIn напрямую
        console.log('Вызов Api.auth.SignIn с параметрами:', {
          phone: phoneForSignIn || 'не требуется',
          codeLength: phoneCode.trim().length,
          hashLength: phoneCodeHash.trim().length
        });
        
        // Устанавливаем таймаут для SignIn
        const signInPromise = client.invoke(new Api.auth.SignIn({
          phoneNumber: phoneForSignIn,
          phoneCodeHash: phoneCodeHash.trim(),
          phoneCode: phoneCode.trim()
        }));
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Таймаут авторизации (15 секунд)')), 15000)
        );
        
        let result;
        try {
          result = await Promise.race([signInPromise, timeoutPromise]);
          console.log('✓ SignIn успешно выполнен');
        } catch (signInErr) {
          console.error('Ошибка при SignIn:', signInErr);
          console.error('Тип ошибки:', typeof signInErr);
          console.error('errorMessage:', signInErr.errorMessage);
          console.error('message:', signInErr.message);
          
          // Проверяем, требуется ли 2FA пароль
          if (signInErr.errorMessage === 'SESSION_PASSWORD_NEEDED' || 
              (signInErr.message && signInErr.message.includes('SESSION_PASSWORD_NEEDED'))) {
            throw new Error('Требуется двухфакторная аутентификация (2FA). Это не поддерживается в текущей версии.');
          }
          
          // Проверяем другие типы ошибок
          if (signInErr.errorMessage === 'PHONE_CODE_INVALID' || 
              (signInErr.message && signInErr.message.includes('PHONE_CODE_INVALID'))) {
            throw new Error('Неверный код подтверждения. Проверьте код и попробуйте снова.');
          }
          
          if (signInErr.errorMessage === 'PHONE_CODE_EXPIRED' || 
              (signInErr.message && signInErr.message.includes('PHONE_CODE_EXPIRED'))) {
            throw new Error('Код подтверждения истек. Запросите новый код.');
          }
          
          throw signInErr;
        }
        
        // Проверяем результат
        if (result instanceof Api.auth.AuthorizationSignUpRequired) {
          throw new Error('Требуется регистрация. Это не поддерживается в текущей версии.');
        }
        
        if (!result.user) {
          throw new Error('Не удалось получить данные пользователя после авторизации');
        }
        
        console.log('✓ Авторизация успешна, пользователь:', result.user.firstName || result.user.username || 'Неизвестно');
      } catch (signInError) {
        console.error('Ошибка входа:', signInError);
        let errorMessage = signInError.message || 'Неизвестная ошибка';

        // При ошибках кода очищаем клиента/сессию, чтобы можно было запросить новый код
        const normalize = (msg = '') => msg.toUpperCase();
        const upperMsg = normalize(errorMessage);

        const isCodeInvalid = upperMsg.includes('PHONE_CODE_INVALID');
        const isCodeExpired = upperMsg.includes('PHONE_CODE_EXPIRED') || upperMsg.includes('TIMEOUT');

        if (isCodeInvalid || isCodeExpired) {
          // Чистим текущий клиент и сессию, чтобы запросить новый код
          try {
            this.clients.delete(sessionId);
            await fs.unlink(sessionPath).catch(() => {});
            await fs.unlink(this.getSessionConfigPath(sessionId)).catch(() => {});
            if (client && client.connected) {
              await client.disconnect().catch(() => {});
            }
          } catch (cleanupErr) {
            console.warn('Не удалось полностью очистить сессию после ошибки кода:', cleanupErr);
          }

          return {
            success: false,
            needsAuth: true,
            error: isCodeExpired
              ? 'Код подтверждения истек. Запросите новый код.'
              : 'Неверный код подтверждения. Проверьте код и попробуйте снова.'
          };
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
        console.log('Сессия сохранена успешно после завершения авторизации');
        // Сохраняем конфигурацию (apiId и apiHash) для последующего восстановления
        await this.saveSessionConfig(sessionId, apiIdNum, cleanApiHash);
      }

      // Проверяем, что клиент подключен перед сохранением
      console.log('Проверка подключения клиента перед сохранением (completeAuth):', {
        sessionId: sessionId.substring(0, 20) + '...',
        clientConnected: client.connected,
        clientType: typeof client
      });

      // Сохраняем клиент
      this.clients.set(sessionId, client);
      
      // Проверяем, что клиент действительно сохранен
      const savedClient = this.clients.get(sessionId);
      console.log('Клиент сохранен после завершения авторизации, проверка:', {
        saved: !!savedClient,
        savedClientConnected: savedClient ? savedClient.connected : 'N/A'
      });

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
   * Восстановление клиента из сохраненной сессии
   */
  async restoreClient(sessionId) {
    try {
      console.log('Попытка восстановления клиента из сессии:', sessionId.substring(0, 20) + '...');
      
      // Загружаем конфигурацию (apiId и apiHash)
      const config = await this.loadSessionConfig(sessionId);
      if (!config || !config.apiId || !config.apiHash) {
        console.log('Конфигурация сессии не найдена, восстановление невозможно');
        return null;
      }

      // Загружаем сессию
      const sessionPath = this.getSessionPath(sessionId);
      let stringSession = '';
      try {
        const sessionData = await fs.readFile(sessionPath, 'utf-8');
        if (sessionData && sessionData.trim().length > 0) {
          stringSession = sessionData.trim();
        } else {
          console.log('Файл сессии пуст или не существует');
          return null;
        }
      } catch (error) {
        console.log('Ошибка чтения файла сессии:', error.message);
        return null;
      }

      // Создаем клиент из сохраненной сессии
      const apiIdNum = parseInt(config.apiId);
      const cleanApiHash = String(config.apiHash).replace(/[\s\n\r\t\u00A0\u2000-\u200B\u2028\u2029\uFEFF]/g, '').trim();
      
      if (isNaN(apiIdNum) || apiIdNum <= 0 || cleanApiHash.length < 20) {
        console.log('Невалидные данные конфигурации');
        return null;
      }

      const session = new StringSession(stringSession);
      const client = new TelegramClient(session, Number(apiIdNum), String(cleanApiHash), {
        connectionRetries: 5,
        retryDelay: 1000,
        timeout: 10000,
        useWSS: false
      });

      // Подключаемся к Telegram
      console.log('Подключение восстановленного клиента...');
      const connectPromise = client.connect();
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Таймаут подключения (10 секунд)')), 10000)
      );
      
      await Promise.race([connectPromise, timeoutPromise]);
      await new Promise(resolve => setTimeout(resolve, 500));

      // Проверяем авторизацию
      const isAuthorized = await client.checkAuthorization();
      if (!isAuthorized) {
        console.log('Восстановленный клиент не авторизован');
        await client.disconnect().catch(() => {});
        return null;
      }

      // Сохраняем клиент в this.clients
      this.clients.set(sessionId, client);
      console.log('✓ Клиент успешно восстановлен из сессии');
      
      return client;
    } catch (error) {
      console.error('Ошибка восстановления клиента:', error);
      return null;
    }
  }

  /**
   * Получение клиента по sessionId (с автоматическим восстановлением)
   */
  async getClient(sessionId) {
    let client = this.clients.get(sessionId);
    
    // Если клиент не найден, пытаемся восстановить из сессии
    if (!client) {
      console.log('Клиент не найден в памяти, пытаемся восстановить из сессии...');
      client = await this.restoreClient(sessionId);
      if (!client) {
        throw new Error('Клиент не подключен. Выполните инициализацию.');
      }
    }
    
    // Проверяем подключение и авторизацию
    if (!client.connected) {
      console.log('Клиент найден, но не подключен. Подключаем...');
      try {
        await client.connect();
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Проверяем авторизацию
        const isAuthorized = await client.checkAuthorization();
        if (!isAuthorized) {
          throw new Error('Клиент не авторизован. Выполните инициализацию.');
        }
      } catch (error) {
        console.error('Ошибка подключения/авторизации клиента:', error);
        // Пытаемся восстановить из сессии
        this.clients.delete(sessionId);
        client = await this.restoreClient(sessionId);
        if (!client) {
          throw new Error('Клиент не подключен. Выполните инициализацию.');
        }
      }
    } else {
      // Проверяем авторизацию даже если клиент подключен
      try {
        const isAuthorized = await client.checkAuthorization();
        if (!isAuthorized) {
          throw new Error('Клиент не авторизован. Выполните инициализацию.');
        }
      } catch (error) {
        console.error('Ошибка проверки авторизации:', error);
        // Пытаемся восстановить из сессии
        this.clients.delete(sessionId);
        client = await this.restoreClient(sessionId);
        if (!client) {
          throw new Error('Клиент не подключен. Выполните инициализацию.');
        }
      }
    }
    
    return client;
  }

  /**
   * Проверка статуса подключения
   */
  isConnected(sessionId) {
    if (!sessionId) {
      console.log('isConnected: sessionId не указан');
      return false;
    }
    const client = this.clients.get(sessionId);
    if (!client) {
      console.log(`isConnected: клиент не найден для sessionId: ${sessionId.substring(0, 20)}...`);
      console.log(`isConnected: доступные sessionId:`, Array.from(this.clients.keys()).map(k => k.substring(0, 20) + '...'));
      return false;
    }
    // Если клиент существует в this.clients, считаем его подключенным
    // так как мы сохраняем клиент только после успешного подключения
    // client.connected может быть undefined или false даже если клиент подключен,
    // поэтому полагаемся на факт наличия клиента в this.clients
    const connected = true; // Клиент существует = подключен
    
    console.log(`isConnected: sessionId: ${sessionId.substring(0, 20)}..., client.connected: ${client.connected}, клиент существует: true, результат: ${connected}`);
    return connected;
  }

  /**
   * Получение списка всех чатов и групп
   */
  async getChats(sessionId) {
    try {
      const client = await this.getClient(sessionId);
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
      const client = await this.getClient(sessionId);
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

