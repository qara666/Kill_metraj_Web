const fs = require('fs');
const XLSX = require('xlsx');
const path = require('path');

console.log('🔍 Быстрый тест исправления Excel...');

// Создаем тестовый Excel файл с "Сумма заказа"
const testData = [
  ['№', 'Адрес доставки', 'Курьер', 'Способ оплаты', 'Сумма заказа', 'Телефон клиента', 'Имя клиента'],
  ['001', 'ул. Крещатик 1, Киев', 'Иван Петров', 'Наличные', '500.50', '+380501234567', 'Петр Иванов'],
  ['002', 'пр. Победы 10, Киев', 'Мария Сидорова', 'Карта', '750.00', '+380509876543', 'Анна Петрова'],
  ['003', 'ул. Шевченко 5, Киев', 'Иван Петров', 'Наличные', '300.25', '+380501112233', 'Сергей Козлов']
];

const ws = XLSX.utils.aoa_to_sheet(testData);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Заказы');

const testFile = 'test_quick_fix.xlsx';
XLSX.writeFile(wb, testFile);

console.log(`✅ Создан тестовый Excel файл: ${testFile}`);

// Тестируем загрузку
const formData = new FormData();
const fileBuffer = fs.readFileSync(testFile);
const blob = new Blob([fileBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
formData.append('file', blob, testFile);

console.log('📤 Отправляем файл на сервер...');

fetch('http://localhost:5001/api/upload/excel', {
  method: 'POST',
  body: formData
})
.then(response => response.json())
.then(data => {
  console.log('📊 Результат обработки:');
  console.log(`✅ Успех: ${data.success}`);
  console.log(`📦 Заказов: ${data.data?.orders?.length || 0}`);
  console.log(`💰 Суммы: ${data.data?.orders?.map(o => o.amount || o.financial?.amount || 0).join(', ') || 'нет'}`);
  console.log(`🔍 Логи: ${data.data?.debug?.logs?.length || 0} записей`);
  
  if (data.data?.debug?.logs) {
    console.log('\n📋 Последние логи:');
    data.data.debug.logs.slice(-5).forEach(log => {
      console.log(`  ${log.timestamp}: ${log.message}`);
    });
  }
  
  // Очистка
  fs.unlinkSync(testFile);
  console.log('\n🧹 Тестовый файл удален');
})
.catch(error => {
  console.error('❌ Ошибка:', error.message);
  // Очистка
  if (fs.existsSync(testFile)) {
    fs.unlinkSync(testFile);
  }
});
