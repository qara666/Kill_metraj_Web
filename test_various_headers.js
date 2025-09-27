// Тест различных вариантов заголовков

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
    } else {
      console.log(`    ❌ НЕ РАСПОЗНАН: "${noApostrophes}"`);
    }
  });

  console.log('🗺️ Результат маппинга заголовков:', headerMap);
  return headerMap;
}

// Тестируем различные варианты заголовков
const testCases = [
  {
    name: "Стандартные заголовки",
    headers: ['№', 'Адрес', 'Телефон', 'имя', 'Тип заказа', 'Способ оплаты', 'Курьер', 'Сумма заказа']
  },
  {
    name: "Заголовки с множественным числом",
    headers: ['Номер', 'Адреса', 'Телефоны', 'Имена', 'Типы заказов', 'Способы оплаты', 'Курьеры', 'Суммы заказов']
  },
  {
    name: "Заголовки с дополнительными словами",
    headers: ['№ заказа', 'Адрес доставки', 'Номер телефона', 'Имя клиента', 'Тип заказа', 'Способ оплаты', 'Курьер', 'Сумма к оплате']
  },
  {
    name: "Английские заголовки",
    headers: ['Order #', 'Address', 'Phone', 'Name', 'Order Type', 'Payment Method', 'Courier', 'Amount']
  },
  {
    name: "Смешанные заголовки",
    headers: ['№', 'Address', 'Телефон', 'Name', 'Тип заказа', 'Payment', 'Курьер', 'Amount']
  },
  {
    name: "Заголовки с апострофами",
    headers: ['№', 'Адреса', 'Телефоны', 'Имена', 'Тип заказа', 'Способ оплаты', 'Курьеры', 'Сумма заказа']
  },
  {
    name: "Заголовки с пробелами",
    headers: [' № ', ' Адрес ', ' Телефон ', ' имя ', ' Тип заказа ', ' Способ оплаты ', ' Курьер ', ' Сумма заказа ']
  },
  {
    name: "Заголовки в другом порядке",
    headers: ['Имя', 'Телефон', 'Адрес', '№', 'Курьер', 'Способ оплаты', 'Тип заказа', 'Сумма заказа']
  }
];

console.log('🧪 Тестируем различные варианты заголовков:\n');

testCases.forEach((testCase, index) => {
  console.log(`\n${index + 1}. ${testCase.name}`);
  console.log('='.repeat(50));
  
  const headerMap = mapHeaders(testCase.headers);
  
  const hasAddress = headerMap.address !== undefined;
  const hasOrderNumber = headerMap.orderNumber !== undefined;
  
  console.log(`\n📊 Результат:`);
  console.log(`📍 Есть адрес: ${hasAddress ? 'ДА' : 'НЕТ'} (индекс: ${headerMap.address})`);
  console.log(`🔢 Есть номер заказа: ${hasOrderNumber ? 'ДА' : 'НЕТ'} (индекс: ${headerMap.orderNumber})`);
  console.log(`✅ Может создать заказ: ${hasAddress ? 'ДА' : 'НЕТ'}`);
  
  if (!hasAddress) {
    console.log('❌ ПРОБЛЕМА: Заказы НЕ будут создаваться - нет адреса!');
  } else {
    console.log('✅ ОК: Заказы будут создаваться!');
  }
});

console.log('\n🎯 РЕКОМЕНДАЦИИ:');
console.log('1. Проверьте названия колонок в вашем Excel файле');
console.log('2. Убедитесь, что есть колонка с адресами');
console.log('3. Проверьте, что в колонке адресов есть данные');
console.log('4. Используйте debug endpoints для диагностики');
