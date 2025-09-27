// Тест проблемных случаев

const ExcelService = require('./backend/src/services/ExcelService');

// Проблемные случаи
const problemCases = [
  {
    name: "Случай 1: Нет колонки адресов",
    data: [
      ['ID', 'Name', 'Phone', 'Type'],
      ['1', 'Иван', '+380501234567', 'Доставка'],
      ['2', 'Петр', '+380507654321', 'Самовывоз']
    ]
  },
  {
    name: "Случай 2: Пустые адреса",
    data: [
      ['№', 'Адрес', 'Телефон', 'имя'],
      ['1', '', '+380501234567', 'Иван'],
      ['2', '   ', '+380507654321', 'Петр'],
      ['3', null, '+380509876543', 'Сидор']
    ]
  },
  {
    name: "Случай 3: Только заголовки",
    data: [
      ['№', 'Адрес', 'Телефон', 'имя']
    ]
  },
  {
    name: "Случай 4: Неправильные заголовки",
    data: [
      ['ID', 'Location', 'Contact', 'Client'],
      ['1', 'ул. Пушкина 1', '+380501234567', 'Иван'],
      ['2', 'ул. Ленина 2', '+380507654321', 'Петр']
    ]
  },
  {
    name: "Случай 5: Рабочий случай",
    data: [
      ['№', 'Адрес', 'Телефон', 'имя'],
      ['1', 'ул. Пушкина 1', '+380501234567', 'Иван'],
      ['2', 'ул. Ленина 2', '+380507654321', 'Петр']
    ]
  }
];

async function testProblemCases() {
  console.log('🧪 Тестируем проблемные случаи...\n');
  
  const excelService = new ExcelService();
  
  for (const testCase of problemCases) {
    console.log(`\n${testCase.name}`);
    console.log('='.repeat(60));
    
    try {
      const result = await excelService.processSheetData(testCase.data, 'test');
      
      console.log(`📊 Результат:`);
      console.log(`✅ Заказов: ${result.orders.length}`);
      console.log(`👥 Курьеров: ${result.couriers.length}`);
      console.log(`💳 Способов оплаты: ${result.paymentMethods.length}`);
      console.log(`❌ Ошибок: ${result.errors.length}`);
      
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
          console.log('💡 РЕШЕНИЕ: Добавьте колонку с названием "Адрес"');
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
}

testProblemCases();
