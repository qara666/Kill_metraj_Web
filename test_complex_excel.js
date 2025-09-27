// Тест с более сложными данными Excel
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

console.log('🔍 Тест с сложными данными Excel...\n');

// 1. Создаем Excel файл с различными вариантами заголовков
const testData = [
  ['№', 'Адреса доставки', 'Курьеры', 'Способ оплаты', 'Сумма заказа', 'Телефон клиента', 'Имя заказчика'],
  ['001', 'ул. Крещатик 1, Киев', 'Иван Петров', 'Наличные', '500', '+380501234567', 'Петр Иванов'],
  ['002', 'пр. Победы 10, Киев', 'Мария Сидорова', 'Карта', '750', '+380509876543', 'Анна Петрова'],
  ['003', 'ул. Шевченко 5, Киев', 'Иван Петров', 'Наличные', '300', '+380501112233', 'Сергей Козлов'],
  ['004', 'бул. Леси Украинки 15, Киев', 'Алексей Смирнов', 'Безнал', '1200', '+380504445566', 'Ольга Морозова'],
  ['005', 'ул. Владимирская 8, Киев', 'Мария Сидорова', 'Карта', '900', '+380507778899', 'Дмитрий Волков']
];

const worksheet = XLSX.utils.aoa_to_sheet(testData);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Заказы');

const testFilePath = path.join(__dirname, 'test_complex.xlsx');
XLSX.writeFile(workbook, testFilePath);

console.log('✅ Создан сложный тестовый Excel файл:', testFilePath);

// 2. Тестируем обработку
try {
  const ExcelService = require('./backend/src/services/ExcelService');
  const excelService = new ExcelService();
  
  console.log('✅ ExcelService создан');
  
  const buffer = fs.readFileSync(testFilePath);
  
  excelService.processExcelFile(buffer).then(result => {
    console.log('\n📊 Результат обработки сложных данных:');
    console.log('Успех:', result.success);
    
    if (result.success && result.data) {
      const data = result.data;
      console.log('\n📈 Статистика:');
      console.log('Заказы:', data.orders?.length || 0);
      console.log('Курьеры:', data.couriers?.length || 0);
      console.log('Способы оплаты:', data.paymentMethods?.length || 0);
      console.log('Ошибки:', data.errors?.length || 0);
      console.log('Предупреждения:', data.warnings?.length || 0);
      
      if (result.summary) {
        console.log('\n📋 Сводка:');
        console.log('Всего заказов:', result.summary.totalOrders);
        console.log('Всего курьеров:', result.summary.totalCouriers);
        console.log('Всего способов оплаты:', result.summary.totalPaymentMethods);
        console.log('Успешно геокодировано:', result.summary.successfulGeocoding);
        console.log('Не удалось геокодировать:', result.summary.failedGeocoding);
      }
      
      if (data.debug) {
        console.log('\n🔍 Отладочная информация:');
        console.log('Маппинг заголовков:', data.debug.headerMap);
      }
      
      if (data.orders && data.orders.length > 0) {
        console.log('\n✅ Заказы:');
        data.orders.forEach((order, index) => {
          console.log(`  ${index + 1}. ${order.orderNumber} - ${order.address}`);
          console.log(`     Курьер: ${order.courier}, Оплата: ${order.paymentMethod}, Сумма: ${order.amount}`);
          if (order.customerName) console.log(`     Клиент: ${order.customerName}`);
          if (order.phone) console.log(`     Телефон: ${order.phone}`);
        });
      }
      
      if (data.couriers && data.couriers.length > 0) {
        console.log('\n👥 Курьеры:');
        data.couriers.forEach((courier, index) => {
          console.log(`  ${index + 1}. ${courier.name} - ${courier.orderCount} заказов, сумма: ${courier.totalAmount}`);
        });
      }
      
      if (data.paymentMethods && data.paymentMethods.length > 0) {
        console.log('\n💳 Способы оплаты:');
        data.paymentMethods.forEach((payment, index) => {
          console.log(`  ${index + 1}. ${payment.name} - ${payment.orderCount} заказов, сумма: ${payment.totalAmount}`);
        });
      }
      
      if (data.errors && data.errors.length > 0) {
        console.log('\n❌ Ошибки:');
        data.errors.forEach(error => console.log('  -', error));
      }
      
      if (data.warnings && data.warnings.length > 0) {
        console.log('\n⚠️ Предупреждения:');
        data.warnings.forEach(warning => console.log('  -', warning));
      }
    } else {
      console.log('❌ Ошибка обработки:', result.error);
    }
    
  }).catch(error => {
    console.error('❌ Ошибка ExcelService:', error.message);
  });
  
} catch (error) {
  console.error('❌ Ошибка создания ExcelService:', error.message);
}

// Очистка
setTimeout(() => {
  try {
    fs.unlinkSync(testFilePath);
    console.log('\n🧹 Тестовый файл удален');
  } catch (e) {
    console.log('\n⚠️ Не удалось удалить тестовый файл');
  }
}, 10000);
