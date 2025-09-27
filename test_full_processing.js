// Полный тест обработки Excel данных

// Симулируем полную логику из ExcelService
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
      if (headerMap.orderNumber === undefined) headerMap.orderNumber = index;
    } else if (includesAny(noApostrophes, ['адреса', 'адрес', 'address', 'адрес доставки'])) {
      if (headerMap.address === undefined) headerMap.address = index;
    } else if (includesAny(noApostrophes, ['телефон', 'phone', 'моб', 'mobile'])) {
      if (headerMap.phone === undefined) headerMap.phone = index;
    } else if (includesAny(noApostrophes, ['курєр', 'курер', 'курьер', 'courier', 'доставщик'])) {
      if (headerMap.courier === undefined) headerMap.courier = index;
    } else if (includesAny(noApostrophes, ['оплата', 'способ оплаты', 'payment', 'оплат', 'сплата'])) {
      if (headerMap.paymentMethod === undefined) headerMap.paymentMethod = index;
    } else if (includesAny(noApostrophes, ['сума', 'сумма', 'amount', 'price', 'стоимость', 'вартість', 'сумма заказа', 'к оплате'])) {
      if (headerMap.amount === undefined) headerMap.amount = index;
    } else if (includesAny(noApostrophes, ['тип заказа', 'тип замовлення', 'order type'])) {
      if (headerMap.orderType === undefined) headerMap.orderType = index;
    } else if (includesAny(noApostrophes, ['имя', 'імя', 'name'])) {
      if (headerMap.customerName === undefined) headerMap.customerName = index;
    }
  });

  console.log('🗺️ Результат маппинга заголовков:', headerMap);
  return headerMap;
}

function processRow(row, headerMap, rowNumber) {
  console.log(`\n📊 Обработка строки ${rowNumber}:`);
  console.log('📋 Данные строки:', row);
  console.log('🗺️ Маппинг заголовков:', headerMap);
  
  // Визначаємо тип рядка на основі наявних даних
  const hasOrderNumber = headerMap.orderNumber !== undefined && row[headerMap.orderNumber] && row[headerMap.orderNumber].toString().trim() !== '';
  const hasAddress = headerMap.address !== undefined && row[headerMap.address] && row[headerMap.address].toString().trim() !== '';
  const hasCourier = headerMap.courier !== undefined && row[headerMap.courier] && row[headerMap.courier].toString().trim() !== '';
  const hasPaymentMethod = headerMap.paymentMethod !== undefined && row[headerMap.paymentMethod] && row[headerMap.paymentMethod].toString().trim() !== '';

  console.log(`📊 Анализ строки ${rowNumber}:`, {
    hasOrderNumber,
    hasAddress,
    hasCourier,
    hasPaymentMethod,
    orderNumber: hasOrderNumber ? row[headerMap.orderNumber] : 'нет',
    address: hasAddress ? row[headerMap.address] : 'нет',
    courier: hasCourier ? row[headerMap.courier] : 'нет',
    rawRow: row
  });

  if (hasAddress) {
    console.log(`✅ Строка ${rowNumber}: Определена как ЗАКАЗ (по адресу)`);
    return {
      type: 'order',
      data: {
        orderNumber: hasOrderNumber ? row[headerMap.orderNumber] : `ORDER_${rowNumber}`,
        address: row[headerMap.address],
        phone: headerMap.phone !== undefined ? row[headerMap.phone] : '',
        customerName: headerMap.customerName !== undefined ? row[headerMap.customerName] : '',
        orderType: headerMap.orderType !== undefined ? row[headerMap.orderType] : 'Доставка',
        paymentMethod: headerMap.paymentMethod !== undefined ? row[headerMap.paymentMethod] : 'Наличные',
        courier: headerMap.courier !== undefined ? row[headerMap.courier] : '',
        amount: headerMap.amount !== undefined ? row[headerMap.amount] : 0
      }
    };
  } else if (hasCourier && !hasAddress) {
    console.log(`✅ Строка ${rowNumber}: Определена как КУРЬЕР`);
    return {
      type: 'courier',
      data: {
        name: row[headerMap.courier],
        phone: headerMap.phone !== undefined ? row[headerMap.phone] : ''
      }
    };
  } else if (hasPaymentMethod && !hasAddress) {
    console.log(`✅ Строка ${rowNumber}: Определена как СПОСОБ ОПЛАТЫ`);
    return {
      type: 'payment',
      data: {
        name: row[headerMap.paymentMethod]
      }
    };
  } else {
    console.log(`❌ Строка ${rowNumber}: НЕ ОПРЕДЕЛЕНА - нет адреса`);
    return {
      type: 'error',
      data: null
    };
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
    // Знаходимо заголовки (перший рядок)
    const headers = data[0] || [];
    const headerMap = mapHeaders(headers);

    console.log(`📊 Обрабатываем ${data.length - 1} строк данных...`);
    
    // Обробляємо кожен рядок даних
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

    console.log(`\n📊 Результат обработки:`);
    console.log(`✅ Заказов: ${result.orders.length}`);
    console.log(`👥 Курьеров: ${result.couriers.length}`);
    console.log(`💳 Способов оплаты: ${result.paymentMethods.length}`);
    console.log(`❌ Ошибок: ${result.errors.length}`);

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

// Тестовые данные
const testData = [
  ['№', 'Адрес', 'Телефон', 'имя', 'Тип заказа', 'Способ оплаты', 'Курьер', 'Сумма заказа'],
  ['1', 'ул. Пушкина 1', '+380501234567', 'Иван', 'Доставка', 'Наличные', 'Курьер1', '100'],
  ['2', 'ул. Ленина 2', '+380507654321', 'Петр', 'Самовывоз', 'Карта', 'Курьер2', '200'],
  ['', '', '', '', '', '', 'Курьер3', ''], // Пустая строка
  ['3', '', '+380509876543', 'Сидор', 'Доставка', 'Наличные', '', '300'], // Без адреса
  ['4', 'ул. Гагарина 3', '+380501112233', 'Анна', 'Доставка', 'Наличные', 'Курьер1', '150']
];

console.log('🧪 Полный тест обработки Excel данных:');
console.log('📋 Тестовые данные:');
testData.forEach((row, i) => {
  console.log(`  ${i}: [${row.map(cell => `"${cell}"`).join(', ')}]`);
});

const result = processSheetData(testData, 'test');

console.log('\n🎯 ФИНАЛЬНЫЙ РЕЗУЛЬТАТ:');
console.log(JSON.stringify(result, null, 2));
