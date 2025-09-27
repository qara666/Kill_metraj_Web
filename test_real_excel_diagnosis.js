// Диагностика реального Excel файла

const ExcelService = require('./backend/src/services/ExcelService');
const XLSX = require('xlsx');
const fs = require('fs');

async function testRealExcelDiagnosis() {
  console.log('🔍 ДИАГНОСТИКА РЕАЛЬНОГО EXCEL ФАЙЛА...\n');
  
  // Проверяем, есть ли тестовый Excel файл
  const testFiles = ['test.xlsx', 'test_sample.kmz', 'sample.xlsx'];
  let excelFile = null;
  
  for (const file of testFiles) {
    if (fs.existsSync(file)) {
      excelFile = file;
      break;
    }
  }
  
  if (!excelFile) {
    console.log('❌ Тестовый Excel файл не найден. Создаем тестовый файл...');
    
    // Создаем тестовый Excel файл с реальной структурой
    const testData = [
      ['Номер', 'Состояние', 'Тип заказа', 'Телефон', 'Заказчик', 'Всего заказов', 'Комментарий к заказчику', 'Адрес', 'Комментарий к адресу', 'Зона доставки', 'Время доставки', 'Дата создания', 'Время на кухню', 'Доставить к', 'Плановое время', 'Комментарий к заказу', 'Общее время', 'Скидка %', 'К оплате', 'Сдача', 'Способ оплаты', 'Курьер'],
      ['9086195', 'Исполнен', 'Доставка', '+380501234567', 'Денис Дзюба', '5', 'VIP клиент', 'Київ, вул. Сергія Данченка, 32', 'Зустріч з кур\'єром на заправці ОККО', 'Зона 1 Ближние', '15мин', '22.09.2025 08:55', '09:00', '11:00', '12:00', 'GLOVO: 101436402710, CODE: 028', '45мин', '0', '679,00', '0', 'Готівка', 'Негода Юрій'],
      ['9086320', 'Исполнен', 'Самовивіз', '+380507654321', 'Трегубов Всеслав', '12', '', 'Київ, вул. Автозаводська, 9а', 'Зателефонувати за 5 хв', 'Зона 0', '10мин', '22.09.2025 10:19', '10:30', '11:30', '11:30', '', '1ч. 12мин', '31,00', '1620,00', '48,00', 'Готівка', 'Онищенко Андрій']
    ];
    
    const worksheet = XLSX.utils.aoa_to_sheet(testData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders');
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    fs.writeFileSync('test_real.xlsx', excelBuffer);
    excelFile = 'test_real.xlsx';
    console.log('✅ Создан тестовый файл: test_real.xlsx');
  }
  
  console.log(`📁 Используем файл: ${excelFile}`);
  
  try {
    // Читаем Excel файл
    const buffer = fs.readFileSync(excelFile);
    console.log(`📊 Размер файла: ${buffer.length} байт`);
    
    // Анализируем структуру Excel файла
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    console.log(`📋 Листы: ${workbook.SheetNames.join(', ')}`);
    
    // Анализируем каждый лист
    for (const sheetName of workbook.SheetNames) {
      console.log(`\n🔍 Анализ листа: "${sheetName}"`);
      
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
      
      console.log(`   📊 Строк: ${data.length}`);
      console.log(`   📋 Заголовки: ${data[0] ? data[0].length : 0}`);
      
      if (data.length > 0) {
        console.log(`   📝 Первая строка (заголовки):`);
        console.log(`      ${JSON.stringify(data[0])}`);
        
        if (data.length > 1) {
          console.log(`   📝 Вторая строка (данные):`);
          console.log(`      ${JSON.stringify(data[1])}`);
        }
        
        // Проверяем наличие адресов
        const hasAddress = data.some(row => 
          row.some(cell => 
            cell && cell.toString().toLowerCase().includes('адрес')
          )
        );
        console.log(`   🏠 Есть колонка с адресами: ${hasAddress}`);
        
        // Проверяем наличие данных в строках
        const dataRows = data.slice(1).filter(row => 
          row.some(cell => cell && cell.toString().trim() !== '')
        );
        console.log(`   📊 Строк с данными: ${dataRows.length}`);
        
        if (dataRows.length > 0) {
          console.log(`   📝 Пример данных:`);
          dataRows.slice(0, 2).forEach((row, i) => {
            console.log(`      Строка ${i + 2}: ${JSON.stringify(row)}`);
          });
        }
      }
    }
    
    // Тестируем обработку через ExcelService
    console.log('\n🧪 ТЕСТИРОВАНИЕ ЧЕРЕЗ EXCELSERVICE:');
    
    const excelService = new ExcelService();
    const result = await excelService.processExcelFile(buffer);
    
    console.log(`✅ Успешно: ${result.success}`);
    
    if (result.success) {
      console.log(`📊 Заказов: ${result.data.orders.length}`);
      console.log(`👥 Курьеров: ${result.data.couriers.length}`);
      console.log(`💳 Способов оплаты: ${result.data.paymentMethods.length}`);
      console.log(`🏠 Адресов: ${result.data.addresses ? result.data.addresses.length : 0}`);
      console.log(`❌ Ошибок: ${result.data.errors.length}`);
      console.log(`⚠️  Предупреждений: ${result.data.warnings.length}`);
      
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
      
      if (result.data.orders.length > 0) {
        console.log('\n📋 Обработанные заказы:');
        result.data.orders.forEach((order, i) => {
          console.log(`  ${i + 1}. #${order.id} - ${order.customer.name} - ${order.address.full}`);
        });
      } else {
        console.log('\n❌ ПРОБЛЕМА: Заказы не обработаны!');
        console.log('🔍 Возможные причины:');
        console.log('   - Нет колонки с адресами');
        console.log('   - Все ячейки адресов пустые');
        console.log('   - Неправильные заголовки');
        console.log('   - Проблема с распознаванием заголовков');
      }
      
    } else {
      console.log(`❌ Ошибка обработки: ${result.error}`);
    }
    
  } catch (error) {
    console.error('❌ Ошибка диагностики:', error);
  }
}

testRealExcelDiagnosis();
