// Финальный тест с реальным Excel файлом новой структуры

const ExcelService = require('./backend/src/services/ExcelService');
const XLSX = require('xlsx');

// Создаем тестовый Excel файл с новой структурой
const testData = [
  ['Номер', 'Состояние', 'Тип заказа', 'Телефон', 'Заказчик', 'Всего заказов', 'Комментарий к заказчику', 'Адрес', 'Комментарий к адресу', 'Зона доставки', 'Время доставки', 'Дата создания', 'Время на кухню', 'Доставить к', 'Плановое время', 'Комментарий к заказу', 'Общее время', 'Скидка %', 'К оплате', 'Сдача', 'Способ оплаты', 'Курьер'],
  ['9086195', 'Исполнен', 'Доставка', '+380501234567', 'Денис Дзюба', '5', 'VIP клиент', 'Київ, вул. Сергія Данченка, 32', 'Зустріч з кур\'єром на заправці ОККО', 'Зона 1 Ближние', '15мин', '22.09.2025 08:55', '09:00', '11:00', '12:00', 'GLOVO: 101436402710, CODE: 028', '45мин', '0', '679,00', '0', 'Готівка', 'Негода Юрій'],
  ['9086320', 'Исполнен', 'Самовивіз', '+380507654321', 'Трегубов Всеслав', '12', '', 'Київ, вул. Автозаводська, 9а', 'Зателефонувати за 5 хв', 'Зона 0', '10мин', '22.09.2025 10:19', '10:30', '11:30', '11:30', '', '1ч. 12мин', '31,00', '1620,00', '48,00', 'Готівка', 'Онищенко Андрій'],
  ['9086243', 'Исполнен', 'Доставка', '+380509876543', 'Maria', '3', '', 'Київ, вул. Хрещатик, 1', 'Очікувати біля світлофору', 'Зона 2 Средние', '25мин', '22.09.2025 10:05', '10:15', '11:15', '11:15', 'Специальные требования', '1ч. 30мин', '0', '3815,00', '0', 'безготівка Портмоне', 'Осадченко Іван'],
  ['9086165', 'Исполнен', 'Доставка', '+380501112233', 'Крістіна', '8', 'Постоянный клиент', 'Київ, вул. Шевченка, 15', 'Код домофона: 1234', 'Зона пешие ресторан', '20мин', '22.09.2025 11:30', '11:45', '12:45', '12:45', 'Без лука', '1ч. 15мин', '15,00', '450,00', '0', 'тормінал Кухня', 'Якушев Глеб']
];

// Создаем Excel файл
const worksheet = XLSX.utils.aoa_to_sheet(testData);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders');

// Конвертируем в buffer
const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

async function testFinalExcel() {
  console.log('🧪 ФИНАЛЬНЫЙ ТЕСТ С НОВОЙ СТРУКТУРОЙ...\n');
  
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
      console.log(`⚠️  Предупреждений: ${result.data.warnings.length}`);
      
      if (result.data.orders.length > 0) {
        console.log('\n📋 СВОДКА ЗАКАЗОВ:');
        result.data.orders.forEach((order, i) => {
          console.log(`\n${i + 1}. Заказ #${order.orderNumber} (${order.status})`);
          console.log(`   Клиент: ${order.customerName} | Телефон: ${order.phone}`);
          console.log(`   Адрес: ${order.address}`);
          console.log(`   Зона: ${order.deliveryZone} | Время: ${order.deliveryTime}`);
          console.log(`   Сумма: ${order.amount} грн | Скидка: ${order.discountPercent}%`);
          console.log(`   Оплата: ${order.paymentMethod} | Курьер: ${order.courier}`);
          if (order.orderComment) console.log(`   Комментарий: ${order.orderComment}`);
        });
        
        console.log('\n📊 СТАТИСТИКА:');
        const totalAmount = result.data.orders.reduce((sum, order) => sum + order.amount, 0);
        const avgAmount = totalAmount / result.data.orders.length;
        const deliveryCount = result.data.orders.filter(o => o.orderType === 'Доставка').length;
        const pickupCount = result.data.orders.filter(o => o.orderType === 'Самовивіз').length;
        
        console.log(`💰 Общая сумма: ${totalAmount.toFixed(2)} грн`);
        console.log(`📈 Средняя сумма: ${avgAmount.toFixed(2)} грн`);
        console.log(`🚚 Доставка: ${deliveryCount} заказов`);
        console.log(`🏪 Самовывоз: ${pickupCount} заказов`);
        
        // Группировка по курьерам
        const courierStats = {};
        result.data.orders.forEach(order => {
          if (order.courier) {
            courierStats[order.courier] = (courierStats[order.courier] || 0) + 1;
          }
        });
        
        console.log('\n👥 СТАТИСТИКА КУРЬЕРОВ:');
        Object.entries(courierStats).forEach(([courier, count]) => {
          console.log(`   ${courier}: ${count} заказов`);
        });
      }
      
      if (result.data.errors.length > 0) {
        console.log('\n❌ Ошибки:');
        result.data.errors.forEach((error, i) => {
          console.log(`  ${i + 1}. ${error}`);
        });
      }
      
      if (result.data.warnings.length > 0) {
        console.log('\n⚠️  Предупреждения:');
        result.data.warnings.forEach((warning, i) => {
          console.log(`  ${i + 1}. ${warning}`);
        });
      }
      
    } else {
      console.log(`❌ Ошибка: ${result.error}`);
    }
    
  } catch (error) {
    console.error('❌ Ошибка тестирования:', error);
  }
}

testFinalExcel();
