// Тест улучшенного Excel сервиса
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { exec } = require('child_process');

console.log('🔍 Тест улучшенного Excel сервиса...\n');

// 1. Создаем тестовый Excel файл с разными форматами данных
const testData = [
  ['№', 'Адрес доставки', 'Курьер', 'Способ оплаты', 'Сумма заказа', 'Телефон клиента', 'Имя клиента', 'Комментарий'],
  ['001', 'ул. Крещатик 1, Киев', 'Иван Петров', 'Наличные', '500.50', '+380501234567', 'Петр Иванов', 'Доставить до 18:00'],
  ['002', 'пр. Победы 10, Киев', 'Мария Сидорова', 'Карта', '750.00', '+380509876543', 'Анна Петрова', 'Звонок перед доставкой'],
  ['003', 'ул. Шевченко 5, Киев', 'Иван Петров', 'Наличные', '300.25', '+380501112233', 'Сергей Козлов', ''],
  ['004', 'бул. Леси Украинки 15, Киев', 'Мария Сидорова', 'Карта', '1200.75', '+380507778899', 'Ольга Смирнова', 'Осторожно с посудой'],
  ['005', 'ул. Владимирская 20, Киев', 'Иван Петров', 'Наличные', '450.00', '+380505556677', 'Дмитрий Волков', 'Код домофона 1234']
];

const worksheet = XLSX.utils.aoa_to_sheet(testData);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Заказы');

const testFilePath = path.join(__dirname, 'test_improved.xlsx');
XLSX.writeFile(workbook, testFilePath);

console.log('✅ Создан тестовый Excel файл:', testFilePath);
console.log('📊 Данные в файле:');
testData.forEach((row, index) => {
  console.log(`  ${index === 0 ? 'Заголовки:' : `Строка ${index}:`} ${row.join(' | ')}`);
});

// 2. Запускаем улучшенный сервер
console.log('\n🚀 Запуск улучшенного сервера...');
const serverProcess = exec('node test_improved_excel.js', (error, stdout, stderr) => {
  if (error) {
    console.error('❌ Ошибка запуска сервера:', error);
    return;
  }
  if (stderr) {
    console.error('❌ Ошибка stderr:', stderr);
    return;
  }
  console.log('✅ Сервер запущен:', stdout);
});

// Ждем запуска сервера
setTimeout(() => {
  console.log('\n📤 Отправка файла на сервер...');
  
  // 3. Тестируем через curl
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
        
        if (result.summary) {
          console.log('\n📋 Сводка:');
          console.log('Всего заказов:', result.summary.totalOrders);
          console.log('Всего курьеров:', result.summary.totalCouriers);
          console.log('Всего способов оплаты:', result.summary.totalPaymentMethods);
        }
        
        if (data.orders && data.orders.length > 0) {
          console.log('\n✅ Заказы:');
          data.orders.forEach((order, index) => {
            console.log(`  ${index + 1}. #${order.orderNumber} - ${order.address}`);
            console.log(`     Курьер: ${order.courier}, Оплата: ${order.paymentMethod}, Сумма: ${order.amount} грн`);
            console.log(`     Клиент: ${order.customerName}, Телефон: ${order.phone}`);
            if (order.orderComment) {
              console.log(`     Комментарий: ${order.orderComment}`);
            }
            console.log('');
          });
        } else {
          console.log('\n❌ Заказы не найдены!');
        }
        
        if (data.errors && data.errors.length > 0) {
          console.log('\n❌ Ошибки:');
          data.errors.forEach(error => console.log('  -', error));
        }
        
        if (data.warnings && data.warnings.length > 0) {
          console.log('\n⚠️ Предупреждения:');
          data.warnings.forEach(warning => console.log('  -', warning));
        }
        
        // Показываем отладочную информацию
        if (data.debug) {
          console.log('\n🔍 Отладочная информация:');
          console.log('Листы:', data.debug.sheets?.map(s => `${s.name} (${s.rows} строк)`).join(', '));
          console.log('Всего строк:', data.debug.totalRows);
          console.log('Обработано строк:', data.debug.processedRows);
          console.log('Маппинг заголовков:', JSON.stringify(data.debug.headerMap, null, 2));
          
          if (data.debug.rawData && data.debug.rawData.length > 0) {
            console.log('\n📄 Сырые данные (первые 3 строки):');
            data.debug.rawData.forEach(sheet => {
              console.log(`Лист "${sheet.sheet}":`);
              sheet.data.slice(0, 3).forEach((row, index) => {
                console.log(`  ${index}: [${row.join(', ')}]`);
              });
            });
          }
        }
      } else {
        console.log('❌ Ошибка обработки:', result.error);
        
        if (result.debug && result.debug.logs) {
          console.log('\n🔍 Отладочные логи:');
          result.debug.logs.forEach(log => {
            console.log(`[${log.timestamp}] ${log.message}`);
            if (log.data) {
              console.log('  Данные:', log.data);
            }
          });
        }
      }
      
    } catch (parseError) {
      console.log('❌ Ошибка парсинга JSON:', parseError.message);
      console.log('Ответ сервера:', stdout);
    }
    
    cleanup();
  });
}, 3000); // Ждем 3 секунды для запуска сервера

function cleanup() {
  // Останавливаем сервер
  serverProcess.kill();
  
  // Удаляем тестовый файл
  try {
    fs.unlinkSync(testFilePath);
    console.log('\n🧹 Тестовый файл удален');
  } catch (e) {
    console.log('\n⚠️ Не удалось удалить тестовый файл');
  }
  
  console.log('\n✅ Тест завершен');
}
