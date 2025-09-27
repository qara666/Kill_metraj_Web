// Тестовый скрипт для проверки логики распознавания заголовков Excel

// Симулируем заголовки из вашего примера
const testHeaders = [
  '№',           // 0
  'Адрес',       // 1  
  'Телефон',     // 2
  'имя',         // 3
  'Тип заказа',  // 4
  'Способ оплаты', // 5
  'Курьер',      // 6
  'Сумма заказа' // 7
];

console.log('🧪 Тестируем распознавание заголовков:');
console.log('📋 Тестовые заголовки:', testHeaders);

function mapHeaders(headers) {
  const headerMap = {};
  
  console.log('🔍 Анализ заголовков Excel файла:');
  console.log('📋 Исходные заголовки:', headers);
  
  headers.forEach((header, index) => {
    if (!header) return;
    
    const normalizedHeader = header.toString().toLowerCase().trim();
    // Also normalize by removing apostrophes to be robust to variations
    const noApostrophes = normalizedHeader.replace(/[''`]/g, '');
    
    console.log(`  ${index}: "${header}" -> "${normalizedHeader}" -> "${noApostrophes}"`);
    
    // Helpers
    const includesAny = (s, arr) => arr.some(k => s.includes(k));

    // Мапимо українські, російські та англійські заголовки
    if (includesAny(noApostrophes, ['номер', 'номер заказа', 'номер замовлення', 'no', '№', 'number', 'order', 'id'])) {
      if (headerMap.orderNumber === undefined) {
        headerMap.orderNumber = index;
        console.log(`    ✅ Распознан как orderNumber: ${index}`);
      }
    } else if (includesAny(noApostrophes, ['адреса', 'адрес', 'address', 'адрес доставки'])) {
      if (headerMap.address === undefined) {
        headerMap.address = index;
        console.log(`    ✅ Распознан как address: ${index}`);
      }
    } else if (includesAny(noApostrophes, ['телефон', 'phone', 'моб', 'mobile'])) {
      if (headerMap.phone === undefined) {
        headerMap.phone = index;
        console.log(`    ✅ Распознан как phone: ${index}`);
      }
    } else if (includesAny(noApostrophes, ['курєр', 'курер', 'курьер', 'courier', 'доставщик'])) {
      if (headerMap.courier === undefined) {
        headerMap.courier = index;
        console.log(`    ✅ Распознан как courier: ${index}`);
      }
    } else if (includesAny(noApostrophes, ['оплата', 'способ оплаты', 'payment', 'оплат', 'сплата'])) {
      if (headerMap.paymentMethod === undefined) {
        headerMap.paymentMethod = index;
        console.log(`    ✅ Распознан как paymentMethod: ${index}`);
      }
    } else if (includesAny(noApostrophes, ['сума', 'сумма', 'amount', 'price', 'стоимость', 'вартість', 'сумма заказа', 'к оплате'])) {
      if (headerMap.amount === undefined) {
        headerMap.amount = index;
        console.log(`    ✅ Распознан как amount: ${index}`);
      }
    } else if (includesAny(noApostrophes, ['тип заказа', 'тип замовлення', 'order type'])) {
      if (headerMap.orderType === undefined) {
        headerMap.orderType = index;
        console.log(`    ✅ Распознан как orderType: ${index}`);
      }
    } else if (includesAny(noApostrophes, ['имя', 'імя', 'name'])) {
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

// Тестируем
const result = mapHeaders(testHeaders);

console.log('\n📊 Результат тестирования:');
console.log('✅ Распознанные поля:', Object.keys(result).length);
console.log('📋 Детали:', result);

// Проверяем, есть ли обязательные поля для заказа
const hasAddress = result.address !== undefined;
const hasOrderNumber = result.orderNumber !== undefined;

console.log('\n🔍 Проверка условий для заказа:');
console.log(`📍 Есть адрес: ${hasAddress} (индекс: ${result.address})`);
console.log(`🔢 Есть номер заказа: ${hasOrderNumber} (индекс: ${result.orderNumber})`);
console.log(`✅ Может создать заказ: ${hasAddress ? 'ДА' : 'НЕТ'}`);

if (hasAddress) {
  console.log('🎉 Заказы будут создаваться!');
} else {
  console.log('❌ Заказы НЕ будут создаваться - нет адреса!');
}
