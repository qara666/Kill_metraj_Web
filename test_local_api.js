const ExcelService = require('./backend/src/services/ExcelService');
const fs = require('fs');

async function testLocalAPI() {
  try {
    console.log('🔍 Тестируем локальный ExcelService...');
    
    if (!fs.existsSync('test_real_headers.xlsx')) {
      console.log('❌ Файл test_real_headers.xlsx не найден');
      return;
    }
    
    const excelService = new ExcelService();
    const buffer = fs.readFileSync('test_real_headers.xlsx');
    
    console.log('📤 Обрабатываем файл...');
    const result = await excelService.processExcelFile(buffer);
    
    console.log('\n📊 РЕЗУЛЬТАТ ЛОКАЛЬНОГО API:');
    console.log('✅ Success:', result.success);
    console.log('📦 Orders:', result.data?.orders?.length || 0);
    console.log('💰 Total Amount:', result.data?.statistics?.totalAmount || 0);
    console.log('👥 Couriers:', result.data?.couriers?.length || 0);
    console.log('💳 Payment Methods:', result.data?.paymentMethods?.length || 0);
    console.log('❌ Errors:', result.data?.errors?.length || 0);
    
    if (result.data?.debug?.logs) {
      console.log('🔍 Debug Logs:', result.data.debug.logs.length, 'entries');
      
      // Показываем логи маппинга заголовков
      const mappingLogs = result.data.debug.logs.filter(log => 
        log.message.includes('Маппинг заголовков') || 
        log.message.includes('Найден') ||
        log.message.includes('amount') ||
        log.message.includes('к оплате')
      );
      
      if (mappingLogs.length > 0) {
        console.log('\n🔍 ЛОГИ МАППИНГА ЗАГОЛОВКОВ:');
        mappingLogs.forEach(log => {
          console.log(`  ${log.message}`);
        });
      }
    }
    
    if (result.data?.orders?.length > 0) {
      console.log('\n🎉 УСПЕХ! Локальный API работает!');
      console.log('📊 Первый заказ:');
      const firstOrder = result.data.orders[0];
      console.log(`  - Номер: ${firstOrder.orderNumber}`);
      console.log(`  - Сумма: ${firstOrder.amount}`);
      console.log(`  - Клиент: ${firstOrder.customerName}`);
    } else {
      console.log('\n❌ ПРОБЛЕМА: Локальный API возвращает 0 заказов');
    }
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    console.error('🔍 Детали:', error);
  }
}

testLocalAPI();
