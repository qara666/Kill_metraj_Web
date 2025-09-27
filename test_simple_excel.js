// Простой тест Excel обработки без API
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

console.log('🔍 Простой тест Excel обработки...\n');

// 1. Создаем тестовый Excel файл
const testData = [
  ['№', 'Адрес', 'Курьер', 'Способ оплаты', 'Сумма', 'Телефон', 'Имя клиента'],
  ['001', 'ул. Крещатик 1, Киев', 'Иван Петров', 'Наличные', '500', '+380501234567', 'Петр Иванов'],
  ['002', 'пр. Победы 10, Киев', 'Мария Сидорова', 'Карта', '750', '+380509876543', 'Анна Петрова'],
  ['003', 'ул. Шевченко 5, Киев', 'Иван Петров', 'Наличные', '300', '+380501112233', 'Сергей Козлов']
];

const worksheet = XLSX.utils.aoa_to_sheet(testData);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Заказы');

const testFilePath = path.join(__dirname, 'test_simple.xlsx');
XLSX.writeFile(workbook, testFilePath);

console.log('✅ Создан тестовый Excel файл:', testFilePath);

// 2. Тестируем ExcelService напрямую
try {
  const ExcelService = require('./backend/src/services/ExcelService');
  const excelService = new ExcelService();
  
  console.log('✅ ExcelService создан');
  
  const buffer = fs.readFileSync(testFilePath);
  console.log('✅ Файл прочитан, размер:', buffer.length, 'байт');
  
  excelService.processExcelFile(buffer).then(result => {
    console.log('\n📊 Результат обработки:');
    console.log('Успех:', result.success);
    
    if (result.success && result.data) {
      const data = result.data;
      console.log('\n📈 Статистика:');
      console.log('Заказы:', data.orders?.length || 0);
      console.log('Курьеры:', data.couriers?.length || 0);
      console.log('Способы оплаты:', data.paymentMethods?.length || 0);
      console.log('Ошибки:', data.errors?.length || 0);
      console.log('Предупреждения:', data.warnings?.length || 0);
      
      if (result.summary) {
        console.log('\n📋 Сводка:');
        console.log('Всего заказов:', result.summary.totalOrders);
        console.log('Всего курьеров:', result.summary.totalCouriers);
        console.log('Всего способов оплаты:', result.summary.totalPaymentMethods);
      }
      
      if (data.orders && data.orders.length > 0) {
        console.log('\n✅ Заказы:');
        data.orders.forEach((order, index) => {
          console.log(`  ${index + 1}. ${order.orderNumber} - ${order.address}`);
          console.log(`     Курьер: ${order.courier}, Оплата: ${order.paymentMethod}, Сумма: ${order.amount}`);
        });
      } else {
        console.log('\n❌ Заказы не найдены!');
        
        if (data.debug) {
          console.log('\n🔍 Отладочная информация:');
          console.log('Листы:', data.debug.sheets);
          console.log('Всего строк:', data.debug.totalRows);
          console.log('Обработано строк:', data.debug.processedRows);
          console.log('Маппинг заголовков:', data.debug.headerMap);
        }
        
        if (data.errors && data.errors.length > 0) {
          console.log('\n❌ Ошибки:');
          data.errors.forEach(error => console.log('  -', error));
        }
        
        if (data.warnings && data.warnings.length > 0) {
          console.log('\n⚠️ Предупреждения:');
          data.warnings.forEach(warning => console.log('  -', warning));
        }
      }
    } else {
      console.log('❌ Ошибка обработки:', result.error);
    }
    
  }).catch(error => {
    console.error('❌ Ошибка ExcelService:', error.message);
    console.error('Stack:', error.stack);
  });
  
} catch (error) {
  console.error('❌ Ошибка создания ExcelService:', error.message);
  console.error('Stack:', error.stack);
}

// Очистка
setTimeout(() => {
  try {
    fs.unlinkSync(testFilePath);
    console.log('\n🧹 Тестовый файл удален');
  } catch (e) {
    console.log('\n⚠️ Не удалось удалить тестовый файл');
  }
}, 5000);