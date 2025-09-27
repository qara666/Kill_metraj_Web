const FormData = require('form-data');
const fs = require('fs');
const fetch = require('node-fetch');

async function testRenderAPI() {
  try {
    console.log('🔍 Тестируем Render API напрямую...');
    
    // Замените на ваш реальный URL Render backend
    const RENDER_BACKEND_URL = 'https://your-backend-name.onrender.com';
    
    console.log('📡 URL:', RENDER_BACKEND_URL);
    
    // Проверяем health endpoint
    console.log('\n1️⃣ Проверяем health endpoint...');
    try {
      const healthResponse = await fetch(`${RENDER_BACKEND_URL}/api/health`);
      if (healthResponse.ok) {
        const healthData = await healthResponse.json();
        console.log('✅ Health check:', healthData);
      } else {
        console.log('❌ Health check failed:', healthResponse.status, healthResponse.statusText);
      }
    } catch (error) {
      console.log('❌ Health check error:', error.message);
    }
    
    // Тестируем с нашим файлом
    console.log('\n2️⃣ Тестируем Excel upload...');
    
    if (!fs.existsSync('test_real_headers.xlsx')) {
      console.log('❌ Файл test_real_headers.xlsx не найден');
      return;
    }
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream('test_real_headers.xlsx'));
    
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
    
    console.log('\n📊 Результат API:');
    console.log('✅ Success:', result.success);
    console.log('📦 Orders:', result.data?.orders?.length || 0);
    console.log('💰 Total Amount:', result.data?.statistics?.totalAmount || 0);
    console.log('👥 Couriers:', result.data?.couriers?.length || 0);
    console.log('💳 Payment Methods:', result.data?.paymentMethods?.length || 0);
    console.log('❌ Errors:', result.data?.errors?.length || 0);
    
    if (result.data?.debug?.logs) {
      console.log('🔍 Debug Logs:', result.data.debug.logs.length, 'entries');
      console.log('📝 Последние 10 логов:');
      result.data.debug.logs.slice(-10).forEach((log, i) => {
        console.log(`  ${i+1}. ${log.message}`);
      });
    }
    
    // Проверяем маппинг заголовков
    if (result.data?.debug?.logs) {
      const mappingLogs = result.data.debug.logs.filter(log => 
        log.message.includes('Маппинг заголовков') || 
        log.message.includes('Найден') ||
        log.message.includes('amount') ||
        log.message.includes('к оплате')
      );
      
      if (mappingLogs.length > 0) {
        console.log('\n🔍 Логи маппинга заголовков:');
        mappingLogs.forEach(log => {
          console.log(`  ${log.message}`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    console.error('🔍 Детали:', error);
  }
}

// Запускаем тест
testRenderAPI();
