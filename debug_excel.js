const XLSX = require('xlsx');
const fs = require('fs');

// Читаем тестовый файл
const testFile = './test_real_headers.xlsx';

if (!fs.existsSync(testFile)) {
  console.log('❌ Файл test_real_headers.xlsx не найден');
  console.log('Создайте тестовый файл или укажите путь к вашему Excel файлу');
  process.exit(1);
}

console.log('🔍 Анализ Excel файла...');

try {
  const workbook = XLSX.readFile(testFile);
  
  console.log('\n📊 Информация о файле:');
  console.log(`Листов: ${workbook.SheetNames.length}`);
  console.log(`Названия листов: ${workbook.SheetNames.join(', ')}`);
  
  // Анализируем первый лист
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  
  console.log(`\n📋 Анализ листа "${sheetName}":`);
  
  // Конвертируем в JSON
  const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
  
  console.log(`Всего строк: ${jsonData.length}`);
  
  if (jsonData.length > 0) {
    const headers = jsonData[0];
    console.log(`\n📝 Заголовки (${headers.length}):`);
    headers.forEach((header, index) => {
      console.log(`  ${index}: "${header}"`);
    });
    
    console.log(`\n📄 Первые 3 строки данных:`);
    for (let i = 1; i <= Math.min(3, jsonData.length - 1); i++) {
      const row = jsonData[i];
      console.log(`\nСтрока ${i + 1}:`);
      row.forEach((cell, colIndex) => {
        if (cell !== undefined && cell !== '') {
          console.log(`  ${headers[colIndex]}: "${cell}"`);
        }
      });
    }
    
    // Анализ маппинга заголовков
    console.log(`\n🔍 Анализ маппинга заголовков:`);
    
    const headerMap = {};
    headers.forEach((header, index) => {
      if (!header) return;
      
      const normalizedHeader = header.toString().toLowerCase().trim();
      const noApostrophes = normalizedHeader.replace(/['"]/g, '');
      
      // Проверяем каждый тип заголовка
      if (noApostrophes.includes('заказчик') || noApostrophes.includes('клиент') || noApostrophes.includes('имя')) {
        headerMap.customerName = index;
        console.log(`✅ Имя клиента: "${header}" (колонка ${index})`);
      }
      if (noApostrophes.includes('сумма') || noApostrophes.includes('amount') || noApostrophes.includes('стоимость')) {
        headerMap.amount = index;
        console.log(`✅ Сумма: "${header}" (колонка ${index})`);
      }
      if (noApostrophes.includes('номер') || noApostrophes.includes('№') || noApostrophes.includes('заказ')) {
        headerMap.orderNumber = index;
        console.log(`✅ Номер заказа: "${header}" (колонка ${index})`);
      }
      if (noApostrophes.includes('адрес') || noApostrophes.includes('address')) {
        headerMap.address = index;
        console.log(`✅ Адрес: "${header}" (колонка ${index})`);
      }
      if (noApostrophes.includes('курьер') || noApostrophes.includes('courier')) {
        headerMap.courier = index;
        console.log(`✅ Курьер: "${header}" (колонка ${index})`);
      }
      if (noApostrophes.includes('оплаты') || noApostrophes.includes('payment')) {
        headerMap.paymentMethod = index;
        console.log(`✅ Способ оплаты: "${header}" (колонка ${index})`);
      }
      if (noApostrophes.includes('телефон') || noApostrophes.includes('phone')) {
        headerMap.phone = index;
        console.log(`✅ Телефон: "${header}" (колонка ${index})`);
      }
    });
    
    console.log(`\n📋 Найденные маппинги:`, headerMap);
    
    // Проверяем валидность строк
    console.log(`\n🔍 Проверка валидности строк:`);
    let validRows = 0;
    
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      const hasAddress = headerMap.address !== undefined && row[headerMap.address];
      const hasCourier = headerMap.courier !== undefined && row[headerMap.courier];
      const hasPaymentMethod = headerMap.paymentMethod !== undefined && row[headerMap.paymentMethod];
      
      if (hasAddress && hasCourier && hasPaymentMethod) {
        validRows++;
        console.log(`✅ Строка ${i + 1} валидна`);
      } else {
        console.log(`❌ Строка ${i + 1} не валидна:`, {
          hasAddress: !!hasAddress,
          hasCourier: !!hasCourier,
          hasPaymentMethod: !!hasPaymentMethod,
          addressValue: row[headerMap.address] || '',
          courierValue: row[headerMap.courier] || '',
          paymentValue: row[headerMap.paymentMethod] || ''
        });
      }
    }
    
    console.log(`\n📊 Результат: ${validRows} валидных строк из ${jsonData.length - 1} строк данных`);
    
  } else {
    console.log('❌ Лист пуст');
  }
  
} catch (error) {
  console.error('❌ Ошибка:', error.message);
}
