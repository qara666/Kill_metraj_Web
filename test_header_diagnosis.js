// Диагностика заголовков Excel файла

const XLSX = require('xlsx');
const fs = require('fs');

function mapHeaders(headers) {
  const headerMap = {};
  
  console.log('🔍 Анализ заголовков:');
  headers.forEach((header, index) => {
    if (!header) return;
    
    const normalizedHeader = header.toString().toLowerCase().trim();
    const noApostrophes = normalizedHeader.replace(/[''`]/g, '');
    
    console.log(`   ${index}: "${header}" -> "${normalizedHeader}"`);
    
    const includesAny = (s, arr) => arr.some(k => s.includes(k));

    // Номер заказа
    if (includesAny(noApostrophes, ['номер', 'номер заказа', 'номер замовлення', 'no', '№', 'number', 'order', 'id'])) {
      if (headerMap.orderNumber === undefined) {
        headerMap.orderNumber = index;
        console.log(`      ✅ Распознан как номер заказа`);
      }
    } 
    // Состояние/Статус
    else if (includesAny(noApostrophes, ['состояние', 'статус', 'status', 'state', 'статус заказа', 'состояние заказа'])) {
      if (headerMap.status === undefined) {
        headerMap.status = index;
        console.log(`      ✅ Распознан как статус`);
      }
    }
    // Тип заказа
    else if (includesAny(noApostrophes, ['тип заказа', 'тип замовлення', 'order type', 'типы заказов', 'order types', 'тип'])) {
      if (headerMap.orderType === undefined) {
        headerMap.orderType = index;
        console.log(`      ✅ Распознан как тип заказа`);
      }
    }
    // Телефон
    else if (includesAny(noApostrophes, ['телефон', 'phone', 'моб', 'mobile', 'телефоны', 'phones', 'контакт', 'contact', 'тел'])) {
      if (headerMap.phone === undefined) {
        headerMap.phone = index;
        console.log(`      ✅ Распознан как телефон`);
      }
    }
    // Имя заказчика
    else if (includesAny(noApostrophes, ['имя', 'імя', 'name', 'имена', 'names', 'клиент', 'client', 'заказчик', 'customer', 'заказчик имя', 'имя заказчика'])) {
      if (headerMap.customerName === undefined) {
        headerMap.customerName = index;
        console.log(`      ✅ Распознан как имя заказчика`);
      }
    }
    // Адрес
    else if (includesAny(noApostrophes, ['адрес', 'адреса', 'address', 'адрес доставки', 'location', 'место', 'місце', 'адреса доставки', 'адреса клиента', 'адрес адрес'])) {
      if (headerMap.address === undefined) {
        headerMap.address = index;
        console.log(`      ✅ Распознан как адрес`);
      }
    }
    // Способ оплаты
    else if (includesAny(noApostrophes, ['способ оплаты', 'payment method', 'оплата', 'payment', 'способ', 'метод оплаты', 'payment method', 'оплаты способ'])) {
      if (headerMap.paymentMethod === undefined) {
        headerMap.paymentMethod = index;
        console.log(`      ✅ Распознан как способ оплаты`);
      }
    }
    // Курьер
    else if (includesAny(noApostrophes, ['курьер', 'courier', 'курьеры', 'couriers', 'доставщик', 'курьер имя', 'имя курьера'])) {
      if (headerMap.courier === undefined) {
        headerMap.courier = index;
        console.log(`      ✅ Распознан как курьер`);
      }
    }
    // Сумма
    else if (includesAny(noApostrophes, ['к оплате', 'to pay', 'оплате', 'pay', 'сумма к оплате', 'к оплате сумма', 'сумма заказа', 'сумма', 'amount', 'price', 'стоимость', 'вартість', 'сумма заказа', 'суммы', 'amounts', 'prices'])) {
      if (headerMap.amount === undefined) {
        headerMap.amount = index;
        console.log(`      ✅ Распознан как сумма`);
      }
    }
    else {
      console.log(`      ❌ Не распознан`);
    }
  });

  console.log('\n📊 Результат распознавания:');
  console.log(`   Номер заказа: ${headerMap.orderNumber !== undefined ? `колонка ${headerMap.orderNumber}` : 'НЕ НАЙДЕН'}`);
  console.log(`   Статус: ${headerMap.status !== undefined ? `колонка ${headerMap.status}` : 'НЕ НАЙДЕН'}`);
  console.log(`   Тип заказа: ${headerMap.orderType !== undefined ? `колонка ${headerMap.orderType}` : 'НЕ НАЙДЕН'}`);
  console.log(`   Телефон: ${headerMap.phone !== undefined ? `колонка ${headerMap.phone}` : 'НЕ НАЙДЕН'}`);
  console.log(`   Имя заказчика: ${headerMap.customerName !== undefined ? `колонка ${headerMap.customerName}` : 'НЕ НАЙДЕН'}`);
  console.log(`   Адрес: ${headerMap.address !== undefined ? `колонка ${headerMap.address}` : 'НЕ НАЙДЕН'}`);
  console.log(`   Способ оплаты: ${headerMap.paymentMethod !== undefined ? `колонка ${headerMap.paymentMethod}` : 'НЕ НАЙДЕН'}`);
  console.log(`   Курьер: ${headerMap.courier !== undefined ? `колонка ${headerMap.courier}` : 'НЕ НАЙДЕН'}`);
  console.log(`   Сумма: ${headerMap.amount !== undefined ? `колонка ${headerMap.amount}` : 'НЕ НАЙДЕН'}`);

  return headerMap;
}

async function testHeaderDiagnosis() {
  console.log('🔍 ДИАГНОСТИКА ЗАГОЛОВКОВ EXCEL ФАЙЛА...\n');
  
  // Проверяем существующие файлы
  const testFiles = ['test_real.xlsx', 'test.xlsx', 'sample.xlsx'];
  let excelFile = null;
  
  for (const file of testFiles) {
    if (fs.existsSync(file)) {
      excelFile = file;
      break;
    }
  }
  
  if (!excelFile) {
    console.log('❌ Excel файл не найден. Создаем тестовый файл с разными вариантами заголовков...');
    
    // Создаем файл с разными вариантами заголовков
    const testData = [
      ['№', 'Статус', 'Тип', 'Телефон', 'Клиент', 'Адрес', 'Оплата', 'Курьер', 'Сумма'],
      ['1', 'Новый', 'Доставка', '+380501234567', 'Иван', 'Киев, ул. Тестовая, 1', 'Наличные', 'Петр', '100'],
      ['2', 'Выполнен', 'Самовывоз', '+380507654321', 'Мария', 'Киев, ул. Другая, 2', 'Карта', 'Анна', '200']
    ];
    
    const worksheet = XLSX.utils.aoa_to_sheet(testData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders');
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    fs.writeFileSync('test_headers.xlsx', excelBuffer);
    excelFile = 'test_headers.xlsx';
    console.log('✅ Создан тестовый файл: test_headers.xlsx');
  }
  
  console.log(`📁 Используем файл: ${excelFile}`);
  
  try {
    // Читаем Excel файл
    const buffer = fs.readFileSync(excelFile);
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    
    console.log(`📋 Листы: ${workbook.SheetNames.join(', ')}`);
    
    // Анализируем каждый лист
    for (const sheetName of workbook.SheetNames) {
      console.log(`\n🔍 Анализ листа: "${sheetName}"`);
      
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      
      console.log(`   📊 Строк: ${data.length}`);
      console.log(`   📋 Заголовки: ${data[0] ? data[0].length : 0}`);
      
      if (data.length > 0) {
        console.log(`   📝 Заголовки: ${JSON.stringify(data[0])}`);
        
        // Анализируем заголовки
        const headerMap = mapHeaders(data[0]);
        
        // Проверяем наличие адресов
        const hasAddress = headerMap.address !== undefined;
        console.log(`\n🏠 Есть колонка с адресами: ${hasAddress}`);
        
        if (!hasAddress) {
          console.log('❌ ПРОБЛЕМА: Нет колонки с адресами!');
          console.log('🔍 Возможные решения:');
          console.log('   - Проверьте, что в Excel файле есть колонка с названием "Адрес"');
          console.log('   - Или "Адреса", "Address", "Location"');
          console.log('   - Или "Адрес доставки", "Адреса клиентов"');
        }
        
        // Проверяем данные
        const dataRows = data.slice(1).filter(row => 
          row.some(cell => cell && cell.toString().trim() !== '')
        );
        console.log(`\n📊 Строк с данными: ${dataRows.length}`);
        
        if (dataRows.length > 0) {
          console.log(`   📝 Пример данных:`);
          dataRows.slice(0, 2).forEach((row, i) => {
            console.log(`      Строка ${i + 2}: ${JSON.stringify(row)}`);
          });
          
          // Проверяем адреса в данных
          if (headerMap.address !== undefined) {
            const addressColumn = headerMap.address;
            const addresses = dataRows.map(row => row[addressColumn]).filter(addr => addr && addr.toString().trim() !== '');
            console.log(`\n🏠 Адреса в данных: ${addresses.length}`);
            if (addresses.length > 0) {
              console.log(`   📍 Примеры адресов:`);
              addresses.slice(0, 3).forEach((addr, i) => {
                console.log(`      ${i + 1}. ${addr}`);
              });
            } else {
              console.log('❌ ПРОБЛЕМА: Все ячейки адресов пустые!');
            }
          }
        } else {
          console.log('❌ ПРОБЛЕМА: Нет данных в файле!');
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Ошибка диагностики:', error);
  }
}

testHeaderDiagnosis();
