// Тест с пустыми данными

function mapHeaders(headers) {
  const headerMap = {};
  
  headers.forEach((header, index) => {
    if (!header) return;
    
    const normalizedHeader = header.toString().toLowerCase().trim();
    const noApostrophes = normalizedHeader.replace(/[''`]/g, '');
    
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

  return headerMap;
}

function processRow(row, headerMap, rowNumber) {
  console.log(`\n📊 Обработка строки ${rowNumber}:`);
  console.log('📋 Данные строки:', row);
  console.log('🗺️ Маппинг заголовков:', headerMap);
  
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
    addressValue: hasAddress ? `"${row[headerMap.address]}"` : 'НЕТ',
    addressIndex: headerMap.address
  });

  if (hasAddress) {
    console.log(`✅ Строка ${rowNumber}: Определена как ЗАКАЗ (по адресу)`);
    return { type: 'order', data: { address: row[headerMap.address] } };
  } else {
    console.log(`❌ Строка ${rowNumber}: НЕ ОПРЕДЕЛЕНА - нет адреса`);
    return { type: 'error', data: null };
  }
}

// Тестовые случаи с проблемными данными
const testCases = [
  {
    name: "Пустые адреса",
    data: [
      ['№', 'Адрес', 'Телефон', 'имя'],
      ['1', '', '+380501234567', 'Иван'],
      ['2', '   ', '+380507654321', 'Петр'],
      ['3', null, '+380509876543', 'Сидор'],
      ['4', undefined, '+380501112233', 'Анна']
    ]
  },
  {
    name: "Только заголовки, нет данных",
    data: [
      ['№', 'Адрес', 'Телефон', 'имя']
    ]
  },
  {
    name: "Неправильные заголовки",
    data: [
      ['ID', 'Location', 'Contact', 'Client'],
      ['1', 'ул. Пушкина 1', '+380501234567', 'Иван'],
      ['2', 'ул. Ленина 2', '+380507654321', 'Петр']
    ]
  },
  {
    name: "Заголовки в неправильном порядке",
    data: [
      ['Имя', 'Телефон', '№', 'Адрес'],
      ['Иван', '+380501234567', '1', 'ул. Пушкина 1'],
      ['Петр', '+380507654321', '2', 'ул. Ленина 2']
    ]
  },
  {
    name: "Смешанные пустые и заполненные адреса",
    data: [
      ['№', 'Адрес', 'Телефон', 'имя'],
      ['1', 'ул. Пушкина 1', '+380501234567', 'Иван'],
      ['2', '', '+380507654321', 'Петр'],
      ['3', 'ул. Гагарина 3', '+380509876543', 'Сидор'],
      ['4', '   ', '+380501112233', 'Анна']
    ]
  }
];

console.log('🧪 Тестируем проблемные случаи с данными:\n');

testCases.forEach((testCase, index) => {
  console.log(`\n${index + 1}. ${testCase.name}`);
  console.log('='.repeat(60));
  
  const headers = testCase.data[0] || [];
  const headerMap = mapHeaders(headers);
  
  console.log('🗺️ Результат маппинга заголовков:', headerMap);
  
  const hasAddress = headerMap.address !== undefined;
  console.log(`📍 Есть колонка адресов: ${hasAddress ? 'ДА' : 'НЕТ'} (индекс: ${headerMap.address})`);
  
  if (!hasAddress) {
    console.log('❌ ПРОБЛЕМА: Нет колонки с адресами!');
    return;
  }
  
  let ordersCount = 0;
  let errorsCount = 0;
  
  // Обрабатываем данные
  for (let i = 1; i < testCase.data.length; i++) {
    const row = testCase.data[i];
    if (!row || row.length === 0) continue;
    
    const result = processRow(row, headerMap, i + 1);
    
    if (result.type === 'order') {
      ordersCount++;
    } else {
      errorsCount++;
    }
  }
  
  console.log(`\n📊 Результат обработки:`);
  console.log(`✅ Заказов: ${ordersCount}`);
  console.log(`❌ Ошибок: ${errorsCount}`);
  
  if (ordersCount === 0) {
    console.log('❌ ПРОБЛЕМА: Заказы не создаются!');
  } else {
    console.log('✅ ОК: Заказы создаются!');
  }
});

console.log('\n🎯 ВОЗМОЖНЫЕ ПРИЧИНЫ 0 ЗАКАЗОВ:');
console.log('1. В Excel файле нет колонки с адресами');
console.log('2. Колонка адресов есть, но все ячейки пустые');
console.log('3. Адреса содержат только пробелы');
console.log('4. Адреса равны null или undefined');
console.log('5. Заголовки имеют неожиданные названия');
console.log('\n🔧 РЕШЕНИЕ:');
console.log('1. Используйте debug endpoints для диагностики');
console.log('2. Проверьте названия колонок в Excel файле');
console.log('3. Убедитесь, что в колонке адресов есть данные');
console.log('4. Проверьте логи обработки на сервере');
