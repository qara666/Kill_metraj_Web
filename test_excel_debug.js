const XLSX = require('xlsx');
const ExcelService = require('./backend/src/services/ExcelService_v2');

// Создаем тестовый Excel файл
function createTestExcel() {
  const testData = [
    ['К оплате', 'Заказчик (имя)', 'Адрес (адрес)', 'Курьер', 'Способ оплаты', 'Телефон'],
    [150.50, 'Иван Петров', 'ул. Пушкина, 10', 'Алексей', 'Наличные', '+380501234567'],
    [200.00, 'Мария Сидорова', 'пр. Шевченко, 25', 'Петр', 'Карта', '+380509876543'],
    [75.30, 'Олег Козлов', 'ул. Ленина, 5', 'Алексей', 'Наличные', '+380501111111']
  ];

  const ws = XLSX.utils.aoa_to_sheet(testData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Заказы');
  
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return buffer;
}

async function testExcelProcessing() {
  console.log('🧪 Тестирование Excel обработки...\n');
  
  try {
    // Создаем тестовый файл
    const testBuffer = createTestExcel();
    console.log('✅ Тестовый Excel файл создан');
    
    // Создаем сервис
    const excelService = new ExcelService();
    console.log('✅ ExcelService создан');
    
    // Обрабатываем файл
    console.log('\n📊 Начинаем обработку...');
    const result = await excelService.processExcelFile(testBuffer);
    
    console.log('\n📋 Результат обработки:');
    console.log('Success:', result.success);
    console.log('Message:', result.message);
    
    if (result.success) {
      const data = result.data;
      console.log('\n📈 Статистика:');
      console.log('- Заказов:', data.orders?.length || 0);
      console.log('- Курьеров:', data.couriers?.length || 0);
      console.log('- Способов оплаты:', data.paymentMethods?.length || 0);
      console.log('- Адресов:', data.addresses?.length || 0);
      console.log('- Ошибок:', data.errors?.length || 0);
      console.log('- Предупреждений:', data.warnings?.length || 0);
      
      console.log('\n🔍 Детали заказов:');
      if (data.orders && data.orders.length > 0) {
        data.orders.forEach((order, index) => {
          console.log(`\nЗаказ ${index + 1}:`);
          console.log('- Номер:', order.orderNumber);
          console.log('- Клиент:', order.customerName);
          console.log('- Адрес:', order.address);
          console.log('- Курьер:', order.courier);
          console.log('- Сумма:', order.amount);
          console.log('- Оплата:', order.paymentMethod);
        });
      } else {
        console.log('❌ Заказы не найдены!');
      }
      
      console.log('\n📝 Логи обработки:');
      if (data.debug && data.debug.logs) {
        data.debug.logs.forEach((log, index) => {
          console.log(`${index + 1}. [${log.timestamp}] ${log.message}`);
          if (log.data) {
            console.log(`   Данные: ${log.data}`);
          }
        });
      }
      
      console.log('\n🗺️ Маппинг заголовков:');
      if (data.debug && data.debug.headerMap) {
        console.log(JSON.stringify(data.debug.headerMap, null, 2));
      }
      
    } else {
      console.log('❌ Ошибка обработки:', result.error);
    }
    
  } catch (error) {
    console.error('💥 Критическая ошибка:', error.message);
    console.error(error.stack);
  }
}

// Запускаем тест
testExcelProcessing();





