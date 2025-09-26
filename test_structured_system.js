// Тест структурированной системы

const ExcelService = require('./backend/src/services/ExcelService_structured');
const XLSX = require('xlsx');

// Тестовые данные
const testData = [
  ['Номер', 'Состояние', 'Тип заказа', 'Телефон', 'Заказчик', 'Всего заказов', 'Комментарий к заказчику', 'Адрес', 'Комментарий к адресу', 'Зона доставки', 'Время доставки', 'Дата создания', 'Время на кухню', 'Доставить к', 'Плановое время', 'Комментарий к заказу', 'Общее время', 'Скидка %', 'К оплате', 'Сдача', 'Способ оплаты', 'Курьер'],
  ['9086195', 'Исполнен', 'Доставка', '+380501234567', 'Денис Дзюба', '5', 'VIP клиент', 'Київ, вул. Сергія Данченка, 32', 'Зустріч з кур\'єром на заправці ОККО', 'Зона 1 Ближние', '15мин', '22.09.2025 08:55', '09:00', '11:00', '12:00', 'GLOVO: 101436402710, CODE: 028', '45мин', '0', '679,00', '0', 'Готівка', 'Негода Юрій'],
  ['9086320', 'Исполнен', 'Самовивіз', '+380507654321', 'Трегубов Всеслав', '12', '', 'Київ, вул. Автозаводська, 9а', 'Зателефонувати за 5 хв', 'Зона 0', '10мин', '22.09.2025 10:19', '10:30', '11:30', '11:30', '', '1ч. 12мин', '31,00', '1620,00', '48,00', 'Готівка', 'Онищенко Андрій'],
  ['9086243', 'Исполнен', 'Доставка', '+380509876543', 'Maria', '3', '', 'Київ, вул. Хрещатик, 1', 'Очікувати біля світлофору', 'Зона 2 Средние', '25мин', '22.09.2025 10:05', '10:15', '11:15', '11:15', 'Специальные требования', '1ч. 30мин', '0', '3815,00', '0', 'безготівка Портмоне', 'Осадченко Іван'],
  ['9086165', 'Исполнен', 'Доставка', '+380501112233', 'Крістіна', '8', 'Постоянный клиент', 'Київ, вул. Шевченка, 15', 'Код домофона: 1234', 'Зона пешие ресторан', '20мин', '22.09.2025 11:30', '11:45', '12:45', '12:45', 'Без лука', '1ч. 15мин', '15,00', '450,00', '0', 'тормінал Кухня', 'Якушев Глеб'],
  ['9086100', 'Новый', 'Доставка', '+380509999999', 'Андрей', '1', '', 'Київ, вул. Сергія Данченка, 32', 'Тот же адрес что и у Дениса', 'Зона 1 Ближние', '15мин', '22.09.2025 12:00', '12:15', '13:15', '13:15', 'Новый заказ', '1ч. 00мин', '0', '250,00', '0', 'Готівка', 'Негода Юрій']
];

// Создаем Excel файл
const worksheet = XLSX.utils.aoa_to_sheet(testData);
const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders');
const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

async function testStructuredSystem() {
  console.log('🧪 ТЕСТ СТРУКТУРИРОВАННОЙ СИСТЕМЫ...\n');
  
  const excelService = new ExcelService();
  
  try {
    const result = await excelService.processExcelFile(excelBuffer);
    
    console.log('🎯 РЕЗУЛЬТАТ:');
    console.log(`✅ Успешно: ${result.success}`);
    
    if (result.success) {
      console.log(`📊 Заказов: ${result.data.orders.length}`);
      console.log(`👥 Курьеров: ${result.data.couriers.length}`);
      console.log(`💳 Способов оплаты: ${result.data.paymentMethods.length}`);
      console.log(`🏠 Адресов: ${result.data.addresses.length}`);
      console.log(`❌ Ошибок: ${result.data.errors.length}`);
      console.log(`⚠️  Предупреждений: ${result.data.warnings.length}`);
      
      // Показываем структурированные заказы
      console.log('\n📋 СТРУКТУРИРОВАННЫЕ ЗАКАЗЫ:');
      result.data.orders.forEach((order, i) => {
        console.log(`\n${i + 1}. Заказ #${order.id} (${order.status})`);
        console.log(`   👤 Клиент: ${order.customer.name} | Телефон: ${order.customer.phone}`);
        console.log(`   📍 Адрес: ${order.address.full} | Зона: ${order.address.zone}`);
        console.log(`   💰 Сумма: ${order.financial.amount} грн | Оплата: ${order.financial.paymentMethod}`);
        console.log(`   🚚 Курьер: ${order.courier}`);
        if (order.comment) console.log(`   💬 Комментарий: ${order.comment}`);
      });
      
      // Показываем группировку по курьерам
      console.log('\n👥 ГРУППИРОВКА ПО КУРЬЕРАМ:');
      result.data.couriers.forEach(courier => {
        console.log(`\n🚚 ${courier.name}:`);
        console.log(`   📊 Заказов: ${courier.orderCount} | Сумма: ${courier.totalAmount} грн`);
        console.log(`   🏠 Зоны: ${courier.zones.join(', ')}`);
        console.log(`   💳 Способы оплаты: ${courier.paymentMethods.join(', ')}`);
        console.log(`   📋 Заказы:`);
        courier.orders.forEach(order => {
          console.log(`     - #${order.id}: ${order.customer} | ${order.address} | ${order.amount} грн`);
        });
      });
      
      // Показываем группировку по способам оплаты
      console.log('\n💳 ГРУППИРОВКА ПО СПОСОБАМ ОПЛАТЫ:');
      result.data.paymentMethods.forEach(payment => {
        console.log(`\n💰 ${payment.method}:`);
        console.log(`   📊 Заказов: ${payment.orderCount} | Сумма: ${payment.totalAmount} грн | Средняя: ${payment.averageAmount.toFixed(2)} грн`);
        console.log(`   📋 Заказы:`);
        payment.orders.forEach(order => {
          console.log(`     - #${order.id}: ${order.customer} | ${order.amount} грн | ${order.status}`);
        });
      });
      
      // Показываем группировку по адресам
      console.log('\n🏠 ГРУППИРОВКА ПО АДРЕСАМ:');
      result.data.addresses.forEach(address => {
        console.log(`\n📍 ${address.address}:`);
        console.log(`   📊 Заказов: ${address.orderCount} | Сумма: ${address.totalAmount} грн`);
        console.log(`   🏠 Зоны: ${address.zones.join(', ')}`);
        console.log(`   🚚 Курьеры: ${address.couriers.join(', ')}`);
        console.log(`   📋 Заказы:`);
        address.orders.forEach(order => {
          console.log(`     - #${order.id}: ${order.customer} | ${order.courier} | ${order.amount} грн`);
        });
      });
      
      // Показываем статистику
      console.log('\n📊 ОБЩАЯ СТАТИСТИКА:');
      const stats = result.data.statistics;
      console.log(`   📈 Всего заказов: ${stats.totalOrders}`);
      console.log(`   💰 Общая сумма: ${stats.totalAmount} грн`);
      console.log(`   📊 Средняя сумма: ${stats.averageAmount.toFixed(2)} грн`);
      console.log(`   🚚 Доставка: ${stats.deliveryCount} | 🏪 Самовывоз: ${stats.pickupCount}`);
      
      console.log('\n👥 СТАТИСТИКА КУРЬЕРОВ:');
      Object.entries(stats.courierStats).forEach(([courier, data]) => {
        console.log(`   ${courier}: ${data.orderCount} заказов | ${data.totalAmount} грн | ${data.zones} зон`);
      });
      
      console.log('\n💳 СТАТИСТИКА ОПЛАТЫ:');
      Object.entries(stats.paymentStats).forEach(([method, data]) => {
        console.log(`   ${method}: ${data.orderCount} заказов | ${data.totalAmount} грн | ${data.averageAmount.toFixed(2)} грн средняя`);
      });
      
      console.log('\n🏠 СТАТИСТИКА ЗОН:');
      Object.entries(stats.zoneStats).forEach(([zone, data]) => {
        console.log(`   ${zone}: ${data.orderCount} заказов | ${data.totalAmount} грн | ${data.couriers.length} курьеров`);
      });
      
    } else {
      console.log(`❌ Ошибка: ${result.error}`);
    }
    
  } catch (error) {
    console.error('❌ Ошибка тестирования:', error);
  }
}

testStructuredSystem();
