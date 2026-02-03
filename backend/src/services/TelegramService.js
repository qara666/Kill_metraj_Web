/**
 * Сервис для работы с Telegram API через gramjs
 * Парсинг сообщений из групп и чатов
 */

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { Api } = require('telegram/tl');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');

class TelegramService {
  async handleIncomingMessage(message) {
    try {
      logger.debug('Обработка входящего сообщения Telegram', { messageId: message?.id });
    } catch (error) {
      logger.error('Ошибка обработки сообщения Telegram', { error: error.message, stack: error.stack });
    }
  }

  logAction(action, details) {
    logger.info(`Telegram action: ${action}`, details);
  }
  constructor() {
    this.clients = new Map(); // Храним клиенты по sessionId
    this.sessionsDir = path.join(__dirname, '../../sessions');
    this.ensureSessionsDir();
  }

  async ensureSessionsDir() {
    try {
      await fs.mkdir(this.sessionsDir, { recursive: true });
    } catch (error) {
      logger.error('Ошибка создания директории sessions', { error: error.message });
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
      logger.debug('Конфигурация сессии сохранена', { sessionId: sessionId.substring(0, 20) + '...' });
    } catch (error) {
      logger.error('Ошибка сохранения конфигурации сессии', { error: error.message });
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
      logger.debug('Конфигурация сессии не найдена или повреждена', { error: error.message });
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
        logger.debug('Старый клиент удален перед созданием нового');
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
      logger.debug('Инициализация Telegram', {
        apiId: apiIdNum,
        hasExistingSession: hasExistingSession,
        sessionExists: !!stringSession,
        sessionLength: stringSession ? stringSession.length : 0
      });

      // Создаем сессию и клиент с проверками
      let session;
      let client;

      try {
        // Используем stringSession, который был определен выше
        // Если сессия пустая, создаем новую пустую сессию
        if (!stringSession || stringSession.trim().length === 0) {
          logger.debug('Создаем новую пустую сессию');
          stringSession = '';
        }
        session = new StringSession(stringSession);
        logger.debug('Сессия создана успешно');
      } catch (sessionError) {
        logger.error('Ошибка создания сессии', { error: sessionError.message });
        return {
          success: false,
          error: 'Ошибка создания сессии: ' + (sessionError.message || 'Неизвестная ошибка')
        };
      }

      try {
        // Создаем клиент с явным указанием типов
        client = new TelegramClient(session, apiIdNum, cleanApiHash, {
          connectionRetries: 5,
          retryDelay: 1000,
          timeout: 10000,
          useWSS: false
        });
        logger.debug('Клиент Telegram создан успешно');

        // Проверяем, что клиент правильно сохранил apiId и apiHash
        // Если они недоступны сразу после создания, пересоздаем клиент
        if (!client.apiId || !client.apiHash) {
          logger.warn('apiId или apiHash недоступны сразу после создания. Пересоздаем клиент...');
          const newSession = new StringSession('');
          client = new TelegramClient(newSession, Number(apiIdNum), String(cleanApiHash), {
            connectionRetries: 5,
            retryDelay: 1000,
            timeout: 10000,
            useWSS: false
          });
          logger.debug('Клиент пересоздан');
        }

        // ВАЖНО: Сохраняем клиент сразу после создания
        this.clients.set(sessionId, client);
        logger.debug('Клиент сохранен в this.clients после создания');

        if (client.apiId && client.apiHash) {
          logger.debug('Проверка клиента: apiId и apiHash доступны');
        } else {
          logger.warn('Предупреждение: apiId или apiHash могут быть недоступны');
        }
      } catch (clientError) {
        logger.error('Ошибка создания клиента', { error: clientError.message });
        return {
          success: false,
          error: 'Ошибка создания клиента Telegram: ' + (clientError.message || 'Неизвестная ошибка')
        };
      }

      // Подключаемся к Telegram
      try {
        logger.debug('Попытка подключения к Telegram...');
        const connectPromise = client.connect();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Таймаут подключения к Telegram (10 секунд)')), 10000)
        );

        await Promise.race([connectPromise, timeoutPromise]);
        logger.info('Клиент успешно подключен к Telegram');

        await new Promise(resolve => setTimeout(resolve, 500));

        // ВАЖНО: Проверяем доступность apiId и apiHash после подключения
        if (!client.apiId || !client.apiHash) {
          logger.warn('apiId или apiHash недоступны после подключения. Пересоздаем клиент...');
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
            logger.info('Клиент пересоздан и подключен');

            this.clients.set(sessionId, client);

            if (!client.apiId || !client.apiHash) {
              logger.error('КРИТИЧЕСКАЯ ОШИБКА: apiId или apiHash все еще недоступны после пересоздания');
              return {
                success: false,
                error: 'Не удалось инициализировать клиент Telegram. Проверьте API ID и API Hash.'
              };
            }
          } catch (recreateError) {
            logger.error('Ошибка при пересоздании клиента', { error: recreateError.message });
            return {
              success: false,
              error: 'Ошибка при инициализации клиента Telegram: ' + (recreateError.message || 'Неизвестная ошибка')
            };
          }
        }

        this.clients.set(sessionId, client);
      } catch (connectError) {
        logger.error('Ошибка подключения к Telegram', { error: connectError.message });
        return {
          success: false,
          error: `Ошибка подключения к Telegram: ${connectError.message || 'Неизвестная ошибка'}`
        };
      }

      // Проверяем, что клиент действительно подключен
      // client.connected может быть undefined, поэтому проверяем явно
      const isClientConnected = client.connected === true;
      logger.debug('Проверка подключения клиента после connect()', {
        connected: isClientConnected,
        clientConnectedValue: client.connected,
        clientConnectedType: typeof client.connected
      });

      if (!isClientConnected) {
        logger.warn('Клиент не подключен после connect(), но продолжаем (может быть асинхронное подключение)');
        // Не возвращаем ошибку, так как подключение может быть асинхронным
        // Устанавливаем connected вручную для надежности
        try {
          if (client.connected === undefined || client.connected === false) {
            // Пытаемся установить connected в true, если это возможно
            logger.debug('Попытка установить connected в true');
          }
        } catch (e) {
          logger.warn('Не удалось установить connected', { error: e.message });
        }
      }

      // Проверяем авторизацию
      let isAuthorized = false;
      try {
        isAuthorized = await client.checkAuthorization();
        logger.debug('Проверка авторизации завершена', { isAuthorized });
      } catch (authCheckError) {
        logger.error('Ошибка проверки авторизации', { error: authCheckError.message });
        return {
          success: false,
          error: `Ошибка проверки авторизации: ${authCheckError.message}`
        };
      }

      if (!isAuthorized) {
        // Нужна авторизация
        // Если сессия существовала, но невалидна - удаляем её
        if (hasExistingSession) {
          logger.info('Сессия существует, но невалидна. Удаляем старую сессию...');
          try {
            await fs.unlink(sessionPath);
            logger.debug('Старая сессия удалена');
          } catch (unlinkError) {
            logger.warn('Не удалось удалить старую сессию', { error: unlinkError.message });
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
          logger.info('Отправка кода подтверждения...');

          let result = null;
          const phoneWithPlus = '+' + processedPhone;
          let lastError = null;

          // Проверяем, что клиент имеет доступ к apiId и apiHash перед вызовом sendCode
          if (!client.apiId || !client.apiHash) {
            throw new Error('Клиент не имеет доступа к apiId или apiHash');
          }

          const apiCredentials = {
            apiId: Number(apiIdNum),
            apiHash: String(cleanApiHash)
          };

          try {
            logger.debug('Попытка 1: отправка кода с "+"', { phoneNumber: phoneWithPlus });
            result = await client.sendCode(apiCredentials, phoneWithPlus);
            logger.info('Код отправлен успешно (с "+")');
          } catch (err1) {
            lastError = err1;
            logger.warn('Попытка 1 не удалась', { error: err1.message });

            // Проверяем детали ошибки
            if (err1.message && err1.message.includes('constructor')) {
              logger.warn('Обнаружена проблема с конструктором в gramjs, пересоздаем клиент...');

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
              logger.info('Клиент пересоздан и подключен');

              this.clients.set(sessionId, client);

              if (!client.apiId || !client.apiHash) {
                throw new Error('Пересозданный клиент не имеет доступа к apiId или apiHash');
              }

              try {
                logger.debug('Повторная попытка sendCode с пересозданным клиентом...');
                result = await client.sendCode(apiCredentials, phoneWithPlus);
                logger.info('Код отправлен успешно после пересоздания клиента');
              } catch (errRetry) {
                logger.error('Повторная попытка также не удалась', { error: errRetry.message });

                // Пробуем без "+"
                try {
                  logger.debug('Попытка 2: отправка кода без "+"', { phoneNumber: processedPhone });
                  result = await client.sendCode(apiCredentials, processedPhone);
                  logger.info('Код отправлен успешно (без "+")');
                } catch (err2) {
                  logger.error('Попытка 2 не удалась', { error: err2.message });
                  throw new Error(`Обе попытки не удались. Последняя ошибка: ${err2.message || err2}`);
                }
              }
            } else {
              // Пробуем без "+"
              try {
                logger.debug('Попытка 2: отправка кода без "+"', { phoneNumber: processedPhone });
                result = await client.sendCode(apiCredentials, processedPhone);
                logger.info('Код отправлен успешно (без "+")');
              } catch (err2) {
                logger.error('Попытка 2 не удалась', { error: err2.message });
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
          logger.debug('Анализ результата sendCode', {
            type: typeof result,
            isObject: result && typeof result === 'object',
            keys: (result && typeof result === 'object') ? Object.keys(result) : []
          });

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
              logger.debug('Поиск phoneCodeHash в ключах', { keys });
            }
          }

          if (!phoneCodeHash || phoneCodeHash.length === 0) {
            logger.error('Результат sendCode не содержит phoneCodeHash', {
              type: typeof result,
              keys: result && typeof result === 'object' ? Object.keys(result) : [],
              resultSnippet: String(result).substring(0, 200)
            });
            throw new Error('Не удалось получить phoneCodeHash от Telegram. Проверьте правильность номера телефона и API данных.');
          }

          logger.debug('Клиент сохранен после успешного sendCode');

          // ВАЖНО: сохраняем сессию и конфиг сразу после sendCode, чтобы completeAuth использовал тот же session
          try {
            const sessionString = client.session.save();
            if (sessionString && sessionString.trim().length > 0) {
              await fs.writeFile(sessionPath, sessionString, 'utf-8');
              await this.saveSessionConfig(sessionId, apiIdNum, cleanApiHash);
              logger.debug('Сессия сохранена после sendCode для последующей completeAuth');
            } else {
              logger.warn('Не удалось сохранить сессию после sendCode: sessionString пуст');
            }
          } catch (saveErr) {
            logger.error('Ошибка сохранения сессии после sendCode', { error: saveErr.message });
            // Не прерываем, но логируем
          }

          // Сохраняем временные данные для авторизации
          const response = {
            success: false,
            needsAuth: true,
            phoneCodeHash: phoneCodeHash,
            message: 'Требуется код подтверждения из Telegram'
          };

          logger.debug('Возвращаем ответ', {
            success: response.success,
            needsAuth: response.needsAuth,
            hasPhoneCodeHash: !!response.phoneCodeHash,
            phoneCodeHashLength: response.phoneCodeHash ? response.phoneCodeHash.length : 0,
            message: response.message
          });

          return response;
        } catch (sendCodeError) {
          // Упрощенная обработка ошибки без обращения к constructor
          logger.error('Ошибка отправки кода', { error: sendCodeError.message });

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
        logger.debug('Сессия сохранена успешно');
        await this.saveSessionConfig(sessionId, apiIdNum, cleanApiHash);
      }

      this.clients.set(sessionId, client);

      logger.info('Успешное подключение к Telegram');
      return {
        success: true,
        message: 'Успешно подключено к Telegram',
        isAuthorized: true
      };
    } catch (error) {
      logger.error('Ошибка инициализации Telegram', { error: error.message });

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
  /**
   * Завершение авторизации с кодом
   */
  async completeAuth(sessionId, apiId, apiHash, phoneNumber, phoneCode, phoneCodeHash) {
    try {
      // Валидация API данных
      if (!apiId) {
        return { success: false, error: 'API ID обязателен' };
      }
      const apiIdStr = String(apiId).trim();
      const apiIdNum = parseInt(apiIdStr);
      if (isNaN(apiIdNum) || apiIdNum <= 0) {
        return { success: false, error: `API ID должен быть положительным числом (получено: ${apiIdStr})` };
      }

      // Валидация API Hash
      if (!apiHash) {
        return { success: false, error: 'API Hash обязателен' };
      }
      const cleanApiHash = String(apiHash).replace(/[\s\n\r\t\u00A0\u2000-\u200B\u2028\u2029\uFEFF]/g, '').trim();
      if (cleanApiHash.length < 20 || !/^[a-f0-9]+$/i.test(cleanApiHash)) {
        return { success: false, error: 'Неверный формат API Hash. Ожидается шестнадцатеричная строка длиной не менее 20 символов.' };
      }

      // Номер телефона опционален
      let processedPhone = '';
      if (phoneNumber && typeof phoneNumber === 'string' && phoneNumber.trim().length > 0) {
        const tempPhone = phoneNumber.replace(/\D/g, '');
        if (tempPhone.length >= 7 && tempPhone.length <= 15 && !tempPhone.startsWith('0') && /^\d+$/.test(tempPhone)) {
          processedPhone = tempPhone;
        }
      }

      // Валидация кода
      if (!phoneCode || typeof phoneCode !== 'string' || phoneCode.length < 4) {
        return { success: false, error: 'Код подтверждения должен содержать не менее 4 символов' };
      }

      // Валидация phoneCodeHash
      if (!phoneCodeHash || typeof phoneCodeHash !== 'string') {
        return { success: false, error: 'Неверный параметр идентификатора кода. Попробуйте подключиться заново.' };
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

      let session = new StringSession(stringSession);
      let client = new TelegramClient(session, apiIdNum, cleanApiHash, {
        connectionRetries: 5,
        retryDelay: 1000,
        timeout: 10000,
        useWSS: false
      });

      // Подключаемся к Telegram
      try {
        logger.debug('Попытка подключения к Telegram (completeAuth)...');
        await Promise.race([
          client.connect(),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут подключения (10 секунд)')), 10000))
        ]);
        logger.debug('Клиент успешно подключен к Telegram (completeAuth)');
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (connectError) {
        logger.error('Ошибка подключения к Telegram (completeAuth)', { error: connectError.message });
        return { success: false, error: `Ошибка подключения к Telegram: ${connectError.message}` };
      }

      // Завершаем авторизацию
      try {
        const phoneForSignIn = processedPhone || '';
        logger.debug('Вызов Api.auth.SignIn', { phone: phoneForSignIn || 'не требуется' });

        const result = await Promise.race([
          client.invoke(new Api.auth.SignIn({
            phoneNumber: phoneForSignIn,
            phoneCodeHash: phoneCodeHash.trim(),
            phoneCode: phoneCode.trim()
          })),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут авторизации (15 секунд)')), 15000))
        ]);

        if (result instanceof Api.auth.AuthorizationSignUpRequired) {
          throw new Error('Требуется регистрация. Этот метод не поддерживается.');
        }

        if (!result.user) {
          throw new Error('Не удалось получить данные пользователя после авторизации');
        }

        logger.info('Авторизация успешна', { user: result.user.firstName || result.user.username || 'Неизвестно' });
      } catch (signInError) {
        logger.error('Ошибка входа', { error: signInError.message });
        let errorMessage = signInError.message || 'Неизвестная ошибка';

        const upperMsg = errorMessage.toUpperCase();
        if (upperMsg.includes('SESSION_PASSWORD_NEEDED')) {
          errorMessage = 'Требуется двухфакторная аутентификация (2FA). Она не поддерживается текущей версией.';
        } else if (upperMsg.includes('PHONE_CODE_INVALID')) {
          errorMessage = 'Неверный код подтверждения.';
        } else if (upperMsg.includes('PHONE_CODE_EXPIRED')) {
          errorMessage = 'Код подтверждения истек.';
        }

        // При ошибках кода очищаем клиент/сессию
        if (upperMsg.includes('PHONE_CODE_INVALID') || upperMsg.includes('PHONE_CODE_EXPIRED') || upperMsg.includes('TIMEOUT')) {
          try {
            this.clients.delete(sessionId);
            await fs.unlink(sessionPath).catch(() => { });
            await fs.unlink(this.getSessionConfigPath(sessionId)).catch(() => { });
            if (client && client.connected) {
              await client.disconnect().catch(() => { });
            }
          } catch (cleanupErr) {
            logger.warn('Не удалось полностью очистить сессию после ошибки кода', { error: cleanupErr.message });
          }

          return {
            success: false,
            needsAuth: true,
            error: errorMessage
          };
        }

        return { success: false, error: errorMessage };
      }

      // Сохраняем сессию
      const sessionString = client.session.save();
      if (sessionString && sessionString.trim().length > 0) {
        await fs.writeFile(sessionPath, sessionString, 'utf-8');
        logger.debug('Сессия сохранена успешно');
        await this.saveSessionConfig(sessionId, apiIdNum, cleanApiHash);
      }

      this.clients.set(sessionId, client);
      return { success: true, message: 'Авторизация завершена' };
    } catch (error) {
      logger.error('Ошибка завершения авторизации', { error: error.message });
      return { success: false, error: error.message || 'Неизвестная ошибка' };
    }
  }

  /**
   * Восстановление клиента из сохраненной сессии
   */
  async restoreClient(sessionId) {
    try {
      logger.debug('Попытка восстановления клиента из сессии', { sessionId: sessionId.substring(0, 20) + '...' });

      const config = await this.loadSessionConfig(sessionId);
      if (!config || !config.apiId || !config.apiHash) {
        logger.debug('Конфигурация сессии не найдена, восстановление невозможно');
        return null;
      }

      const sessionPath = this.getSessionPath(sessionId);
      let stringSession = '';
      try {
        const sessionData = await fs.readFile(sessionPath, 'utf-8');
        if (sessionData && sessionData.trim().length > 0) {
          stringSession = sessionData.trim();
        } else {
          logger.debug('Файл сессии пуст или не существует');
          return null;
        }
      } catch (error) {
        logger.debug('Ошибка чтения файла сессии', { error: error.message });
        return null;
      }

      const apiIdNum = parseInt(config.apiId);
      const cleanApiHash = String(config.apiHash).replace(/[\s\n\r\t\u00A0\u2000-\u200B\u2028\u2029\uFEFF]/g, '').trim();

      if (isNaN(apiIdNum) || apiIdNum <= 0 || cleanApiHash.length < 20) {
        logger.debug('Невалидные данные конфигурации');
        return null;
      }

      const session = new StringSession(stringSession);
      const client = new TelegramClient(session, Number(apiIdNum), String(cleanApiHash), {
        connectionRetries: 5,
        retryDelay: 1000,
        timeout: 10000,
        useWSS: false
      });

      logger.debug('Подключение восстановленного клиента...');
      await Promise.race([
        client.connect(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Таймаут подключения (10 секунд)')), 10000))
      ]);
      await new Promise(resolve => setTimeout(resolve, 500));

      const isAuthorized = await client.checkAuthorization();
      if (!isAuthorized) {
        logger.debug('Восстановленный клиент не авторизован');
        await client.disconnect().catch(() => { });
        return null;
      }

      this.clients.set(sessionId, client);
      logger.info('Клиент успешно восстановлен из сессии');
      return client;
    } catch (error) {
      logger.error('Ошибка восстановления клиента', { error: error.message });
      return null;
    }
  }

  /**
   * Получение клиента по sessionId (с автоматическим восстановлением)
   */
  async getClient(sessionId) {
    let client = this.clients.get(sessionId);

    if (!client) {
      logger.debug('Клиент не найден в памяти, пытаемся восстановить из сессии...');
      client = await this.restoreClient(sessionId);
      if (!client) {
        throw new Error('Клиент не подключен. Выполните инициализацию.');
      }
    }

    if (!client.connected) {
      logger.debug('Клиент найден, но не подключен. Подключаем...');
      try {
        await client.connect();
        await new Promise(resolve => setTimeout(resolve, 500));

        const isAuthorized = await client.checkAuthorization();
        if (!isAuthorized) {
          throw new Error('Клиент не авторизован. Выполните инициализацию.');
        }
      } catch (error) {
        logger.error('Ошибка подключения или авторизации клиента', { error: error.message });
        this.clients.delete(sessionId);
        client = await this.restoreClient(sessionId);
        if (!client) {
          throw new Error('Клиент не подключен. Выполните инициализацию.');
        }
      }
    } else {
      try {
        const isAuthorized = await client.checkAuthorization();
        if (!isAuthorized) {
          throw new Error('Клиент не авторизован. Выполните инициализацию.');
        }
      } catch (error) {
        logger.error('Ошибка проверки авторизации', { error: error.message });
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
    if (!sessionId) return false;
    const client = this.clients.get(sessionId);
    return !!client;
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
      logger.error('Ошибка получения списка чатов', { error: error.message });
      return { success: false, error: error.message || 'Неизвестная ошибка' };
    }
  }

  /**
   * Поиск сообщений по запросу в выбранных чатах
   */
  async searchMessages(sessionId, options) {
    try {
      const { query, chatIds, dateFrom, dateTo, limit = 30 } = options;
      const client = await this.getClient(sessionId);
      const results = [];

      const now = new Date();
      const weekAgo = new Date(now);
      weekAgo.setDate(weekAgo.getDate() - 7);
      weekAgo.setHours(0, 0, 0, 0);

      const filterDate = dateFrom ? (typeof dateFrom === 'string' ? new Date(dateFrom) : new Date(dateFrom)) : weekAgo;
      const filterDateTo = dateTo ? (typeof dateTo === 'string' ? new Date(dateTo) : new Date(dateTo)) : now;

      // Извлекаем семизначные номера
      const sevenDigitNumbers = this.extractSevenDigitNumbers(query);

      // Если есть семизначные номера, ищем по каждому (оптимизировано: батчинг)
      if (sevenDigitNumbers.length > 0) {
        // Ограничиваем количество номеров для поиска (первые 5)
        const numbersToSearch = sevenDigitNumbers.slice(0, 5);

        for (const fullNumber of numbersToSearch) {
          // Генерируем варианты поиска (полный номер + части)
          const searchVariants = this.generateSearchVariants(fullNumber);

          // Обрабатываем чаты батчами по 3 для ускорения
          const chatBatches = [];
          for (let i = 0; i < (chatIds || []).length; i += 3) {
            chatBatches.push((chatIds || []).slice(i, i + 3));
          }

          for (const batch of chatBatches) {
            // Параллельный поиск в батче чатов по всем вариантам
            const batchPromises = batch.map(async (chatId) => {
              try {
                const entity = await client.getEntity(chatId);
                const batchResults = [];

                // Ищем по каждому варианту (полный номер и его части)
                for (const searchVariant of searchVariants) {
                  try {
                    const messages = await client.getMessages(entity, {
                      search: searchVariant,
                      limit: limit
                    });

                    for (const msg of messages) {
                      const messageDate = msg.date ? new Date(msg.date * 1000) : null;
                      if (messageDate && (messageDate < filterDate || messageDate > filterDateTo)) {
                        continue;
                      }

                      const messageText = msg.text || msg.message || '';
                      if (messageText && this.containsNumberOrPart(messageText, fullNumber)) {
                        const existing = batchResults.find(r => r.id === msg.id && r.chatId === chatId);
                        if (!existing) {
                          const sender = msg.sender;
                          batchResults.push({
                            id: msg.id,
                            chatId: chatId,
                            chatName: entity.title || entity.firstName || entity.name || 'Без названия',
                            text: messageText,
                            date: msg.date ? (typeof msg.date === 'number' ? msg.date * 1000 : msg.date) : null,
                            author: sender ? (sender.firstName || sender.username || 'Неизвестно') : undefined,
                            authorId: msg.senderId ? msg.senderId.toString() : undefined,
                            isForwarded: msg.fwdFrom !== undefined,
                            forwardedFrom: msg.fwdFrom?.fromId?.toString()
                          });
                        }
                      }
                    }
                  } catch (searchError) {
                    // Игнорируем ошибки поиска по конкретному варианту
                    logger.debug('Ошибка поиска по варианту', {
                      variant: searchVariant,
                      chatId,
                      error: searchError.message
                    });
                  }
                }

                return batchResults;
              } catch (error) {
                logger.error('Ошибка поиска в чате', { chatId, error: error.message });
                return [];
              }
            });

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults.flat());
          }
        }
      }

      if (query.trim() && sevenDigitNumbers.length === 0) {
        const partialNumbers = this.extractPartialNumbers(query);

        if (partialNumbers.length > 0) {
          for (const part of partialNumbers.slice(0, 5)) {
            const chatBatches = [];
            for (let i = 0; i < (chatIds || []).length; i += 3) {
              chatBatches.push((chatIds || []).slice(i, i + 3));
            }

            for (const batch of chatBatches) {
              const batchPromises = batch.map(async (chatId) => {
                try {
                  const entity = await client.getEntity(chatId);
                  const batchResults = [];

                  try {
                    const searchMessages = await client.getMessages(entity, {
                      search: part,
                      limit: limit
                    });

                    for (const msg of searchMessages) {
                      const messageDate = msg.date ? new Date(msg.date * 1000) : null;
                      if (messageDate && (messageDate < filterDate || messageDate > filterDateTo)) {
                        continue;
                      }

                      const messageText = msg.text || msg.message || '';
                      const fullNumbers = this.extractFullNumbersEndingWith(messageText, part);
                      if (fullNumbers.length > 0 || messageText.includes(part)) {
                        const existing = batchResults.find(r => r.id === msg.id && r.chatId === chatId);
                        if (!existing) {
                          const sender = msg.sender;
                          batchResults.push({
                            id: msg.id,
                            chatId: chatId,
                            chatName: entity.title || entity.firstName || entity.name || 'Без названия',
                            text: messageText,
                            date: msg.date ? (typeof msg.date === 'number' ? msg.date * 1000 : msg.date) : null,
                            author: sender ? (sender.firstName || sender.username || 'Неизвестно') : undefined,
                            authorId: msg.senderId ? msg.senderId.toString() : undefined,
                            isForwarded: msg.fwdFrom !== undefined,
                            forwardedFrom: msg.fwdFrom?.fromId?.toString()
                          });
                        }
                      }
                    }
                  } catch (searchError) {
                  }

                  try {
                    const checkLimit = 200;
                    const recentMessages = await client.getMessages(entity, {
                      limit: checkLimit
                    });

                    for (const msg of recentMessages) {
                      const messageDate = msg.date ? new Date(msg.date * 1000) : null;
                      if (messageDate && (messageDate < filterDate || messageDate > filterDateTo)) {
                        continue;
                      }

                      const messageText = msg.text || msg.message || '';
                      if (!messageText) continue;

                      const fullNumbers = this.extractFullNumbersEndingWith(messageText, part);
                      if (fullNumbers.length > 0) {
                        const existing = batchResults.find(r => r.id === msg.id && r.chatId === chatId);
                        if (!existing) {
                          const sender = msg.sender;
                          batchResults.push({
                            id: msg.id,
                            chatId: chatId,
                            chatName: entity.title || entity.firstName || entity.name || 'Без названия',
                            text: messageText,
                            date: msg.date ? (typeof msg.date === 'number' ? msg.date * 1000 : msg.date) : null,
                            author: sender ? (sender.firstName || sender.username || 'Неизвестно') : undefined,
                            authorId: msg.senderId ? msg.senderId.toString() : undefined,
                            isForwarded: msg.fwdFrom !== undefined,
                            forwardedFrom: msg.fwdFrom?.fromId?.toString()
                          });
                        }
                      }
                    }
                  } catch (recentError) {
                  }

                  return batchResults;
                } catch (error) {
                  return [];
                }
              });

              const batchResults = await Promise.all(batchPromises);
              results.push(...batchResults.flat());
            }
          }
        } else {
          const chatBatches = [];
          for (let i = 0; i < (chatIds || []).length; i += 3) {
            chatBatches.push((chatIds || []).slice(i, i + 3));
          }

          for (const batch of chatBatches) {
            const batchPromises = batch.map(async (chatId) => {
              try {
                const entity = await client.getEntity(chatId);
                const messages = await client.getMessages(entity, {
                  search: query,
                  limit: limit
                });

                const batchResults = [];
                for (const msg of messages) {
                  const messageDate = msg.date ? new Date(msg.date * 1000) : null;
                  if (messageDate && (messageDate < filterDate || messageDate > filterDateTo)) {
                    continue;
                  }

                  const messageText = msg.text || msg.message || '';
                  const sender = msg.sender;
                  batchResults.push({
                    id: msg.id,
                    chatId: chatId,
                    chatName: entity.title || entity.firstName || entity.name || 'Без названия',
                    text: messageText,
                    date: msg.date ? (typeof msg.date === 'number' ? msg.date * 1000 : msg.date) : null,
                    author: sender ? (sender.firstName || sender.username || 'Неизвестно') : undefined,
                    authorId: msg.senderId ? msg.senderId.toString() : undefined,
                    isForwarded: msg.fwdFrom !== undefined,
                    forwardedFrom: msg.fwdFrom?.fromId?.toString()
                  });
                }
                return batchResults;
              } catch (error) {
                return [];
              }
            });

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults.flat());
          }
        }
      }

      const uniqueResults = results.filter((result, index, self) =>
        index === self.findIndex(r => r.id === result.id && r.chatId === result.chatId)
      );

      return { success: true, messages: uniqueResults };
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Неизвестная ошибка'
      };
    }
  }

  extractSevenDigitNumbers(text) {
    const regex = /\b\d{7}\b/g;
    const matches = text.match(regex) || [];
    return [...new Set(matches)];
  }

  extractPartialNumbers(text) {
    const regex = /\b\d{4,6}\b/g;
    const matches = text.match(regex) || [];
    return [...new Set(matches)];
  }

  numberEndsWith(fullNumber, part) {
    if (!fullNumber || !part || fullNumber.length !== 7) {
      return false;
    }
    return fullNumber.endsWith(part);
  }

  extractFullNumbersEndingWith(text, part) {
    if (!text || !part) return [];
    const regex = /\d{7}/g;
    const matches = text.match(regex) || [];
    return matches.filter(num => num.endsWith(part));
  }

  /**
   * Генерация вариантов поиска для семизначного номера
   * Возвращает полный номер и его части (последние 4-6 цифр)
   * Например, для 1214508 вернет: ['1214508', '214508', '14508', '4508']
   */
  generateSearchVariants(fullNumber) {
    if (!fullNumber || fullNumber.length !== 7) {
      return [fullNumber];
    }

    const variants = [fullNumber]; // Полный номер
    // Последние 6 цифр
    if (fullNumber.length >= 6) {
      variants.push(fullNumber.slice(1));
    }
    // Последние 5 цифр
    if (fullNumber.length >= 5) {
      variants.push(fullNumber.slice(2));
    }
    // Последние 4 цифры
    if (fullNumber.length >= 4) {
      variants.push(fullNumber.slice(3));
    }

    return [...new Set(variants)]; // Убираем дубликаты
  }

  /**
   * Проверка, содержит ли текст номер или его часть
   */
  containsNumberOrPart(text, fullNumber) {
    if (!text || !fullNumber) return false;

    // Проверяем полный номер
    if (text.includes(fullNumber)) return true;

    // Проверяем части номера (последние 4-6 цифр)
    const variants = this.generateSearchVariants(fullNumber);
    for (const variant of variants) {
      if (variant !== fullNumber && text.includes(variant)) {
        return true;
      }
    }

    return false;
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
      logger.error('Ошибка отключения', { error: error.message });
      return {
        success: false,
        error: error.message || 'Неизвестная ошибка'
      };
    }
  }
}

// Экспортируем singleton
module.exports = new TelegramService();

