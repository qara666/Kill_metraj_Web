// Диагностика проблемы с Excel обработкой
const fs = require('fs');
const path = require('path');

// Создаем простой тестовый Excel файл
const XLSX = require('xlsx');

console.log('🔍 Диагностика Excel обработки...\n');

// 1. Создаем тестовый Excel файл с простыми данными
const testData = [
  ['Номер заказа', 'Адрес', 'Курьер', 'Способ оплаты', 'Сумма'],
  ['001', 'ул. Крещатик 1, Киев', 'Иван Петров', 'Наличные', '500'],
  ['002', 'пр. Победы 10, Киев', 'Мария Сидорова', 'Карта', '750'],
  ['003', 'ул. Шевченко 5, Киев', 'Иван Петров', 'Наличные', '300']
];

const worksheet = XLSX.utils.aoa_to_sheet(testData);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Заказы');

const testFilePath = path.join(__dirname, 'test_simple.xlsx');
XLSX.writeFile(workbook, testFilePath);

console.log('✅ Создан тестовый Excel файл:', testFilePath);

// 2. Тестируем чтение файла
try {
  const buffer = fs.readFileSync(testFilePath);
  console.log('✅ Файл прочитан, размер:', buffer.length, 'байт');
  
  // 3. Тестируем парсинг
  const workbook2 = XLSX.read(buffer, { type: 'buffer' });
  console.log('✅ Excel файл распарсен');
  console.log('📊 Листы:', workbook2.SheetNames);
  
  const worksheet2 = workbook2.Sheets[workbook2.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(worksheet2, { header: 1, defval: '' });
  
  console.log('📊 Данные:');
  console.log('Количество строк:', data.length);
  console.log('Заголовки:', data[0]);
  console.log('Первая строка данных:', data[1]);
  
  // 4. Тестируем маппинг заголовков
  const headers = data[0] || [];
  console.log('\n🔍 Анализ заголовков:');
  
  const headerMap = {
    orderNumber: null,
    address: null,
    courier: null,
    paymentMethod: null,
    amount: null
  };
  
  // Простой маппинг
  headers.forEach((header, index) => {
    const headerLower = header.toString().toLowerCase();
    if (headerLower.includes('номер') || headerLower.includes('заказ')) {
      headerMap.orderNumber = index;
    }
    if (headerLower.includes('адрес')) {
      headerMap.address = index;
    }
    if (headerLower.includes('курьер')) {
      headerMap.courier = index;
    }
    if (headerLower.includes('оплат') || headerLower.includes('способ')) {
      headerMap.paymentMethod = index;
    }
    if (headerLower.includes('сумм')) {
      headerMap.amount = index;
    }
  });
  
  console.log('📋 Маппинг заголовков:', headerMap);
  
  // 5. Тестируем обработку строк
  console.log('\n🔍 Обработка строк:');
  let processedOrders = 0;
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    console.log(`Строка ${i}:`, row);
    
    // Проверяем, есть ли адрес
    const address = row[headerMap.address];
    if (address && address.toString().trim()) {
      processedOrders++;
      console.log(`  ✅ Заказ найден: ${row[headerMap.orderNumber]} - ${address}`);
    } else {
      console.log(`  ❌ Строка пропущена: нет адреса`);
    }
  }
  
  console.log(`\n📊 Результат: ${processedOrders} заказов обработано из ${data.length - 1} строк`);
  
} catch (error) {
  console.error('❌ Ошибка:', error.message);
}

// 6. Тестируем ExcelService
console.log('\n🔍 Тестирование ExcelService...');
try {
  const ExcelService = require('./backend/src/services/ExcelService');
  const excelService = new ExcelService();
  
  const buffer = fs.readFileSync(testFilePath);
  console.log('✅ ExcelService создан, тестируем обработку...');
  
  excelService.processExcelFile(buffer).then(result => {
    console.log('📊 Результат ExcelService:');
    console.log('Заказы:', result.orders?.length || 0);
    console.log('Курьеры:', result.couriers?.length || 0);
    console.log('Способы оплаты:', result.paymentMethods?.length || 0);
    console.log('Ошибки:', result.errors?.length || 0);
    console.log('Предупреждения:', result.warnings?.length || 0);
    
    if (result.debug) {
      console.log('\n🔍 Отладочная информация:');
      console.log('Листы:', result.debug.sheets);
      console.log('Всего строк:', result.debug.totalRows);
      console.log('Обработано строк:', result.debug.processedRows);
    }
    
    if (result.errors && result.errors.length > 0) {
      console.log('\n❌ Ошибки:');
      result.errors.forEach(error => console.log('  -', error));
    }
    
    if (result.warnings && result.warnings.length > 0) {
      console.log('\n⚠️ Предупреждения:');
      result.warnings.forEach(warning => console.log('  -', warning));
    }
    
  }).catch(error => {
    console.error('❌ Ошибка ExcelService:', error.message);
  });
  
} catch (error) {
  console.error('❌ Ошибка создания ExcelService:', error.message);
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
