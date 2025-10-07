const ExcelService = require('./backend/src/services/ExcelService_v2');
const fs = require('fs');

console.log('🧪 Тестирование ExcelService_v2...');

const excelService = new ExcelService();

// Читаем тестовый файл
const testFile = './test_real_headers.xlsx';
const buffer = fs.readFileSync(testFile);

console.log(`📁 Файл загружен: ${testFile} (${buffer.length} байт)`);

// Обрабатываем файл
excelService.processExcelFile(buffer)
  .then(result => {
    console.log('\n📊 Результат обработки:');
    console.log(`✅ Успех: ${result.success}`);
    console.log(`📦 Заказов: ${result.data.orders.length}`);
    console.log(`🚚 Курьеров: ${result.data.couriers.length}`);
    console.log(`💳 Способов оплаты: ${result.data.paymentMethods.length}`);
    console.log(`📍 Адресов: ${result.data.addresses.length}`);
    console.log(`❌ Ошибок: ${result.data.errors.length}`);
    console.log(`⚠️ Предупреждений: ${result.data.warnings.length}`);
    
    if (result.data.orders.length > 0) {
      console.log('\n📋 Первый заказ:');
      console.log(JSON.stringify(result.data.orders[0], null, 2));
    }
    
    if (result.data.errors.length > 0) {
      console.log('\n❌ Ошибки:');
      result.data.errors.forEach(error => console.log(`  - ${error}`));
    }
    
    console.log('\n📝 Последние 10 логов:');
    const logs = excelService.debugLogs.slice(-10);
    logs.forEach(log => {
      console.log(`[${log.timestamp}] ${log.message}`);
      if (log.data) {
        console.log(`  Данные: ${log.data}`);
      }
    });
    
  })
  .catch(error => {
    console.error('❌ Ошибка:', error.message);
  });
