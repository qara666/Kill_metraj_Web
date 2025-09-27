// Тест с улучшенной диагностикой

const ExcelService = require('./backend/src/services/ExcelService_debug');
const XLSX = require('xlsx');
const fs = require('fs');

async function testDebugExcel() {
  console.log('🔍 ТЕСТ С УЛУЧШЕННОЙ ДИАГНОСТИКОЙ...\n');
  
  // Проверяем существующие файлы
  const testFiles = ['test_real.xlsx', 'test.xlsx', 'sample.xlsx'];
  let excelFile = null;
  
  for (const file of testFiles) {
    if (fs.existsSync(file)) {
      excelFile = file;
      break;
    }
  }
  
  if (!excelFile) {
    console.log('❌ Excel файл не найден. Создаем тестовый файл...');
    
    // Создаем тестовый файл с проблемными данными
    const testData = [
      ['Номер', 'Статус', 'Тип', 'Телефон', 'Клиент', 'Адрес', 'Оплата', 'Курьер', 'Сумма'],
      ['1', 'Новый', 'Доставка', '+380501234567', 'Иван', '', 'Наличные', 'Петр', '100'], // Пустой адрес
      ['2', 'Выполнен', 'Самовывоз', '+380507654321', 'Мария', 'Киев, ул. Другая, 2', 'Карта', 'Анна', '200'],
      ['3', 'Новый', 'Доставка', '+380509876543', 'Петр', 'Киев, ул. Тестовая, 3', 'Наличные', 'Иван', '300']
    ];
    
    const worksheet = XLSX.utils.aoa_to_sheet(testData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Orders');
    const excelBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    fs.writeFileSync('test_debug.xlsx', excelBuffer);
    excelFile = 'test_debug.xlsx';
    console.log('✅ Создан тестовый файл: test_debug.xlsx');
  }
  
  console.log(`📁 Используем файл: ${excelFile}`);
  
  try {
    // Читаем Excel файл
    const buffer = fs.readFileSync(excelFile);
    console.log(`📊 Размер файла: ${buffer.length} байт`);
    
    // Тестируем через ExcelService с диагностикой
    const excelService = new ExcelService();
    const result = await excelService.processExcelFile(buffer);
    
    console.log('\n🎯 РЕЗУЛЬТАТ:');
    console.log(`✅ Успешно: ${result.success}`);
    
    if (result.success) {
      console.log(`📊 Заказов: ${result.data.orders.length}`);
      console.log(`👥 Курьеров: ${result.data.couriers.length}`);
      console.log(`💳 Способов оплаты: ${result.data.paymentMethods.length}`);
      console.log(`🏠 Адресов: ${result.data.addresses ? result.data.addresses.length : 0}`);
      console.log(`❌ Ошибок: ${result.data.errors.length}`);
      console.log(`⚠️  Предупреждений: ${result.data.warnings.length}`);
      
      // Показываем диагностическую информацию
      if (result.data.debug) {
        console.log('\n🔍 ДИАГНОСТИЧЕСКАЯ ИНФОРМАЦИЯ:');
        console.log(`📊 Всего строк в файле: ${result.data.debug.totalRows}`);
        console.log(`📊 Обработано строк: ${result.data.debug.processedRows}`);
        
        if (result.data.debug.sheets) {
          console.log('\n📋 Информация о листах:');
          result.data.debug.sheets.forEach((sheet, i) => {
            console.log(`   ${i + 1}. "${sheet.name}": ${sheet.rows} строк, ${sheet.hasData ? 'есть данные' : 'нет данных'}`);
            if (sheet.headers.length > 0) {
              console.log(`      Заголовки: ${JSON.stringify(sheet.headers)}`);
            }
          });
        }
        
        if (result.data.debug.headerMap) {
          console.log('\n🗺️ Карта заголовков:');
          const map = result.data.debug.headerMap;
          Object.entries(map).forEach(([key, value]) => {
            console.log(`   ${key}: колонка ${value}`);
          });
        }
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
        
        // Дополнительная диагностика
        if (result.data.debug && result.data.debug.headerMap) {
          const map = result.data.debug.headerMap;
          if (map.address === undefined) {
            console.log('   ❌ Колонка с адресами не найдена!');
            console.log('   💡 Проверьте, что в Excel файле есть колонка с названием "Адрес"');
          } else {
            console.log(`   ✅ Колонка с адресами найдена: колонка ${map.address}`);
          }
        }
      }
      
    } else {
      console.log(`❌ Ошибка обработки: ${result.error}`);
    }
    
  } catch (error) {
    console.error('❌ Ошибка тестирования:', error);
  }
}

testDebugExcel();
