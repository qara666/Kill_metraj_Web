// Тест с новой структурой таблицы

const ExcelService = require('./backend/src/services/ExcelService_updated');

// Новая структура данных на основе изображения
const newStructureData = [
  // Заголовки (упрощенная версия)
  ['Номер', 'Состояние', 'Тип заказа', 'Телефон', 'Заказчик', 'Всего заказов', 'Комментарий к заказчику', 'Адрес', 'Комментарий к адресу', 'Зона доставки', 'Время доставки', 'Дата создания', 'Время на кухню', 'Доставить к', 'Плановое время', 'Комментарий к заказу', 'Общее время', 'Скидка %', 'К оплате', 'Сдача', 'Способ оплаты', 'Курьер'],
  
  // Тестовые данные
  ['9086195', 'Исполнен', 'Доставка', '+380501234567', 'Денис Дзюба', '5', 'VIP клиент', 'Київ, вул. Сергія Данченка, 32', 'Зустріч з кур\'єром на заправці ОККО', 'Зона 1 Ближние', '15мин', '22.09.2025 08:55', '09:00', '11:00', '12:00', 'GLOVO: 101436402710, CODE: 028', '45мин', '0', '679,00', '0', 'Готівка', 'Негода Юрій'],
  
  ['9086320', 'Исполнен', 'Самовивіз', '+380507654321', 'Трегубов Всеслав', '12', '', 'Київ, вул. Автозаводська, 9а', 'Зателефонувати за 5 хв', 'Зона 0', '10мин', '22.09.2025 10:19', '10:30', '11:30', '11:30', '', '1ч. 12мин', '31,00', '1620,00', '48,00', 'Готівка', 'Онищенко Андрій'],
  
  ['9086243', 'Исполнен', 'Доставка', '+380509876543', 'Maria', '3', '', 'Київ, вул. Хрещатик, 1', 'Очікувати біля світлофору', 'Зона 2 Средние', '25мин', '22.09.2025 10:05', '10:15', '11:15', '11:15', 'Специальные требования', '1ч. 30мин', '0', '3815,00', '0', 'безготівка Портмоне', 'Осадченко Іван']
];

async function testNewStructure() {
  console.log('🧪 Тестируем новую структуру таблицы...\n');
  
  const excelService = new ExcelService();
  
  console.log('📋 Новая структура данных:');
  console.log('Заголовки:', newStructureData[0]);
  console.log('Количество строк данных:', newStructureData.length - 1);
  
  try {
    const result = await excelService.processSheetData(newStructureData, 'orders');
    
    console.log('\n🎯 РЕЗУЛЬТАТ:');
    console.log(`✅ Заказов: ${result.orders.length}`);
    console.log(`👥 Курьеров: ${result.couriers.length}`);
    console.log(`💳 Способов оплаты: ${result.paymentMethods.length}`);
    console.log(`❌ Ошибок: ${result.errors.length}`);
    console.log(`⚠️  Предупреждений: ${result.warnings.length}`);
    
    if (result.orders.length > 0) {
      console.log('\n📋 Детали заказов:');
      result.orders.forEach((order, i) => {
        console.log(`\n${i + 1}. Заказ #${order.orderNumber}:`);
        console.log(`   Статус: ${order.status}`);
        console.log(`   Тип: ${order.orderType}`);
        console.log(`   Клиент: ${order.customerName} (${order.phone})`);
        console.log(`   Всего заказов: ${order.totalOrders}`);
        console.log(`   Адрес: ${order.address}`);
        console.log(`   Зона: ${order.deliveryZone}`);
        console.log(`   Время доставки: ${order.deliveryTime}`);
        console.log(`   Сумма: ${order.amount} грн`);
        console.log(`   Скидка: ${order.discountPercent}%`);
        console.log(`   Способ оплаты: ${order.paymentMethod}`);
        console.log(`   Курьер: ${order.courier}`);
        if (order.orderComment) console.log(`   Комментарий: ${order.orderComment}`);
        if (order.addressComment) console.log(`   Комментарий к адресу: ${order.addressComment}`);
      });
    }
    
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
    
    console.log('\n📊 JSON результат (первый заказ):');
    if (result.orders.length > 0) {
      console.log(JSON.stringify(result.orders[0], null, 2));
    }
    
  } catch (error) {
    console.error('❌ Ошибка тестирования:', error);
  }
}

testNewStructure();
