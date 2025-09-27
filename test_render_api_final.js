const FormData = require('form-data');
const fs = require('fs');
const fetch = require('node-fetch');

async function testRenderAPIFinal() {
  try {
    console.log('🔍 Финальный тест Render API...');
    
    // ЗАМЕНИТЕ НА ВАШ РЕАЛЬНЫЙ URL RENDER BACKEND
    const RENDER_BACKEND_URL = 'https://your-backend-name.onrender.com';
    
    console.log('📡 Тестируем URL:', RENDER_BACKEND_URL);
    
    // Проверяем health endpoint
    console.log('\n1️⃣ Проверяем health endpoint...');
    try {
      const healthResponse = await fetch(`${RENDER_BACKEND_URL}/api/health`);
      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        console.log('✅ Health check успешен:', healthData);
      } else {
        console.log('❌ Health check failed:', healthResponse.status, healthResponse.statusText);
        return;
      }
    } catch (error) {
      console.log('❌ Health check error:', error.message);
      return;
    }
    
    // Тестируем с нашим файлом
    console.log('\n2️⃣ Тестируем Excel upload...');
    
    if (!fs.existsSync('test_real_headers.xlsx')) {
      console.log('❌ Файл test_real_headers.xlsx не найден');
      return;
    }
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream('test_real_headers.xlsx'));
    
    console.log('📤 Отправляем файл на Render...');
    const response = await fetch(`${RENDER_BACKEND_URL}/api/upload/excel`, {
      method: 'POST',
      body: formData
    });
    
    console.log('📊 Response status:', response.status, response.statusText);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('❌ Error response:', errorText);
      return;
    }
    
    const result = await response.json();
    
    console.log('\n📊 РЕЗУЛЬТАТ API:');
    console.log('✅ Success:', result.success);
    console.log('📦 Orders:', result.data?.orders?.length || 0);
    console.log('💰 Total Amount:', result.data?.statistics?.totalAmount || 0);
    console.log('👥 Couriers:', result.data?.couriers?.length || 0);
    console.log('💳 Payment Methods:', result.data?.paymentMethods?.length || 0);
    console.log('❌ Errors:', result.data?.errors?.length || 0);
    
    if (result.data?.debug?.logs) {
      console.log('🔍 Debug Logs:', result.data.debug.logs.length, 'entries');
      
      // Показываем логи маппинга заголовков
      const mappingLogs = result.data.debug.logs.filter(log => 
        log.message.includes('Маппинг заголовков') || 
        log.message.includes('Найден') ||
        log.message.includes('amount') ||
        log.message.includes('к оплате') ||
        log.message.includes('заказчик') ||
        log.message.includes('адрес')
      );
      
      if (mappingLogs.length > 0) {
        console.log('\n🔍 ЛОГИ МАППИНГА ЗАГОЛОВКОВ:');
        mappingLogs.forEach(log => {
          console.log(`  ${log.message}`);
        });
      }
      
      // Показываем последние 10 логов
      console.log('\n📝 ПОСЛЕДНИЕ 10 ЛОГОВ:');
      result.data.debug.logs.slice(-10).forEach((log, i) => {
        console.log(`  ${i+1}. ${log.message}`);
      });
    }
    
    // Анализируем результат
    if (result.data?.orders?.length > 0) {
      console.log('\n🎉 УСПЕХ! API работает правильно!');
      console.log('📊 Первый заказ:');
      const firstOrder = result.data.orders[0];
      console.log(`  - Номер: ${firstOrder.orderNumber}`);
      console.log(`  - Сумма: ${firstOrder.amount}`);
      console.log(`  - Клиент: ${firstOrder.customerName}`);
      console.log(`  - Адрес: ${firstOrder.address}`);
      console.log(`  - Курьер: ${firstOrder.courier}`);
    } else {
      console.log('\n❌ ПРОБЛЕМА: API возвращает 0 заказов');
      console.log('🔍 Возможные причины:');
      console.log('  1. Render не обновился (подождите 2-3 минуты)');
      console.log('  2. Неправильные заголовки в Excel файле');
      console.log('  3. Проблема с парсером на Render');
    }
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    console.error('🔍 Детали:', error);
  }
}

// Запускаем тест
testRenderAPIFinal();
