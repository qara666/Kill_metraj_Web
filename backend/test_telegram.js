/**
 * Простой тестовый скрипт для проверки подключения к Telegram
 * Использование: node test_telegram.js
 */

const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const readline = require('readline');

// Создаем интерфейс для ввода данных
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function testConnection() {
  try {
    console.log('=== Тест подключения к Telegram ===\n');
    
    // Запрашиваем данные
    const apiIdStr = await question('Введите API ID: ');
    const apiId = parseInt(apiIdStr.trim());
    
    if (isNaN(apiId) || apiId <= 0) {
      console.error('Ошибка: API ID должен быть положительным числом');
      rl.close();
      return;
    }
    
    const apiHash = await question('Введите API Hash: ');
    const cleanApiHash = apiHash.replace(/[\s\n\r\t\u00A0\u2000-\u200B\u2028\u2029\uFEFF]/g, '').trim();
    
    if (cleanApiHash.length < 20) {
      console.error('Ошибка: API Hash должен быть строкой длиной не менее 20 символов');
      rl.close();
      return;
    }
    
    if (!/^[a-f0-9]+$/i.test(cleanApiHash)) {
      console.error('Ошибка: API Hash должен содержать только шестнадцатеричные символы (0-9, a-f)');
      rl.close();
      return;
    }
    
    const phoneNumber = await question('Введите номер телефона (например, +380971278184): ');
    const processedPhone = phoneNumber.replace(/\D/g, '');
    
    if (processedPhone.length < 10 || processedPhone.length > 15) {
      console.error('Ошибка: Номер телефона должен содержать от 10 до 15 цифр');
      rl.close();
      return;
    }
    
    console.log('\n=== Создание клиента ===');
    console.log('API ID:', apiId);
    console.log('API Hash:', cleanApiHash.substring(0, 10) + '...');
    console.log('Номер телефона:', processedPhone);
    
    // Создаем сессию и клиент
    const session = new StringSession('');
    console.log('Сессия создана');
    
    const client = new TelegramClient(session, apiId, cleanApiHash, {
      connectionRetries: 5,
      retryDelay: 1000,
      timeout: 10000,
      useWSS: false
    });
    console.log('Клиент создан');
    
    // Подключаемся
    console.log('\n=== Подключение к Telegram ===');
    try {
      await client.connect();
      console.log('✓ Успешно подключено к Telegram');
    } catch (connectError) {
      console.error('✗ Ошибка подключения:', connectError.message || connectError);
      rl.close();
      return;
    }
    
    // Проверяем авторизацию
    console.log('\n=== Проверка авторизации ===');
    let isAuthorized = false;
    try {
      isAuthorized = await client.checkAuthorization();
      console.log('Авторизован:', isAuthorized);
    } catch (authError) {
      console.error('Ошибка проверки авторизации:', authError.message || authError);
      rl.close();
      return;
    }
    
    if (!isAuthorized) {
      console.log('\n=== Требуется авторизация ===');
      console.log('Отправка кода подтверждения...');
      
      try {
        // Пробуем с "+" и без
        let result = null;
        const phoneWithPlus = '+' + processedPhone;
        
        try {
          console.log('Попытка 1: с "+" -', phoneWithPlus);
          result = await client.sendCode(phoneWithPlus);
          console.log('✓ Код отправлен успешно');
        } catch (err1) {
          console.log('Попытка 1 не удалась:', err1.message || err1);
          try {
            console.log('Попытка 2: без "+" -', processedPhone);
            result = await client.sendCode(processedPhone);
            console.log('✓ Код отправлен успешно');
          } catch (err2) {
            console.error('✗ Обе попытки не удались:');
            console.error('  Попытка 1:', err1.message || err1);
            console.error('  Попытка 2:', err2.message || err2);
            rl.close();
            return;
          }
        }
        
        if (!result) {
          console.error('✗ Не удалось получить результат от sendCode');
          rl.close();
          return;
        }
        
        // Извлекаем phoneCodeHash
        const phoneCodeHash = result.phoneCodeHash || result.phone_code_hash;
        if (!phoneCodeHash) {
          console.error('✗ Не удалось получить phoneCodeHash из результата');
          console.log('Результат:', result);
          rl.close();
          return;
        }
        
        console.log('✓ phoneCodeHash получен:', phoneCodeHash.substring(0, 20) + '...');
        
        // Запрашиваем код
        const phoneCode = await question('\nВведите код подтверждения из Telegram: ');
        
        console.log('\n=== Завершение авторизации ===');
        try {
          await client.signInUser({
            phoneNumber: phoneWithPlus,
            phoneCodeHash: phoneCodeHash,
            phoneCode: phoneCode.trim()
          });
          console.log('✓ Авторизация завершена успешно!');
        } catch (signInError) {
          console.error('✗ Ошибка авторизации:', signInError.message || signInError);
          rl.close();
          return;
        }
        
        // Сохраняем сессию
        const sessionString = client.session.save();
        if (sessionString) {
          console.log('\n=== Сохранение сессии ===');
          console.log('Сессия сохранена (длина:', sessionString.length, 'символов)');
        }
        
      } catch (sendCodeError) {
        console.error('✗ Ошибка отправки кода:', sendCodeError.message || sendCodeError);
        console.error('Тип ошибки:', typeof sendCodeError);
        if (sendCodeError.stack) {
          console.error('Стек ошибки:', sendCodeError.stack.substring(0, 500));
        }
        rl.close();
        return;
      }
    } else {
      console.log('✓ Уже авторизован');
    }
    
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
    
  } catch (error) {
    console.error('\n✗ Критическая ошибка:', error.message || error);
    if (error.stack) {
      console.error('Стек ошибки:', error.stack);
    }
  } finally {
    rl.close();
    process.exit(0);
  }
}

// Запускаем тест
testConnection();

