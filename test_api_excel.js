// Тест Excel обработки через API
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const FormData = require('form-data');
const fetch = require('node-fetch');

console.log('🔍 Тест Excel обработки через API...\n');

// 1. Создаем тестовый Excel файл
const testData = [
  ['№', 'Адреса доставки', 'Курьеры', 'Способ оплаты', 'Сумма заказа', 'Телефон клиента', 'Имя заказчика'],
  ['001', 'ул. Крещатик 1, Киев', 'Иван Петров', 'Наличные', '500', '+380501234567', 'Петр Иванов'],
  ['002', 'пр. Победы 10, Киев', 'Мария Сидорова', 'Карта', '750', '+380509876543', 'Анна Петрова'],
  ['003', 'ул. Шевченко 5, Киев', 'Иван Петров', 'Наличные', '300', '+380501112233', 'Сергей Козлов']
];

const worksheet = XLSX.utils.aoa_to_sheet(testData);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Заказы');

const testFilePath = path.join(__dirname, 'test_api.xlsx');
XLSX.writeFile(workbook, testFilePath);

console.log('✅ Создан тестовый Excel файл:', testFilePath);

// 2. Тестируем API
async function testAPI() {
  try {
    console.log('🔄 Отправляем файл на сервер...');
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream(testFilePath));
    
    const response = await fetch('http://localhost:5000/api/upload/excel', {
      method: 'POST',
      body: formData
    });
    
    console.log('📡 Статус ответа:', response.status);
    
    if (response.ok) {
      const result = await response.json();
      console.log('\n📊 Результат API:');
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
        }
        
        if (data.orders && data.orders.length > 0) {
          console.log('\n✅ Заказы:');
          data.orders.forEach((order, index) => {
            console.log(`  ${index + 1}. ${order.orderNumber} - ${order.address}`);
            console.log(`     Курьер: ${order.courier}, Оплата: ${order.paymentMethod}, Сумма: ${order.amount}`);
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
    } else {
      const errorText = await response.text();
      console.log('❌ Ошибка API:', response.status, errorText);
    }
    
  } catch (error) {
    console.error('❌ Ошибка запроса:', error.message);
  }
}

// Ждем немного, чтобы сервер запустился
setTimeout(() => {
  testAPI().then(() => {
    // Очистка
    try {
      fs.unlinkSync(testFilePath);
      console.log('\n🧹 Тестовый файл удален');
    } catch (e) {
      console.log('\n⚠️ Не удалось удалить тестовый файл');
    }
  });
}, 3000);
