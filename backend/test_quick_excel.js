// Быстрый тест улучшенного Excel сервиса
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { exec } = require('child_process');

console.log('🔍 Быстрый тест улучшенного Excel сервиса...\n');

// 1. Создаем тестовый Excel файл
const testData = [
  ['№', 'Адрес доставки', 'Курьер', 'Способ оплаты', 'Сумма заказа', 'Телефон клиента', 'Имя клиента'],
  ['001', 'ул. Крещатик 1, Киев', 'Иван Петров', 'Наличные', '500.50', '+380501234567', 'Петр Иванов'],
  ['002', 'пр. Победы 10, Киев', 'Мария Сидорова', 'Карта', '750.00', '+380509876543', 'Анна Петрова'],
  ['003', 'ул. Шевченко 5, Киев', 'Иван Петров', 'Наличные', '300.25', '+380501112233', 'Сергей Козлов']
];

const worksheet = XLSX.utils.aoa_to_sheet(testData);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Заказы');

const testFilePath = path.join(__dirname, 'test_quick.xlsx');
XLSX.writeFile(workbook, testFilePath);

console.log('✅ Создан тестовый Excel файл:', testFilePath);

// Ждем запуска сервера
setTimeout(() => {
  console.log('\n📤 Отправка файла на сервер...');
  
  exec(`curl -X POST -F "file=@${testFilePath}" http://localhost:5002/api/upload/excel`, (error, stdout, stderr) => {
    if (error) {
      console.error('❌ Ошибка curl:', error.message);
      cleanup();
      return;
    }
    
    if (stderr) {
      console.error('❌ Ошибка stderr:', stderr);
    }
    
    try {
      const result = JSON.parse(stdout);
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
        
        if (data.orders && data.orders.length > 0) {
          console.log('\n✅ Заказы:');
          data.orders.forEach((order, index) => {
            console.log(`  ${index + 1}. #${order.orderNumber} - ${order.address}`);
            console.log(`     Курьер: ${order.courier}, Оплата: ${order.paymentMethod}, Сумма: ${order.amount} грн`);
            console.log(`     Клиент: ${order.customerName}, Телефон: ${order.phone}`);
            console.log('');
          });
        } else {
          console.log('\n❌ Заказы не найдены!');
          
          if (data.debug && data.debug.logs) {
            console.log('\n🔍 Отладочные логи:');
            data.debug.logs.slice(-10).forEach(log => {
              console.log(`[${log.timestamp}] ${log.message}`);
            });
          }
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
      
    } catch (parseError) {
      console.log('❌ Ошибка парсинга JSON:', parseError.message);
      console.log('Ответ сервера:', stdout);
    }
    
    cleanup();
  });
}, 2000); // Ждем 2 секунды для запуска сервера

function cleanup() {
  // Удаляем тестовый файл
  try {
    fs.unlinkSync(testFilePath);
    console.log('\n🧹 Тестовый файл удален');
  } catch (e) {
    console.log('\n⚠️ Не удалось удалить тестовый файл');
  }
  
  console.log('\n✅ Тест завершен');
}
