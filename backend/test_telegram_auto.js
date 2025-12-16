/**
 * Автоматизированный тестовый скрипт для проверки подключения к Telegram
 * Использование: node test_telegram_auto.js
 */

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const readline = require('readline');

// Данные для тестирования
const API_ID = 32157558;
const API_HASH = '5a0601d715a37efd836b01ab587431bd';
const PHONE_NUMBER = '+380971278184'; // Убираем пробелы

// Функция для ввода кода с консоли
function askForCode(phoneCodeHash) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    console.log('\n=== Ввод кода подтверждения ===');
    console.log('Код подтверждения должен прийти в Telegram');
    console.log('phoneCodeHash:', phoneCodeHash.substring(0, 20) + '...');
    console.log('');
    
    rl.question('Введите одноразовый код из Telegram: ', (code) => {
      rl.close();
      const trimmedCode = code.trim();
      if (!trimmedCode) {
        console.error('Код не может быть пустым!');
        process.exit(1);
      }
      resolve(trimmedCode);
    });
  });
}

async function testConnection() {
  let client = null;
  
  try {
    console.log('=== Тест подключения к Telegram ===\n');
    console.log('API ID:', API_ID);
    console.log('API Hash:', API_HASH.substring(0, 10) + '...');
    console.log('Номер телефона:', PHONE_NUMBER);
    console.log('');
    
    // Проверяем валидность данных
    if (isNaN(API_ID) || API_ID <= 0) {
      throw new Error('API ID должен быть положительным числом');
    }
    
    const cleanApiHash = API_HASH.replace(/[\s\n\r\t\u00A0\u2000-\u200B\u2028\u2029\uFEFF]/g, '').trim();
    if (cleanApiHash.length < 20) {
      throw new Error('API Hash должен быть строкой длиной не менее 20 символов');
    }
    
    if (!/^[a-f0-9]+$/i.test(cleanApiHash)) {
      throw new Error('API Hash должен содержать только шестнадцатеричные символы (0-9, a-f)');
    }
    
    const processedPhone = PHONE_NUMBER.replace(/\D/g, '');
    if (processedPhone.length < 10 || processedPhone.length > 15) {
      throw new Error('Номер телефона должен содержать от 10 до 15 цифр');
    }
    
    console.log('✓ Валидация данных пройдена');
    console.log('  - API ID:', API_ID, '(тип:', typeof API_ID, ')');
    console.log('  - API Hash:', cleanApiHash.length, 'символов, валиден:', /^[a-f0-9]+$/i.test(cleanApiHash));
    console.log('  - Номер телефона:', processedPhone, '(длина:', processedPhone.length, ')');
    console.log('');
    
    // Создаем сессию и клиент
    console.log('=== Создание клиента ===');
    const session = new StringSession('');
    console.log('✓ Сессия создана');
    
    client = new TelegramClient(session, Number(API_ID), String(cleanApiHash), {
      connectionRetries: 5,
      retryDelay: 1000,
      timeout: 10000,
      useWSS: false
    });
    console.log('✓ Клиент создан');
    
    // Проверяем, что клиент сохранил apiId и apiHash
    console.log('Проверка внутренних свойств клиента:');
    console.log('  - client._apiId:', client._apiId);
    console.log('  - client._apiHash:', client._apiHash ? client._apiHash.substring(0, 10) + '...' : 'undefined');
    console.log('  - client.apiId:', client.apiId);
    console.log('  - client.apiHash:', client.apiHash ? client.apiHash.substring(0, 10) + '...' : 'undefined');
    console.log('');
    
    // Подключаемся
    console.log('=== Подключение к Telegram ===');
    try {
      await client.connect();
      console.log('✓ Успешно подключено к Telegram');
      console.log('  - client.connected:', client.connected);
    } catch (connectError) {
      console.error('✗ Ошибка подключения');
      console.error('  Тип ошибки:', typeof connectError);
      console.error('  Сообщение:', connectError.message || String(connectError));
      if (connectError.stack) {
        console.error('  Стек (первые 500 символов):', connectError.stack.substring(0, 500));
      }
      throw connectError;
    }
    console.log('');
    
    // Проверяем авторизацию
    console.log('=== Проверка авторизации ===');
    let isAuthorized = false;
    try {
      isAuthorized = await client.checkAuthorization();
      console.log('✓ Авторизован:', isAuthorized);
    } catch (authError) {
      console.error('✗ Ошибка проверки авторизации');
      console.error('  Тип ошибки:', typeof authError);
      console.error('  Сообщение:', authError.message || String(authError));
      if (authError.stack) {
        console.error('  Стек (первые 500 символов):', authError.stack.substring(0, 500));
      }
      throw authError;
    }
    console.log('');
    
    if (!isAuthorized) {
      console.log('=== Требуется авторизация ===');
      console.log('Отправка кода подтверждения...');
      
      let result = null;
      const phoneWithPlus = '+' + processedPhone;
      let lastError = null;
      
      // Проверяем, что клиент имеет доступ к apiId и apiHash перед вызовом sendCode
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
        apiId: Number(API_ID),
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
          client = new TelegramClient(newSession, Number(API_ID), String(cleanApiHash), {
            connectionRetries: 5,
            retryDelay: 1000,
            timeout: 10000,
            useWSS: false
          });
          await client.connect();
          await new Promise(resolve => setTimeout(resolve, 500));
          console.log('✓ Клиент пересоздан и подключен');
          
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
          
          // Выводим все поля результата
          for (const key of keys) {
            const value = result[key];
            if (typeof value === 'string' && value.length > 50) {
              console.log(`  ${key}:`, value.substring(0, 50) + '... (длина:', value.length, ')');
            } else {
              console.log(`  ${key}:`, value);
            }
          }
        } catch (logError) {
          console.error('Ошибка при анализе результата:', logError);
        }
      } else {
        console.log('Результат:', result);
      }
      
      // Извлекаем phoneCodeHash
      let phoneCodeHash = null;
      if (result && typeof result === 'object') {
        if (result.phoneCodeHash !== undefined && result.phoneCodeHash !== null) {
          phoneCodeHash = String(result.phoneCodeHash);
          console.log('\n✓ phoneCodeHash найден (phoneCodeHash):', phoneCodeHash.substring(0, 20) + '...');
        } else if (result.phone_code_hash !== undefined && result.phone_code_hash !== null) {
          phoneCodeHash = String(result.phone_code_hash);
          console.log('\n✓ phoneCodeHash найден (phone_code_hash):', phoneCodeHash.substring(0, 20) + '...');
        } else {
          console.error('\n✗ phoneCodeHash не найден в результате');
          console.error('Попробуем найти в других полях...');
          const keys = Object.keys(result);
          for (const key of keys) {
            if (key.toLowerCase().includes('hash') || key.toLowerCase().includes('code')) {
              console.log('  Найдено поле:', key, '=', result[key]);
            }
          }
          throw new Error('phoneCodeHash не найден в результате sendCode');
        }
      } else {
        throw new Error('Результат sendCode не является объектом');
      }
      
      console.log('\n=== Запрос кода подтверждения ===');
      console.log('Код подтверждения должен прийти в Telegram');
      console.log('phoneCodeHash:', phoneCodeHash.substring(0, 20) + '...');
      
      // Запрашиваем код у пользователя
      const phoneCode = await askForCode(phoneCodeHash);
      
      console.log('\n=== Завершение авторизации ===');
      console.log('Введен код:', phoneCode.replace(/\d/g, '*').substring(0, 2) + '****');
      
      // Вызываем signInUser с правильными параметрами
      const apiCredentialsForSignIn = {
        apiId: Number(API_ID),
        apiHash: String(cleanApiHash)
      };
      
      const authParams = {
        phoneNumber: phoneWithPlus,
        phoneCodeHash: phoneCodeHash,
        phoneCode: phoneCode
      };
      
      try {
        console.log('Вызов signInUser...');
        const user = await client.signInUser(apiCredentialsForSignIn, authParams);
        console.log('✓ Авторизация успешна!');
        console.log('  Пользователь:', user.firstName || user.username || 'Неизвестно');
        
        // Сохраняем сессию
        const sessionString = client.session.save();
        console.log('\n=== Сессия сохранена ===');
        console.log('Session string (первые 50 символов):', sessionString.substring(0, 50) + '...');
        console.log('Длина сессии:', sessionString.length);
        
        // Проверяем авторизацию еще раз
        const isNowAuthorized = await client.checkAuthorization();
        console.log('✓ Проверка авторизации:', isNowAuthorized ? 'Успешно' : 'Не авторизован');
        
        if (isNowAuthorized) {
          console.log('\n=== Тест получения чатов ===');
          try {
            const dialogs = await client.getDialogs({ limit: 5 });
            console.log('✓ Получено чатов:', dialogs.length);
            if (dialogs.length > 0) {
              console.log('Первый чат:', dialogs[0].entity.title || dialogs[0].entity.firstName || 'Без названия');
            }
          } catch (chatsError) {
            console.error('✗ Ошибка получения чатов:', chatsError.message || chatsError);
          }
        }
        
        console.log('\n=== Тест успешно завершен! ===');
      } catch (signInError) {
        console.error('\n✗ Ошибка при завершении авторизации:');
        console.error('  Тип ошибки:', typeof signInError);
        console.error('  Сообщение:', signInError.message || String(signInError));
        if (signInError.stack) {
          console.error('  Стек (первые 500 символов):', signInError.stack.substring(0, 500));
        }
        throw signInError;
      }
      
    } else {
      console.log('✓ Уже авторизован, тестируем получение чатов...');
      
      // Тестируем получение чатов
      console.log('\n=== Тест получения чатов ===');
      try {
        const dialogs = await client.getDialogs({ limit: 5 });
        console.log('✓ Получено чатов:', dialogs.length);
        if (dialogs.length > 0) {
          console.log('Первый чат:', dialogs[0].entity.title || dialogs[0].entity.firstName || 'Без названия');
        }
      } catch (chatsError) {
        console.error('✗ Ошибка получения чатов:', chatsError.message || chatsError);
      }
      
      console.log('\n=== Тест завершен успешно! ===');
    }
    
  } catch (error) {
    console.error('\n✗ Критическая ошибка:');
    console.error('  Тип:', typeof error);
    console.error('  Сообщение:', error.message || String(error));
    if (error.stack) {
      console.error('  Стек (первые 1000 символов):');
      console.error(error.stack.substring(0, 1000));
    }
    
    // Дополнительная информация об ошибке
    if (error && typeof error === 'object') {
      try {
        const errorKeys = Object.keys(error);
        console.error('  Ключи ошибки:', errorKeys);
        for (const key of errorKeys) {
          if (key !== 'stack' && key !== 'message') {
            try {
              const value = error[key];
              if (typeof value === 'string' && value.length < 100) {
                console.error(`  ${key}:`, value);
              } else {
                console.error(`  ${key}:`, typeof value);
              }
            } catch (e) {
              // Игнорируем ошибки при доступе к свойствам
            }
          }
        }
      } catch (e) {
        // Игнорируем ошибки при анализе ошибки
      }
    }
    
    process.exit(1);
  } finally {
    if (client && client.connected) {
      try {
        await client.disconnect();
        console.log('\n✓ Отключено от Telegram');
      } catch (e) {
        // Игнорируем ошибки отключения
      }
    }
    process.exit(0);
  }
}

// Запускаем тест
testConnection();

