// Локальный тест Excel обработки

const ExcelService = require('./backend/src/services/ExcelService_clean');

// Тестовые данные
const testData = [
  ['№', 'Адрес', 'Телефон', 'имя', 'Тип заказа', 'Способ оплаты', 'Курьер', 'Сумма заказа'],
  ['1', 'ул. Пушкина 1', '+380501234567', 'Иван', 'Доставка', 'Наличные', 'Курьер1', '100'],
  ['2', 'ул. Ленина 2', '+380507654321', 'Петр', 'Самовывоз', 'Карта', 'Курьер2', '200'],
  ['', '', '', '', '', '', 'Курьер3', ''], // Пустая строка
  ['3', '', '+380509876543', 'Сидор', 'Доставка', 'Наличные', '', '300'], // Без адреса
  ['4', 'ул. Гагарина 3', '+380501112233', 'Анна', 'Доставка', 'Наличные', 'Курьер1', '150']
];

async function testExcelProcessing() {
  console.log('🧪 Тестируем обработку Excel данных локально...\n');
  
  const excelService = new ExcelService();
  
  console.log('📋 Тестовые данные:');
  testData.forEach((row, i) => {
    console.log(`  ${i}: [${row.map(cell => `"${cell}"`).join(', ')}]`);
  });
  
  console.log('\n📊 Обрабатываем данные...');
  
  try {
    const result = await excelService.processSheetData(testData, 'test');
    
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
    
  } catch (error) {
    console.error('❌ Ошибка тестирования:', error);
  }
}

// Запускаем тест
testExcelProcessing();
