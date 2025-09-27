// Детальная диагностика Excel обработки
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

console.log('🔍 Детальная диагностика Excel обработки...\n');

// 1. Создаем тестовый Excel файл
const testData = [
  ['Номер заказа', 'Адрес', 'Курьер', 'Способ оплаты', 'Сумма'],
  ['001', 'ул. Крещатик 1, Киев', 'Иван Петров', 'Наличные', '500'],
  ['002', 'пр. Победы 10, Киев', 'Мария Сидорова', 'Карта', '750'],
  ['003', 'ул. Шевченко 5, Киев', 'Иван Петров', 'Наличные', '300']
];

const worksheet = XLSX.utils.aoa_to_sheet(testData);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Заказы');

const testFilePath = path.join(__dirname, 'test_detailed.xlsx');
XLSX.writeFile(workbook, testFilePath);

console.log('✅ Создан тестовый Excel файл:', testFilePath);

// 2. Тестируем ExcelService пошагово
try {
  const ExcelService = require('./backend/src/services/ExcelService');
  const excelService = new ExcelService();
  
  console.log('✅ ExcelService создан');
  
  // 3. Тестируем mapHeaders отдельно
  const headers = ['Номер заказа', 'Адрес', 'Курьер', 'Способ оплаты', 'Сумма'];
  console.log('\n🔍 Тестирование mapHeaders:');
  console.log('Входные заголовки:', headers);
  
  const headerMap = excelService.mapHeaders(headers);
  console.log('Результат mapHeaders:', headerMap);
  
  // 4. Тестируем processRow отдельно
  console.log('\n🔍 Тестирование processRow:');
  const testRow = ['001', 'ул. Крещатик 1, Киев', 'Иван Петров', 'Наличные', '500'];
  console.log('Тестовая строка:', testRow);
  
  try {
    const processedRow = excelService.processRow(testRow, headerMap, 2);
    console.log('Результат processRow:', processedRow);
  } catch (error) {
    console.log('❌ Ошибка в processRow:', error.message);
  }
  
  // 5. Тестируем полную обработку
  console.log('\n🔍 Тестирование полной обработки:');
  const buffer = fs.readFileSync(testFilePath);
  
  excelService.processExcelFile(buffer).then(result => {
    console.log('\n📊 Результат полной обработки:');
    console.log('Успех:', result.success);
    
    if (result.success && result.data) {
      const data = result.data;
      console.log('Заказы:', data.orders?.length || 0);
      console.log('Курьеры:', data.couriers?.length || 0);
      console.log('Способы оплаты:', data.paymentMethods?.length || 0);
      console.log('Ошибки:', data.errors?.length || 0);
      console.log('Предупреждения:', data.warnings?.length || 0);
      
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
      
      if (data.orders && data.orders.length > 0) {
        console.log('\n✅ Заказы:');
        data.orders.forEach((order, index) => {
          console.log(`  ${index + 1}. ${order.orderNumber} - ${order.address} (${order.courier})`);
        });
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
}, 10000);
