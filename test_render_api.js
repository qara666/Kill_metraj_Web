const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// Замените на ваш реальный URL Render
const RENDER_BACKEND_URL = 'https://your-backend-name.onrender.com';

async function testRenderAPI() {
  try {
    console.log('🔍 Тестируем API на Render...');
    
    // Создаем тестовый Excel файл с правильными заголовками
    const XLSX = require('xlsx');
    
    const testData = [
      ['Номер', 'Состояние', 'Тип заказа', 'Телефон', 'Заказчик (имя)', 'Заказчик (всего заказов)', 'Комментарии', 'Адрес (адрес)', 'Зона доставки', 'Время доставки', 'Дата (создания)', 'Дата (время на кухню)', 'Дата (доставить к)', 'Дата (плановое время)', 'Общее время', 'Скидка (%)', 'К оплате', 'Сдача (сумма сдачи)', 'Способ оплаты', 'Курьер'],
      ['80656', 'Исполнен', 'Доставка', '0961055455', 'Сергій', '1', 'Я к', 'Київ, вул. Семена Скляренка, 4', 'Зона 2 Средние', '25мин.', '21.09.2025 13:41', '10:35:00 AM', '22.09.2025 11:00', '22.09.2025 11:00', '1ч. 9мин.', '31,00', '3815,00', '7,00', 'Готівка', 'Онищенко Андрій']
    ];
    
    const worksheet = XLSX.utils.aoa_to_sheet(testData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'ЗАКАЗЫ');
    
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const testFilePath = path.join(__dirname, 'test_render.xlsx');
    fs.writeFileSync(testFilePath, excelBuffer);
    
    console.log('✅ Тестовый Excel файл создан:', testFilePath);
    
    // Тестируем API
    const formData = new FormData();
    formData.append('file', fs.createReadStream(testFilePath));
    
    const response = await fetch(`${RENDER_BACKEND_URL}/api/upload/excel`, {
      method: 'POST',
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    console.log('📊 Результат API:');
    console.log('✅ Success:', result.success);
    console.log('📦 Orders:', result.data?.orders?.length || 0);
    console.log('💰 Total Amount:', result.data?.statistics?.totalAmount || 0);
    console.log('👥 Couriers:', result.data?.couriers?.length || 0);
    console.log('💳 Payment Methods:', result.data?.paymentMethods?.length || 0);
    console.log('❌ Errors:', result.data?.errors?.length || 0);
    
    if (result.data?.debug?.logs) {
      console.log('🔍 Debug Logs:', result.data.debug.logs.length, 'entries');
      console.log('📝 Last 5 logs:');
      result.data.debug.logs.slice(-5).forEach((log, i) => {
        console.log(`  ${i+1}. ${log.message}`);
      });
    }
    
    // Очищаем тестовый файл
    fs.unlinkSync(testFilePath);
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    console.error('🔍 Детали:', error);
  }
}

testRenderAPI();
