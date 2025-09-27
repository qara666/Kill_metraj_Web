const XLSX = require('xlsx');

class ExcelService_v2 {
  constructor() {
    this.debugLogs = [];
  }

  addDebugLog(message, data = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      message,
      data: data ? JSON.stringify(data, null, 2) : null
    };
    this.debugLogs.push(logEntry);
    console.log(`[DEBUG] ${message}`, data || '');
  }

  async processExcelFile(buffer) {
    this.debugLogs = [];
    this.addDebugLog('Начало обработки Excel файла v2');
    
    try {
      const workbook = XLSX.read(buffer, { 
        type: 'buffer',
        cellDates: true,
        cellNF: false,
        cellText: false,
        raw: false
      });
      
      this.addDebugLog('Excel файл успешно прочитан', {
        sheetNames: workbook.SheetNames,
        totalSheets: workbook.SheetNames.length
      });

      const result = {
        orders: [],
        couriers: [],
        paymentMethods: [],
        addresses: [],
        routes: [],
        errors: [],
        warnings: [],
        statistics: {
          totalOrders: 0,
          totalAmount: 0,
          averageAmount: 0,
          deliveryCount: 0,
          pickupCount: 0,
          courierStats: {},
          paymentStats: {},
          zoneStats: {}
        },
        debug: {
          logs: this.debugLogs,
          sheets: [],
          headerMap: {},
          rawData: [],
          totalRows: 0,
          processedRows: 0
        }
      };

      // Обрабатываем каждый лист
      for (const sheetName of workbook.SheetNames) {
        this.addDebugLog(`Обработка листа: ${sheetName}`);
        
        const sheet = workbook.Sheets[sheetName];
        const sheetData = this.processSheet(sheet, sheetName);
        
        result.orders.push(...sheetData.orders);
        result.couriers.push(...sheetData.couriers);
        result.paymentMethods.push(...sheetData.paymentMethods);
        result.addresses.push(...sheetData.addresses);
        result.errors.push(...sheetData.errors);
        result.warnings.push(...sheetData.warnings);
        
        result.debug.sheets.push({
          name: sheetName,
          orders: sheetData.orders.length,
          errors: sheetData.errors.length,
          warnings: sheetData.warnings.length
        });
      }

      // Удаляем дубликаты
      result.couriers = this.removeDuplicateCouriers(result.couriers);
      result.paymentMethods = this.removeDuplicatePaymentMethods(result.paymentMethods);
      result.addresses = this.removeDuplicateAddresses(result.addresses);

      // Рассчитываем статистику
      result.statistics = this.calculateStatistics(result.orders);

      this.addDebugLog('Обработка завершена', {
        totalOrders: result.orders.length,
        totalCouriers: result.couriers.length,
        totalPaymentMethods: result.paymentMethods.length,
        errors: result.errors.length,
        warnings: result.warnings.length
      });

      return {
        success: true,
        data: result,
        summary: {
          totalOrders: result.orders.length,
          totalCouriers: result.couriers.length,
          totalPaymentMethods: result.paymentMethods.length,
          successfulGeocoding: 0,
          failedGeocoding: result.orders.length,
          errors: result.errors.length,
          warnings: result.warnings.length
        },
        message: 'Файл успешно обработан v2'
      };

    } catch (error) {
      this.addDebugLog('Ошибка обработки файла', { error: error.message });
      return {
        success: false,
        data: {
          orders: [],
          couriers: [],
          paymentMethods: [],
          addresses: [],
          routes: [],
          errors: [error.message],
          warnings: [],
          statistics: {
            totalOrders: 0,
            totalAmount: 0,
            averageAmount: 0,
            deliveryCount: 0,
            pickupCount: 0,
            courierStats: {},
            paymentStats: {},
            zoneStats: {}
          },
          debug: {
            logs: this.debugLogs,
            sheets: [],
            headerMap: {},
            rawData: [],
            totalRows: 0,
            processedRows: 0
          }
        },
        summary: {
          totalOrders: 0,
          totalCouriers: 0,
          totalPaymentMethods: 0,
          successfulGeocoding: 0,
          failedGeocoding: 0,
          errors: 1,
          warnings: 0
        },
        message: `Ошибка обработки файла: ${error.message}`
      };
    }
  }

  processSheet(sheet, sheetName) {
    this.addDebugLog(`Обработка листа "${sheetName}"`);
    
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    if (jsonData.length === 0) {
      this.addDebugLog(`Лист "${sheetName}" пуст`);
      return {
        orders: [],
        couriers: [],
        paymentMethods: [],
        addresses: [],
        errors: [],
        warnings: []
      };
    }

    const headers = jsonData[0];
    const dataRows = jsonData.slice(1);
    
    this.addDebugLog(`Заголовки листа "${sheetName}"`, {
      headers,
      headersCount: headers.length,
      headersString: headers.join(' | ')
    });

    // Маппинг заголовков
    const headerMap = this.mapHeaders(headers);
    
    this.addDebugLog(`Маппинг заголовков для "${sheetName}"`, headerMap);

    const orders = [];
    const couriers = [];
    const paymentMethods = [];
    const addresses = [];
    const errors = [];
    const warnings = [];

    this.addDebugLog(`Начинаем обработку ${dataRows.length} строк данных`);

    // Обрабатываем каждую строку данных
    dataRows.forEach((row, index) => {
      try {
        const rowNumber = index + 2; // +2 потому что начинаем с 1 и пропускаем заголовки
        
        this.addDebugLog(`Обработка строки ${rowNumber}`, {
          row,
          rowLength: row.length,
          addressValue: row[headerMap.address] || '',
          hasAddress: !!(row[headerMap.address] && row[headerMap.address].toString().trim())
        });

        // Проверяем, что строка содержит необходимые данные
        if (!this.isValidOrderRow(row, headerMap)) {
          this.addDebugLog(`Строка ${rowNumber} пропущена - недостаточно данных`);
          return;
        }

        const order = this.processOrderRow(row, headerMap, rowNumber);
        
        if (order) {
          orders.push(order);
          
          // Добавляем курьера
          if (order.courier) {
            couriers.push({
              name: order.courier,
              orders: 1
            });
          }
          
          // Добавляем способ оплаты
          if (order.paymentMethod) {
            paymentMethods.push({
              method: order.paymentMethod,
              orders: 1
            });
          }
          
          // Добавляем адрес
          if (order.address) {
            addresses.push({
              address: order.address,
              orders: 1
            });
          }
        }
        
      } catch (error) {
        const errorMsg = `Ошибка обработки строки ${index + 2}: ${error.message}`;
        this.addDebugLog(errorMsg);
        errors.push(errorMsg);
      }
    });

    this.addDebugLog(`Обработано строк: ${orders.length} из ${dataRows.length}`);

    return {
      orders,
      couriers,
      paymentMethods,
      addresses,
      errors,
      warnings
    };
  }

  mapHeaders(headers) {
    this.addDebugLog('Начинаем маппинг заголовков', { headers });
    
    const headerMap = {};
    
    headers.forEach((header, index) => {
      if (!header) return;
      
      const originalHeader = header;
      const normalizedHeader = header.toString().toLowerCase().trim();
      const noApostrophes = normalizedHeader.replace(/['"]/g, '');
      
      this.addDebugLog(`Анализ заголовка ${index}: "${originalHeader}" -> "${normalizedHeader}"`);
      
      // ИМЯ КЛИЕНТА - проверяем ПЕРВЫМ с точными совпадениями
      if (includesAny(noApostrophes, ['заказчик (имя)', 'клиент (имя)'])) {
        if (headerMap.customerName === undefined) {
          headerMap.customerName = index;
          this.addDebugLog(`Найден имя клиента в колонке ${index}: "${originalHeader}"`);
        }
      }
      // СУММА - проверяем с точными критериями!
      else if (includesAny(noApostrophes, ['сумма заказа', 'сумма', 'amount', 'price', 'стоимость', 'вартість', 'суммы', 'amounts', 'prices', 'цена', 'стоимость заказа', 'к оплате', 'to pay', 'оплате', 'pay', 'сумма к оплате', 'к оплате сумма']) &&
               !includesAny(noApostrophes, ['номер', '№', 'number', 'id'])) { // исключаем номера
        if (headerMap.amount === undefined) {
          headerMap.amount = index;
          this.addDebugLog(`Найден сумма в колонке ${index}: "${originalHeader}"`);
        }
      }
      // НОМЕР ЗАКАЗА - проверяем после суммы, но исключаем "заказчик"
      else if (includesAny(noApostrophes, ['номер', '№', 'number', 'id', 'заказ', 'замовлення']) &&
               !includesAny(noApostrophes, ['сумма', 'amount', 'price', 'стоимость', 'оплате', 'заказчик', 'клиент'])) {
        if (headerMap.orderNumber === undefined) {
          headerMap.orderNumber = index;
          this.addDebugLog(`Найден номер заказа в колонке ${index}: "${originalHeader}"`);
        }
      }
      // СТАТУС
      else if (includesAny(noApostrophes, ['состояние', 'статус', 'status', 'state'])) {
        if (headerMap.status === undefined) {
          headerMap.status = index;
          this.addDebugLog(`Найден статус в колонке ${index}: "${originalHeader}"`);
        }
      }
      // АДРЕС
      else if (includesAny(noApostrophes, ['адрес', 'address', 'доставки', 'delivery'])) {
        if (headerMap.address === undefined) {
          headerMap.address = index;
          this.addDebugLog(`Найден адрес в колонке ${index}: "${originalHeader}"`);
        }
      }
      // КУРЬЕР
      else if (includesAny(noApostrophes, ['курьер', 'courier', 'доставщик', 'delivery', 'driver'])) {
        if (headerMap.courier === undefined) {
          headerMap.courier = index;
          this.addDebugLog(`Найден курьер в колонке ${index}: "${originalHeader}"`);
        }
      }
      // СПОСОБ ОПЛАТЫ
      else if (includesAny(noApostrophes, ['оплаты', 'payment', 'способ', 'method', 'оплата', 'pay'])) {
        if (headerMap.paymentMethod === undefined) {
          headerMap.paymentMethod = index;
          this.addDebugLog(`Найден способ оплаты в колонке ${index}: "${originalHeader}"`);
        }
      }
      // ТЕЛЕФОН
      else if (includesAny(noApostrophes, ['телефон', 'phone', 'тел', 'мобильный', 'mobile'])) {
        if (headerMap.phone === undefined) {
          headerMap.phone = index;
          this.addDebugLog(`Найден телефон в колонке ${index}: "${originalHeader}"`);
        }
      }
      // ИМЯ КЛИЕНТА - общие совпадения (если не найдено точное)
      else if (includesAny(noApostrophes, ['заказчик', 'клиент', 'имя', 'customer', 'name']) &&
               !includesAny(noApostrophes, ['номер', '№', 'number', 'id', 'заказ', 'замовлення'])) {
        if (headerMap.customerName === undefined) {
          headerMap.customerName = index;
          this.addDebugLog(`Найден имя клиента в колонке ${index}: "${originalHeader}"`);
        }
      }
      // КОММЕНТАРИИ
      else if (includesAny(noApostrophes, ['комментарии', 'комментарий', 'comment', 'примечание', 'note'])) {
        if (headerMap.comment === undefined) {
          headerMap.comment = index;
          this.addDebugLog(`Найден комментарий в колонке ${index}: "${originalHeader}"`);
        }
      }
    });
    
    this.addDebugLog('Маппинг заголовков завершен', headerMap);
    return headerMap;
  }

  isValidOrderRow(row, headerMap) {
    const hasOrderNumber = headerMap.orderNumber !== undefined && row[headerMap.orderNumber];
    const hasAddress = headerMap.address !== undefined && row[headerMap.address];
    const hasCourier = headerMap.courier !== undefined && row[headerMap.courier];
    const hasPaymentMethod = headerMap.paymentMethod !== undefined && row[headerMap.paymentMethod];
    
    this.addDebugLog(`Анализ строки ${row[0] || 'unknown'}`, {
      hasOrderNumber,
      hasAddress,
      hasCourier,
      hasPaymentMethod,
      addressValue: row[headerMap.address] || ''
    });
    
    // Если нет номера заказа, но есть адрес, курьер и способ оплаты - считаем валидным
    // Номер заказа будет сгенерирован автоматически
    return hasAddress && hasCourier && hasPaymentMethod;
  }

  processOrderRow(row, headerMap, rowNumber) {
    try {
      // Парсинг суммы
      let amount = 0;
      if (headerMap.amount !== undefined && row[headerMap.amount]) {
        const amountValue = row[headerMap.amount];
        this.addDebugLog(`Парсинг суммы из строки ${rowNumber}`, { 
          rawValue: amountValue, 
          type: typeof amountValue,
          stringValue: amountValue.toString()
        });
        
        if (typeof amountValue === 'number') {
          amount = amountValue;
        } else {
          const stringValue = amountValue.toString().trim();
          const cleanValue = stringValue.replace(/[^\d.,]/g, '');
          const normalizedValue = cleanValue.replace(',', '.');
          amount = parseFloat(normalizedValue) || 0;
        }
      }

      // Генерируем номер заказа если его нет
      const orderNumber = row[headerMap.orderNumber]?.toString().trim() || `AUTO_${rowNumber}`;
      
      const order = {
        id: `ORDER_${rowNumber}`,
        orderNumber: orderNumber,
        status: row[headerMap.status]?.toString().trim() || 'Неизвестно',
        type: row[headerMap.type]?.toString().trim() || 'Доставка',
        customer: {
          name: row[headerMap.customerName]?.toString().trim() || '',
          phone: row[headerMap.phone]?.toString().trim() || ''
        },
        address: row[headerMap.address]?.toString().trim() || '',
        financial: {
          amount: amount,
          currency: 'UAH',
          paymentMethod: row[headerMap.paymentMethod]?.toString().trim() || '',
          discount: 0
        },
        timing: {
          created: new Date().toISOString(),
          updated: new Date().toISOString()
        },
        courier: row[headerMap.courier]?.toString().trim() || '',
        comment: row[headerMap.comment]?.toString().trim() || '',
        geocoded: false,
        rowNumber: rowNumber,
        // Дополнительные поля для совместимости
        phone: row[headerMap.phone]?.toString().trim() || '',
        customerName: row[headerMap.customerName]?.toString().trim() || '',
        amount: amount,
        paymentMethod: row[headerMap.paymentMethod]?.toString().trim() || '',
        orderComment: row[headerMap.comment]?.toString().trim() || ''
      };

      this.addDebugLog(`Обработан заказ из строки ${rowNumber}`, order);
      this.addDebugLog(`Создан заказ #${order.orderNumber}`, order);
      
      return order;
      
    } catch (error) {
      this.addDebugLog(`Ошибка обработки строки ${rowNumber}: ${error.message}`);
      return null;
    }
  }

  removeDuplicateCouriers(couriers) {
    this.addDebugLog('Создание уникальных курьеров и способов оплаты');
    const uniqueCouriers = [];
    const seenCouriers = new Set();
    
    couriers.forEach(courier => {
      if (!seenCouriers.has(courier.name)) {
        seenCouriers.add(courier.name);
        uniqueCouriers.push(courier);
      }
    });
    
    this.addDebugLog('Созданы уникальные списки', { couriers: uniqueCouriers.length });
    return uniqueCouriers;
  }

  removeDuplicatePaymentMethods(paymentMethods) {
    const uniqueMethods = [];
    const seenMethods = new Set();
    
    paymentMethods.forEach(method => {
      if (!seenMethods.has(method.method)) {
        seenMethods.add(method.method);
        uniqueMethods.push(method);
      }
    });
    
    return uniqueMethods;
  }

  removeDuplicateAddresses(addresses) {
    const uniqueAddresses = [];
    const seenAddresses = new Set();
    
    addresses.forEach(address => {
      if (!seenAddresses.has(address.address)) {
        seenAddresses.add(address.address);
        uniqueAddresses.push(address);
      }
    });
    
    return uniqueAddresses;
  }

  calculateStatistics(orders) {
    this.addDebugLog('Структурирование данных');
    
    const totalOrders = orders.length;
    const totalAmount = orders.reduce((sum, order) => sum + (order.amount || 0), 0);
    const averageAmount = totalOrders > 0 ? totalAmount / totalOrders : 0;
    
    const deliveryCount = orders.filter(order => 
      order.type?.toLowerCase().includes('доставка') || 
      order.type?.toLowerCase().includes('delivery')
    ).length;
    
    const pickupCount = orders.filter(order => 
      order.type?.toLowerCase().includes('самовывоз') || 
      order.type?.toLowerCase().includes('pickup')
    ).length;

    const stats = {
      totalOrders,
      totalAmount,
      averageAmount,
      deliveryCount,
      pickupCount,
      courierStats: {},
      paymentStats: {},
      zoneStats: {}
    };

    this.addDebugLog('Статистика рассчитана', stats);
    return stats;
  }
}

// Вспомогательная функция
function includesAny(text, keywords) {
  return keywords.some(keyword => text.includes(keyword));
}

module.exports = ExcelService_v2;
