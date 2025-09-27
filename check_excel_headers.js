const XLSX = require('xlsx');
const fs = require('fs');

function checkExcelHeaders(filePath) {
  try {
    console.log('🔍 Анализируем Excel файл:', filePath);
    
    if (!fs.existsSync(filePath)) {
      console.log('❌ Файл не найден:', filePath);
      return;
    }
    
    const workbook = XLSX.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    console.log('📊 Лист:', sheetName);
    
    // Получаем заголовки
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    const headers = [];
    
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
      const cell = worksheet[cellAddress];
      const header = cell ? cell.v : '';
      headers.push(header);
    }
    
    console.log('📋 Заголовки найдены:');
    headers.forEach((header, index) => {
      console.log(`  ${index}: "${header}"`);
    });
    
    // Проверяем ключевые заголовки
    const keyHeaders = {
      'amount': ['к оплате', 'сумма', 'amount', 'price', 'стоимость'],
      'customer': ['заказчик (имя)', 'имя', 'customer', 'name'],
      'address': ['адрес (адрес)', 'адрес', 'address'],
      'orderNumber': ['номер', '№', 'number', 'id'],
      'courier': ['курьер', 'courier'],
      'payment': ['способ оплаты', 'оплата', 'payment']
    };
    
    console.log('\n🔍 Анализ ключевых заголовков:');
    
    Object.entries(keyHeaders).forEach(([type, keywords]) => {
      const found = headers.find(header => 
        keywords.some(keyword => 
          header.toLowerCase().includes(keyword.toLowerCase())
        )
      );
      
      if (found) {
        console.log(`  ✅ ${type}: "${found}"`);
      } else {
        console.log(`  ❌ ${type}: НЕ НАЙДЕН`);
        console.log(`     Ищем: ${keywords.join(', ')}`);
      }
    });
    
    // Проверяем первую строку данных
    if (range.e.r > 0) {
      console.log('\n📊 Первая строка данных:');
      const firstRow = [];
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddress = XLSX.utils.encode_cell({ r: 1, c: col });
        const cell = worksheet[cellAddress];
        const value = cell ? cell.v : '';
        firstRow.push(value);
      }
      
      headers.forEach((header, index) => {
        console.log(`  "${header}": "${firstRow[index]}"`);
      });
    }
    
  } catch (error) {
    console.error('❌ Ошибка при анализе файла:', error.message);
  }
}

// Проверяем файл, если он передан как аргумент
const filePath = process.argv[2];
if (filePath) {
  checkExcelHeaders(filePath);
} else {
  console.log('📝 Использование: node check_excel_headers.js path/to/file.xlsx');
  console.log('📝 Пример: node check_excel_headers.js test_sample.xlsx');
}
