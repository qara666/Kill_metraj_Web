// Тест с реальным Excel файлом

const ExcelService = require('./backend/src/services/ExcelService');

// Создаем тестовый Excel файл
const XLSX = require('xlsx');

// Тестовые данные
const testData = [
  ['№', 'Адрес', 'Телефон', 'имя', 'Тип заказа', 'Способ оплаты', 'Курьер', 'Сумма заказа'],
  ['1', 'ул. Пушкина 1', '+380501234567', 'Иван', 'Доставка', 'Наличные', 'Курьер1', '100'],
  ['2', 'ул. Ленина 2', '+380507654321', 'Петр', 'Самовывоз', 'Карта', 'Курьер2', '200'],
  ['3', 'ул. Гагарина 3', '+380501112233', 'Анна', 'Доставка', 'Наличные', 'Курьер1', '150']
];

// Создаем Excel файл
const worksheet = XLSX.utils.aoa_to_sheet(testData);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders');

// Конвертируем в buffer
const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

async function testRealExcel() {
  console.log('🧪 Тестируем с реальным Excel файлом...\n');
  
  const excelService = new ExcelService();
  
  try {
    const result = await excelService.processExcelFile(excelBuffer);
    
    console.log('🎯 РЕЗУЛЬТАТ:');
    console.log(`✅ Успешно: ${result.success}`);
    
    if (result.success) {
      console.log(`📊 Заказов: ${result.data.orders.length}`);
      console.log(`👥 Курьеров: ${result.data.couriers.length}`);
      console.log(`💳 Способов оплаты: ${result.data.paymentMethods.length}`);
      console.log(`❌ Ошибок: ${result.data.errors.length}`);
      
      if (result.data.orders.length > 0) {
        console.log('\n📋 Детали заказов:');
        result.data.orders.forEach((order, i) => {
          console.log(`  ${i + 1}. ${order.orderNumber} - ${order.address} (${order.customerName})`);
        });
      }
      
      console.log('\n📊 JSON результат:');
      console.log(JSON.stringify(result.data, null, 2));
    } else {
      console.log(`❌ Ошибка: ${result.error}`);
    }
    
  } catch (error) {
    console.error('❌ Ошибка тестирования:', error);
  }
}

testRealExcel();
