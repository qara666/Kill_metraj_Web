// Финальный тест с полной диагностикой

function mapHeaders(headers) {
  const headerMap = {};
  
  console.log('🔍 Анализ заголовков Excel файла:');
  console.log('📋 Исходные заголовки:', headers);
  
  headers.forEach((header, index) => {
    if (!header) return;
    
    const normalizedHeader = header.toString().toLowerCase().trim();
    const noApostrophes = normalizedHeader.replace(/[''`]/g, '');
    
    console.log(`  ${index}: "${header}" -> "${normalizedHeader}" -> "${noApostrophes}"`);
    
    const includesAny = (s, arr) => arr.some(k => s.includes(k));

    if (includesAny(noApostrophes, ['номер', 'номер заказа', 'номер замовлення', 'no', '№', 'number', 'order', 'id'])) {
      if (headerMap.orderNumber === undefined) {
        headerMap.orderNumber = index;
        console.log(`    ✅ Распознан как orderNumber: ${index}`);
      }
    } else if (includesAny(noApostrophes, ['адреса', 'адрес', 'address', 'адрес доставки', 'location', 'место', 'місце', 'адреса доставки', 'адреса клиента'])) {
      if (headerMap.address === undefined) {
        headerMap.address = index;
        console.log(`    ✅ Распознан как address: ${index}`);
      }
    } else if (includesAny(noApostrophes, ['телефон', 'phone', 'моб', 'mobile', 'телефоны', 'phones', 'контакт', 'contact'])) {
      if (headerMap.phone === undefined) {
        headerMap.phone = index;
        console.log(`    ✅ Распознан как phone: ${index}`);
      }
    } else if (includesAny(noApostrophes, ['курєр', 'курер', 'курьер', 'courier', 'доставщик', 'курьеры', 'couriers'])) {
      if (headerMap.courier === undefined) {
        headerMap.courier = index;
        console.log(`    ✅ Распознан как courier: ${index}`);
      }
    } else if (includesAny(noApostrophes, ['оплата', 'способ оплаты', 'payment', 'оплат', 'сплата', 'способ', 'метод оплаты', 'payment method'])) {
      if (headerMap.paymentMethod === undefined) {
        headerMap.paymentMethod = index;
        console.log(`    ✅ Распознан как paymentMethod: ${index}`);
      }
    } else if (includesAny(noApostrophes, ['сума', 'сумма', 'amount', 'price', 'стоимость', 'вартість', 'сумма заказа', 'к оплате', 'суммы', 'amounts', 'prices'])) {
      if (headerMap.amount === undefined) {
        headerMap.amount = index;
        console.log(`    ✅ Распознан как amount: ${index}`);
      }
    } else if (includesAny(noApostrophes, ['тип заказа', 'тип замовлення', 'order type', 'типы заказов', 'order types'])) {
      if (headerMap.orderType === undefined) {
        headerMap.orderType = index;
        console.log(`    ✅ Распознан как orderType: ${index}`);
      }
    } else if (includesAny(noApostrophes, ['имя', 'імя', 'name', 'имена', 'names', 'клиент', 'client', 'заказчик', 'customer'])) {
      if (headerMap.customerName === undefined) {
        headerMap.customerName = index;
        console.log(`    ✅ Распознан как customerName: ${index}`);
      }
    } else {
      console.log(`    ❌ НЕ РАСПОЗНАН: "${noApostrophes}"`);
    }
  });

  console.log('🗺️ Результат маппинга заголовков:', headerMap);
  return headerMap;
}

function processRow(row, headerMap, rowNumber) {
  const hasOrderNumber = headerMap.orderNumber !== undefined && row[headerMap.orderNumber] && row[headerMap.orderNumber].toString().trim() !== '';
  const hasAddress = headerMap.address !== undefined && row[headerMap.address] && row[headerMap.address].toString().trim() !== '';
  const hasCourier = headerMap.courier !== undefined && row[headerMap.courier] && row[headerMap.courier].toString().trim() !== '';
  const hasPaymentMethod = headerMap.paymentMethod !== undefined && row[headerMap.paymentMethod] && row[headerMap.paymentMethod].toString().trim() !== '';

  console.log(`📊 Строка ${rowNumber}:`, {
    hasOrderNumber,
    hasAddress,
    hasCourier,
    hasPaymentMethod,
    orderNumber: hasOrderNumber ? row[headerMap.orderNumber] : 'нет',
    address: hasAddress ? row[headerMap.address] : 'нет',
    courier: hasCourier ? row[headerMap.courier] : 'нет',
    addressValue: hasAddress ? `"${row[headerMap.address]}"` : 'НЕТ',
    addressIndex: headerMap.address
  });

  if (hasAddress) {
    console.log(`✅ Строка ${rowNumber}: ЗАКАЗ`);
    return { type: 'order', data: { address: row[headerMap.address] } };
  } else {
    console.log(`❌ Строка ${rowNumber}: НЕ ЗАКАЗ (нет адреса)`);
    return { type: 'error', data: null };
  }
}

function processSheetData(data, sheetName) {
  const result = {
    orders: [],
    couriers: [],
    paymentMethods: [],
    routes: [],
    errors: [],
    warnings: []
  };

  console.log(`\n📊 Обрабатываем лист "${sheetName}" с ${data.length} строками`);

  try {
    const headers = data[0] || [];
    const headerMap = mapHeaders(headers);

    console.log(`📊 Обрабатываем ${data.length - 1} строк данных...`);
    
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row || row.length === 0) continue;

      try {
        const processedRow = processRow(row, headerMap, i + 1);
        
        if (processedRow.type === 'order') {
          result.orders.push(processedRow.data);
        } else if (processedRow.type === 'courier') {
          result.couriers.push(processedRow.data);
        } else if (processedRow.type === 'payment') {
          result.paymentMethods.push(processedRow.data);
        } else if (processedRow.type === 'error') {
          result.errors.push(`Строка ${i + 1}: Нет адреса`);
        }
      } catch (rowError) {
        console.log(`❌ Ошибка в строке ${i + 1}: ${rowError.message}`);
        result.errors.push(`Строка ${i + 1}: ${rowError.message}`);
      }
    }

    console.log(`\n📈 Результаты обработки листа: заказов=${result.orders.length}, курьеров=${result.couriers.length}, способов оплаты=${result.paymentMethods.length}, ошибок=${result.errors.length}`);
    
    // Дополнительная диагностика
    if (result.orders.length === 0) {
      console.log(`\n⚠️  ДИАГНОСТИКА: Заказы не созданы!`);
      console.log(`📍 Есть колонка адресов: ${headerMap.address !== undefined ? 'ДА' : 'НЕТ'} (индекс: ${headerMap.address})`);
      console.log(`🔢 Есть колонка номеров: ${headerMap.orderNumber !== undefined ? 'ДА' : 'НЕТ'} (индекс: ${headerMap.orderNumber})`);
      console.log(`📋 Всего строк данных: ${data.length - 1}`);
      
      if (headerMap.address === undefined) {
        console.log(`❌ ПРОБЛЕМА: Нет колонки с адресами! Проверьте названия заголовков.`);
        console.log(`💡 РЕШЕНИЕ: Убедитесь, что в Excel файле есть колонка с названием: "Адрес", "Адреса", "Address", "Адрес доставки"`);
      } else {
        console.log(`❌ ПРОБЛЕМА: Колонка адресов есть, но все ячейки пустые или содержат только пробелы.`);
        console.log(`💡 РЕШЕНИЕ: Заполните колонку адресов данными в Excel файле`);
      }
    }

    return result;

  } catch (error) {
    console.error('❌ Ошибка обработки Excel файла:', error);
    return {
      success: false,
      error: error.message,
      data: null
    };
  }
}

// Тестовые случаи
const testCases = [
  {
    name: "Проблемный случай 1: Нет колонки адресов",
    data: [
      ['ID', 'Name', 'Phone', 'Type'],
      ['1', 'Иван', '+380501234567', 'Доставка'],
      ['2', 'Петр', '+380507654321', 'Самовывоз']
    ]
  },
  {
    name: "Проблемный случай 2: Пустые адреса",
    data: [
      ['№', 'Адрес', 'Телефон', 'имя'],
      ['1', '', '+380501234567', 'Иван'],
      ['2', '   ', '+380507654321', 'Петр'],
      ['3', null, '+380509876543', 'Сидор']
    ]
  },
  {
    name: "Проблемный случай 3: Только заголовки",
    data: [
      ['№', 'Адрес', 'Телефон', 'имя']
    ]
  },
  {
    name: "Рабочий случай: Правильные данные",
    data: [
      ['№', 'Адрес', 'Телефон', 'имя'],
      ['1', 'ул. Пушкина 1', '+380501234567', 'Иван'],
      ['2', 'ул. Ленина 2', '+380507654321', 'Петр']
    ]
  }
];

console.log('🧪 ФИНАЛЬНЫЙ ТЕСТ С ДИАГНОСТИКОЙ:\n');

testCases.forEach((testCase, index) => {
  console.log(`\n${index + 1}. ${testCase.name}`);
  console.log('='.repeat(80));
  
  const result = processSheetData(testCase.data, 'test');
  
  console.log(`\n🎯 ИТОГОВЫЙ РЕЗУЛЬТАТ:`);
  console.log(`✅ Заказов: ${result.orders.length}`);
  console.log(`👥 Курьеров: ${result.couriers.length}`);
  console.log(`💳 Способов оплаты: ${result.paymentMethods.length}`);
  console.log(`❌ Ошибок: ${result.errors.length}`);
  
  if (result.orders.length === 0) {
    console.log('❌ ПРОБЛЕМА: Заказы не создаются!');
  } else {
    console.log('✅ ОК: Заказы создаются!');
  }
});

console.log('\n🎯 РЕКОМЕНДАЦИИ ДЛЯ ИСПРАВЛЕНИЯ:');
console.log('1. Проверьте названия колонок в Excel файле');
console.log('2. Убедитесь, что есть колонка с адресами (название: "Адрес", "Адреса", "Address")');
console.log('3. Заполните колонку адресов данными');
console.log('4. Используйте debug endpoints для диагностики на сервере');
console.log('5. Проверьте логи обработки через /debug/logs');
