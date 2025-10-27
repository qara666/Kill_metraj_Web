const XLSX = require('xlsx');

class ExcelService {
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
    
    if (global.addDebugLog) {
      global.addDebugLog(message, data);
    }
  }

  async processExcelFile(buffer) {
    this.debugLogs = [];
    this.addDebugLog('Начало обработки Excel файла');
    
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
        message: 'Файл успешно обработан'
      };

    } catch (error) {
      this.addDebugLog('Ошибка обработки Excel файла', { error: error.message });
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
        message: `Ошибка обработки: ${error.message}`
      };
    }
  }

  processSheet(sheet, sheetName) {
    this.addDebugLog(`Обработка листа "${sheetName}"`);
    
    // Читаем данные из листа
    const jsonData = XLSX.utils.sheet_to_json(sheet, { 
      header: 1, 
      defval: '',
      raw: false 
    });

    if (jsonData.length < 2) {
      const error = `Лист "${sheetName}" не содержит данных`;
      this.addDebugLog(error);
      return {
        orders: [],
        couriers: [],
        paymentMethods: [],
        addresses: [],
        errors: [error],
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

    // Маппинг заголовков под реальную структуру
    const headerMap = this.mapHeaders(headers);
    
    this.addDebugLog(`Маппинг заголовков для "${sheetName}"`, headerMap);

    if (!headerMap.address) {
      const error = `В листе "${sheetName}" не найдена колонка с адресом`;
      this.addDebugLog(error);
      return {
        orders: [],
        couriers: [],
        paymentMethods: [],
        addresses: [],
        errors: [error],
        warnings: [],
        headerMap
      };
    }

    // Обрабатываем строки
    const orders = [];
    const couriers = [];
    const paymentMethods = [];
    const addresses = [];
    const errors = [];
    const warnings = [];

    this.addDebugLog(`Начинаем обработку ${dataRows.length} строк данных`);

    dataRows.forEach((row, index) => {
      const rowNumber = index + 2; // +2 потому что первая строка - заголовки, а индексация с 0
      
      try {
        this.addDebugLog(`Обработка строки ${rowNumber}`, {
          row,
          rowLength: row.length,
          addressValue: row[headerMap.address],
          hasAddress: !!row[headerMap.address]
        });

        if (!row[headerMap.address] || !row[headerMap.orderNumber]) {
          this.addDebugLog(`Пропуск строки ${rowNumber} - нет адреса или номера заказа`);
          return;
        }

        const order = this.processOrderRow(row, headerMap, rowNumber);
        
        if (order) {
          orders.push(order);
          
          // Добавляем курьера
          if (order.courier) {
            couriers.push({
              name: order.courier,
              orders: [{
                id: order.id,
                customer: order.customerName,
                address: order.address,
                amount: order.amount
              }],
              orderCount: 1,
              totalAmount: order.amount,
              zones: [],
              paymentMethods: [order.paymentMethod]
            });
          }

          // Добавляем способ оплаты
          if (order.paymentMethod) {
            paymentMethods.push({
              method: order.paymentMethod,
              orders: [{
                id: order.id,
                customer: order.customerName,
                amount: order.amount,
                status: order.status
              }],
              orderCount: 1,
              totalAmount: order.amount,
              averageAmount: order.amount
            });
          }

          // Добавляем адрес
          if (order.address) {
            addresses.push({
              full: order.address,
              orders: [{
                id: order.id,
                customer: order.customerName,
                courier: order.courier,
                amount: order.amount
              }],
              orderCount: 1,
              totalAmount: order.amount,
              zones: [],
              couriers: order.courier ? [order.courier] : []
            });
          }

          this.addDebugLog(`Создан заказ #${order.orderNumber}`, order);
        }

      } catch (error) {
        const errorMsg = `Ошибка обработки строки ${rowNumber}: ${error.message}`;
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

  // НОВЫЙ маппинг заголовков под реальную структуру данных
  mapHeaders(headers) {
    this.addDebugLog('Начинаем маппинг заголовков', { headers });
    
    const headerMap = {};
    
    headers.forEach((header, index) => {
      if (!header) return;
      
      const originalHeader = header.toString();
      const normalizedHeader = originalHeader.toLowerCase().trim();
      const noApostrophes = normalizedHeader.replace(/[''`]/g, '');
      
      this.addDebugLog(`Анализ заголовка ${index}: "${originalHeader}" -> "${normalizedHeader}"`);
      
      const includesAny = (s, arr) => {
        const result = arr.some(k => s.includes(k));
        this.addDebugLog(`Проверка "${s}" включает любой из [${arr.join(', ')}] = ${result}`);
        return result;
      };

      // НОМЕР ЗАКАЗА - ищем "номер", "№", "id"
      if (includesAny(noApostrophes, ['номер', '№', 'number', 'id', 'заказ', 'замовлення']) && 
          !includesAny(noApostrophes, ['заказчик', 'клиент', 'customer', 'имя', 'name'])) {
        if (headerMap.orderNumber === undefined) {
          headerMap.orderNumber = index;
          this.addDebugLog(`Найден номер заказа в колонке ${index}: "${originalHeader}"`);
        }
      }
      
      // АДРЕС - ищем "адрес", "address"
      else if (includesAny(noApostrophes, ['адрес', 'address', 'доставки', 'delivery'])) {
        if (headerMap.address === undefined) {
          headerMap.address = index;
          this.addDebugLog(`Найден адрес в колонке ${index}: "${originalHeader}"`);
        }
      }
      
      // КУРЬЕР - ищем "курьер", "courier", "доставщик"
      else if (includesAny(noApostrophes, ['курьер', 'courier', 'доставщик', 'delivery', 'driver'])) {
        if (headerMap.courier === undefined) {
          headerMap.courier = index;
          this.addDebugLog(`Найден курьер в колонке ${index}: "${originalHeader}"`);
        }
      }
      
      // СПОСОБ ОПЛАТЫ - ищем "оплаты", "payment", "способ"
      else if (includesAny(noApostrophes, ['оплаты', 'payment', 'способ', 'method', 'оплата', 'pay'])) {
        if (headerMap.paymentMethod === undefined) {
          headerMap.paymentMethod = index;
          this.addDebugLog(`Найден способ оплаты в колонке ${index}: "${originalHeader}"`);
        }
      }
      
      // СУММА - ищем "оплате", "сумма", "amount", "price", "к оплате"
      else if (includesAny(noApostrophes, ['оплате', 'сумма', 'amount', 'price', 'стоимость', 'к оплате', 'to pay', 'оплате', 'pay', 'сумма к оплате', 'к оплате сумма', 'стоимость заказа', 'заказ сумма', 'заказа сумма'])) {
        if (headerMap.amount === undefined) {
          headerMap.amount = index;
          this.addDebugLog(`Найден сумма в колонке ${index}: "${originalHeader}"`);
        }
      }
      
      // ТЕЛЕФОН - ищем "телефон", "phone", "тел"
      else if (includesAny(noApostrophes, ['телефон', 'phone', 'тел', 'мобильный', 'mobile'])) {
        if (headerMap.phone === undefined) {
          headerMap.phone = index;
          this.addDebugLog(`Найден телефон в колонке ${index}: "${originalHeader}"`);
        }
      }
      
      // ИМЯ КЛИЕНТА - ищем "заказчик", "клиент", "имя", "customer", "name"
      else if (includesAny(noApostrophes, ['заказчик', 'клиент', 'имя', 'customer', 'name', 'заказчик (имя)', 'клиент (имя)'])) {
        if (headerMap.customerName === undefined) {
          headerMap.customerName = index;
          this.addDebugLog(`Найден имя клиента в колонке ${index}: "${originalHeader}"`);
        }
      }
      
      // СТАТУС - ищем "состояние", "статус", "status", "state"
      else if (includesAny(noApostrophes, ['состояние', 'статус', 'status', 'state'])) {
        if (headerMap.status === undefined) {
          headerMap.status = index;
          this.addDebugLog(`Найден статус в колонке ${index}: "${originalHeader}"`);
        }
      }
      
      // ТИП ЗАКАЗА - ищем "тип", "type", "заказа"
      else if (includesAny(noApostrophes, ['тип', 'type', 'заказа', 'order type']) && 
               !includesAny(noApostrophes, ['заказчик', 'клиент', 'customer'])) {
        if (headerMap.orderType === undefined) {
          headerMap.orderType = index;
          this.addDebugLog(`Найден тип заказа в колонке ${index}: "${originalHeader}"`);
        }
      }
      
      // КОММЕНТАРИИ - ищем "комментарии", "комментарий", "comment"
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

  processOrderRow(row, headerMap, rowNumber) {
    this.addDebugLog(`Обработка строки ${rowNumber}`, {
      row,
      headerMap
    });

    // Проверяем обязательные поля
    const hasOrderNumber = !!row[headerMap.orderNumber];
    const hasAddress = !!row[headerMap.address];
    const hasCourier = !!row[headerMap.courier];
    const hasPaymentMethod = !!row[headerMap.paymentMethod];
    const addressValue = row[headerMap.address];

    this.addDebugLog(`Анализ строки ${rowNumber}`, {
      hasOrderNumber,
      hasAddress,
      hasCourier,
      hasPaymentMethod,
      addressValue
    });

    if (!hasOrderNumber || !hasAddress) {
      this.addDebugLog(`Пропуск строки ${rowNumber} - нет обязательных полей`);
      return null;
    }

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
        // Убираем все кроме цифр, точек и запятых
        const cleanValue = stringValue.replace(/[^\d.,]/g, '');
        // Заменяем запятую на точку для правильного парсинга
        const normalizedValue = cleanValue.replace(',', '.');
        amount = parseFloat(normalizedValue) || 0;
      }
    }

    // Создаем заказ
    const order = {
      id: `ORDER_${rowNumber}`,
      orderNumber: row[headerMap.orderNumber]?.toString().trim() || '',
      status: row[headerMap.status]?.toString().trim() || 'Новый',
      type: row[headerMap.orderType]?.toString().trim() || 'Доставка',
      customer: {
        name: row[headerMap.customerName]?.toString().trim() || '',
        phone: row[headerMap.phone]?.toString().trim() || ''
      },
      address: addressValue?.toString().trim() || '',
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
      rowNumber,
      // Дополнительные поля для совместимости
      phone: row[headerMap.phone]?.toString().trim() || '',
      customerName: row[headerMap.customerName]?.toString().trim() || '',
      amount: amount,
      paymentMethod: row[headerMap.paymentMethod]?.toString().trim() || '',
      orderComment: row[headerMap.comment]?.toString().trim() || ''
    };

    this.addDebugLog(`Обработан заказ из строки ${rowNumber}`, order);
    return order;
  }

  removeDuplicateCouriers(couriers) {
    this.addDebugLog('Создание уникальных курьеров и способов оплаты');
    
    const uniqueCouriers = {};
    couriers.forEach(courier => {
      if (!uniqueCouriers[courier.name]) {
        uniqueCouriers[courier.name] = {
          name: courier.name,
          orders: [],
          orderCount: 0,
          totalAmount: 0,
          zones: [],
          paymentMethods: []
        };
      }
      
      uniqueCouriers[courier.name].orders.push(...courier.orders);
      uniqueCouriers[courier.name].orderCount += courier.orderCount;
      uniqueCouriers[courier.name].totalAmount += courier.totalAmount;
      uniqueCouriers[courier.name].paymentMethods = [...new Set([...uniqueCouriers[courier.name].paymentMethods, ...courier.paymentMethods])];
    });

    const result = Object.values(uniqueCouriers);
    this.addDebugLog('Созданы уникальные списки', { 
      couriers: result.length, 
      paymentMethods: 0 
    });
    
    return result;
  }

  removeDuplicatePaymentMethods(paymentMethods) {
    const uniqueMethods = {};
    paymentMethods.forEach(method => {
      if (!uniqueMethods[method.method]) {
        uniqueMethods[method.method] = {
          method: method.method,
          orders: [],
          orderCount: 0,
          totalAmount: 0,
          averageAmount: 0
        };
      }
      
      uniqueMethods[method.method].orders.push(...method.orders);
      uniqueMethods[method.method].orderCount += method.orderCount;
      uniqueMethods[method.method].totalAmount += method.totalAmount;
    });

    // Рассчитываем средние суммы
    Object.values(uniqueMethods).forEach(method => {
      method.averageAmount = method.orderCount > 0 ? method.totalAmount / method.orderCount : 0;
    });

    return Object.values(uniqueMethods);
  }

  removeDuplicateAddresses(addresses) {
    const uniqueAddresses = {};
    addresses.forEach(address => {
      if (!uniqueAddresses[address.full]) {
        uniqueAddresses[address.full] = {
          full: address.full,
          orders: [],
          orderCount: 0,
          totalAmount: 0,
          zones: [],
          couriers: []
        };
      }
      
      uniqueAddresses[address.full].orders.push(...address.orders);
      uniqueAddresses[address.full].orderCount += address.orderCount;
      uniqueAddresses[address.full].totalAmount += address.totalAmount;
      uniqueAddresses[address.full].couriers = [...new Set([...uniqueAddresses[address.full].couriers, ...address.couriers])];
    });

    return Object.values(uniqueAddresses);
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

module.exports = ExcelService;











