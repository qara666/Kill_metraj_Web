// Финальный тест с улучшенной диагностикой

const ExcelService = require('./backend/src/services/ExcelService');

// Тестовые случаи
const testCases = [
  {
    name: "Проблемный случай 1: Нет колонки адресов",
    data: [
      ['ID', 'Name', 'Phone', 'Type'],
      ['1', 'Иван', '+380501234567', 'Доставка'],
      ['2', 'Петр', '+380507654321', 'Самовывоз']
    ]
  },
  {
    name: "Проблемный случай 2: Пустые адреса",
    data: [
      ['№', 'Адрес', 'Телефон', 'имя'],
      ['1', '', '+380501234567', 'Иван'],
      ['2', '   ', '+380507654321', 'Петр'],
      ['3', null, '+380509876543', 'Сидор']
    ]
  },
  {
    name: "Проблемный случай 3: Только заголовки",
    data: [
      ['№', 'Адрес', 'Телефон', 'имя']
    ]
  },
  {
    name: "Рабочий случай: Правильные данные",
    data: [
      ['№', 'Адрес', 'Телефон', 'имя'],
      ['1', 'ул. Пушкина 1', '+380501234567', 'Иван'],
      ['2', 'ул. Ленина 2', '+380507654321', 'Петр']
    ]
  }
];

async function testFinalDiagnosis() {
  console.log('🧪 ФИНАЛЬНЫЙ ТЕСТ С ДИАГНОСТИКОЙ:\n');
  
  const excelService = new ExcelService();
  
  for (const testCase of testCases) {
    console.log(`\n${testCase.name}`);
    console.log('='.repeat(80));
    
    try {
      const result = await excelService.processSheetData(testCase.data, 'test');
      
      console.log(`📊 Результат:`);
      console.log(`✅ Заказов: ${result.orders.length}`);
      console.log(`👥 Курьеров: ${result.couriers.length}`);
      console.log(`💳 Способов оплаты: ${result.paymentMethods.length}`);
      console.log(`❌ Ошибок: ${result.errors.length}`);
      console.log(`⚠️  Предупреждений: ${result.warnings.length}`);
      
      if (result.errors.length > 0) {
        console.log('\n❌ Ошибки:');
        result.errors.forEach((error, i) => {
          console.log(`  ${i + 1}. ${error}`);
        });
      }
      
      if (result.warnings.length > 0) {
        console.log('\n⚠️  Предупреждения:');
        result.warnings.forEach((warning, i) => {
          console.log(`  ${i + 1}. ${warning}`);
        });
      }
      
      if (result.orders.length > 0) {
        console.log('\n📋 Детали заказов:');
        result.orders.forEach((order, i) => {
          console.log(`  ${i + 1}. ${order.orderNumber} - ${order.address} (${order.customerName})`);
        });
      }
      
      if (result.orders.length === 0) {
        console.log('❌ ПРОБЛЕМА: Заказы не создаются!');
        
        // Анализируем заголовки
        const headers = testCase.data[0] || [];
        console.log(`📋 Заголовки: [${headers.map(h => `"${h}"`).join(', ')}]`);
        
        // Проверяем есть ли адрес
        const hasAddress = headers.some(h => 
          h && h.toString().toLowerCase().includes('адрес')
        );
        console.log(`📍 Есть адрес в заголовках: ${hasAddress ? 'ДА' : 'НЕТ'}`);
        
        if (!hasAddress) {
          console.log('💡 РЕШЕНИЕ: Добавьте колонку с названием "Адрес", "Адреса", "Address" или "Location"');
        } else {
          console.log('💡 РЕШЕНИЕ: Заполните колонку адресов данными');
        }
      } else {
        console.log('✅ ОК: Заказы создаются!');
      }
      
    } catch (error) {
      console.error('❌ Ошибка:', error.message);
    }
  }
  
  console.log('\n🎯 РЕКОМЕНДАЦИИ ДЛЯ ИСПРАВЛЕНИЯ:');
  console.log('1. Проверьте названия колонок в Excel файле');
  console.log('2. Убедитесь, что есть колонка с адресами (название: "Адрес", "Адреса", "Address", "Location")');
  console.log('3. Заполните колонку адресов данными');
  console.log('4. Проверьте, что в Excel файле есть строки с данными (не только заголовки)');
  console.log('5. Убедитесь, что адреса не пустые и не содержат только пробелы');
}

testFinalDiagnosis();