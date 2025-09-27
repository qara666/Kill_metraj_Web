const ExcelService_v2 = require('./backend/src/services/ExcelService_v2');
const fs = require('fs');

async function testExcelV2() {
  try {
    console.log('🔍 Тестируем ExcelService_v2...');
    
    if (!fs.existsSync('test_real_headers.xlsx')) {
      console.log('❌ Файл test_real_headers.xlsx не найден');
      return;
    }
    
    const excelService = new ExcelService_v2();
    const buffer = fs.readFileSync('test_real_headers.xlsx');
    
    console.log('📤 Обрабатываем файл с ExcelService_v2...');
    const result = await excelService.processExcelFile(buffer);
    
    console.log('\n📊 РЕЗУЛЬТАТ ExcelService_v2:');
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
        log.message.includes('Найден') ||
        log.message.includes('Маппинг заголовков')
      );
      
      if (mappingLogs.length > 0) {
        console.log('\n🔍 ЛОГИ МАППИНГА ЗАГОЛОВКОВ:');
        mappingLogs.forEach(log => {
          console.log(`  ${log.message}`);
        });
      }
    }
    
    if (result.data?.orders?.length > 0) {
      console.log('\n🎉 УСПЕХ! ExcelService_v2 работает!');
      console.log('📊 Все заказы:');
      result.data.orders.forEach((order, index) => {
        console.log(`  ${index + 1}. Заказ #${order.orderNumber}: ${order.amount} грн, ${order.customerName}, ${order.courier}`);
      });
    } else {
      console.log('\n❌ ПРОБЛЕМА: ExcelService_v2 возвращает 0 заказов');
    }
    
  } catch (error) {
    console.error('❌ Ошибка:', error.message);
    console.error('🔍 Детали:', error);
  }
}

testExcelV2();
