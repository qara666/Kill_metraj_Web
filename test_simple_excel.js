// Простой тест Excel обработки без GoogleMapsService

// Копируем логику из ExcelService_clean но без зависимостей
function mapHeaders(headers) {
  const headerMap = {};
  
  headers.forEach((header, index) => {
    if (!header) return;
    
    const normalizedHeader = header.toString().toLowerCase().trim();
    const noApostrophes = normalizedHeader.replace(/[''`]/g, '');
    
    const includesAny = (s, arr) => arr.some(k => s.includes(k));

    if (includesAny(noApostrophes, ['номер', 'номер заказа', 'номер замовлення', 'no', '№', 'number', 'order', 'id'])) {
      if (headerMap.orderNumber === undefined) headerMap.orderNumber = index;
    } else if (includesAny(noApostrophes, ['адреса', 'адрес', 'address', 'адрес доставки', 'location', 'место', 'місце', 'адреса доставки', 'адреса клиента'])) {
      if (headerMap.address === undefined) headerMap.address = index;
    } else if (includesAny(noApostrophes, ['телефон', 'phone', 'моб', 'mobile', 'телефоны', 'phones', 'контакт', 'contact'])) {
      if (headerMap.phone === undefined) headerMap.phone = index;
    } else if (includesAny(noApostrophes, ['курєр', 'курер', 'курьер', 'courier', 'доставщик', 'курьеры', 'couriers'])) {
      if (headerMap.courier === undefined) headerMap.courier = index;
    } else if (includesAny(noApostrophes, ['оплата', 'способ оплаты', 'payment', 'оплат', 'сплата', 'способ', 'метод оплаты', 'payment method'])) {
      if (headerMap.paymentMethod === undefined) headerMap.paymentMethod = index;
    } else if (includesAny(noApostrophes, ['сума', 'сумма', 'amount', 'price', 'стоимость', 'вартість', 'сумма заказа', 'к оплате', 'суммы', 'amounts', 'prices'])) {
      if (headerMap.amount === undefined) headerMap.amount = index;
    } else if (includesAny(noApostrophes, ['тип заказа', 'тип замовлення', 'order type', 'типы заказов', 'order types'])) {
      if (headerMap.orderType === undefined) headerMap.orderType = index;
    } else if (includesAny(noApostrophes, ['имя', 'імя', 'name', 'имена', 'names', 'клиент', 'client', 'заказчик', 'customer'])) {
      if (headerMap.customerName === undefined) headerMap.customerName = index;
    }
  });

  return headerMap;
}

function processRow(row, headerMap, rowNumber) {
  const hasOrderNumber = headerMap.orderNumber !== undefined && row[headerMap.orderNumber] && row[headerMap.orderNumber].toString().trim() !== '';
  const hasAddress = headerMap.address !== undefined && row[headerMap.address] && row[headerMap.address].toString().trim() !== '';
  const hasCourier = headerMap.courier !== undefined && row[headerMap.courier] && row[headerMap.courier].toString().trim() !== '';
  const hasPaymentMethod = headerMap.paymentMethod !== undefined && row[headerMap.paymentMethod] && row[headerMap.paymentMethod].toString().trim() !== '';

  console.log(`Строка ${rowNumber}:`, {
    hasOrderNumber,
    hasAddress,
    hasCourier,
    hasPaymentMethod,
    orderNumber: hasOrderNumber ? row[headerMap.orderNumber] : 'нет',
    address: hasAddress ? row[headerMap.address] : 'нет',
    courier: hasCourier ? row[headerMap.courier] : 'нет',
    addressIndex: headerMap.address,
    rawRow: row
  });

  if (hasAddress) {
    return {
      type: 'order',
      data: {
        orderNumber: headerMap.orderNumber !== undefined ? row[headerMap.orderNumber] : `ORDER_${rowNumber}`,
        address: row[headerMap.address],
        phone: headerMap.phone !== undefined ? row[headerMap.phone] : '',
        customerName: headerMap.customerName !== undefined ? row[headerMap.customerName] : '',
        orderType: headerMap.orderType !== undefined ? row[headerMap.orderType] : 'Доставка',
        paymentMethod: headerMap.paymentMethod !== undefined ? row[headerMap.paymentMethod] : 'Наличные',
        courier: headerMap.courier !== undefined ? row[headerMap.courier] : '',
        amount: headerMap.amount !== undefined ? parseFloat(row[headerMap.amount]) || 0 : 0
      }
    };
  } else if (hasCourier && !hasAddress) {
    return {
      type: 'courier',
      data: {
        name: row[headerMap.courier],
        phone: headerMap.phone !== undefined ? row[headerMap.phone] : ''
      }
    };
  } else if (hasPaymentMethod && !hasAddress) {
    return {
      type: 'payment',
      data: {
        name: row[headerMap.paymentMethod]
      }
    };
  } else {
    throw new Error('Неможливо визначити тип рядка — перевірте заголовки та дані');
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

  try {
    const headers = data[0] || [];
    const headerMap = mapHeaders(headers);
    
    console.log('Заголовки:', headers);
    console.log('Маппинг:', headerMap);
    
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
        } else if (processedRow.type === 'route') {
          result.routes.push(processedRow.data);
        }
      } catch (rowError) {
        result.errors.push(`Рядок ${i + 1}: ${rowError.message}`);
      }
    }

  } catch (error) {
    result.errors.push(`Лист "${sheetName}": ${error.message}`);
  }

  return result;
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

console.log('🧪 Тестируем обработку Excel данных...\n');

console.log('📋 Тестовые данные:');
testData.forEach((row, i) => {
  console.log(`  ${i}: [${row.map(cell => `"${cell}"`).join(', ')}]`);
});

console.log('\n📊 Обрабатываем данные...');

const result = processSheetData(testData, 'test');

console.log('\n🎯 РЕЗУЛЬТАТ:');
console.log(`✅ Заказов: ${result.orders.length}`);
console.log(`👥 Курьеров: ${result.couriers.length}`);
console.log(`💳 Способов оплаты: ${result.paymentMethods.length}`);
console.log(`❌ Ошибок: ${result.errors.length}`);

if (result.orders.length > 0) {
  console.log('\n📋 Детали заказов:');
  result.orders.forEach((order, i) => {
    console.log(`  ${i + 1}. ${order.orderNumber} - ${order.address} (${order.customerName})`);
  });
}

if (result.couriers.length > 0) {
  console.log('\n👥 Курьеры:');
  result.couriers.forEach((courier, i) => {
    console.log(`  ${i + 1}. ${courier.name}`);
  });
}

if (result.paymentMethods.length > 0) {
  console.log('\n💳 Способы оплаты:');
  result.paymentMethods.forEach((payment, i) => {
    console.log(`  ${i + 1}. ${payment.name}`);
  });
}

if (result.errors.length > 0) {
  console.log('\n❌ Ошибки:');
  result.errors.forEach((error, i) => {
    console.log(`  ${i + 1}. ${error}`);
  });
}

console.log('\n📊 JSON результат:');
console.log(JSON.stringify(result, null, 2));
