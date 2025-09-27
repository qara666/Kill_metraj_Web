const XLSX = require('xlsx');

class ExcelServiceFinalFix {
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
    
    // Добавляем в глобальный лог если доступен
    if (global.addDebugLog) {
      global.addDebugLog(message, data);
    }
  }

  async processExcelFile(buffer) {
    this.debugLogs = []; // Очищаем логи
    this.addDebugLog('Начало обработки Excel файла');
    
    try {
      // Пробуем разные опции чтения
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
        const worksheet = workbook.Sheets[sheetName];
        
        let data;
        try {
          data = XLSX.utils.sheet_to_json(worksheet, { 
            header: 1, 
            defval: '',
            raw: false,
            dateNF: 'yyyy-mm-dd'
          });
          this.addDebugLog(`Данные прочитаны стандартным способом`, {
            rows: data.length,
            firstRow: data[0],
            hasData: data.length > 1
          });
        } catch (error) {
          this.addDebugLog(`Ошибка стандартного чтения: ${error.message}`);
          result.errors.push(`Не удалось прочитать лист "${sheetName}": ${error.message}`);
          continue;
        }
        
        const sheetResult = await this.processSheetData(data, sheetName);
        
        result.orders.push(...sheetResult.orders);
        result.couriers.push(...sheetResult.couriers);
        result.paymentMethods.push(...sheetResult.paymentMethods);
        result.addresses.push(...sheetResult.addresses);
        result.routes.push(...sheetResult.routes);
        result.errors.push(...sheetResult.errors);
        result.warnings.push(...sheetResult.warnings);
        
        if (sheetResult.headerMap) {
          result.debug.headerMap = sheetResult.headerMap;
        }
      }

      // Рассчитываем статистику
      this.calculateStatistics(result);

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
          successfulGeocoding: result.orders.filter(order => order.geocoded).length,
          failedGeocoding: result.orders.filter(order => !order.geocoded).length,
          errors: result.errors.length,
          warnings: result.warnings.length
        }
      };

    } catch (error) {
      this.addDebugLog(`Критическая ошибка: ${error.message}`, error.stack);
      return {
        success: false,
        error: error.message,
        data: null,
        debug: {
          logs: this.debugLogs
        }
      };
    }
  }

  async processSheetData(data, sheetName) {
    if (!data || data.length <= 1) {
      this.addDebugLog(`Лист "${sheetName}" пуст или содержит только заголовки`);
      return {
        orders: [],
        couriers: [],
        paymentMethods: [],
        addresses: [],
        routes: [],
        errors: [],
        warnings: [`Лист "${sheetName}" не содержит данных`],
        headerMap: {}
      };
    }

    const headers = data[0] || [];
    const rows = data.slice(1);

    this.addDebugLog(`Обработка листа "${sheetName}"`, {
      totalRows: data.length,
      firstRow: headers,
      secondRow: rows[0] || null
    });

    this.addDebugLog(`Заголовки листа "${sheetName}"`, {
      headers,
      headersCount: headers.length,
      headersString: headers.join(' | ')
    });

    // Маппинг заголовков
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
        routes: [],
        errors: [error],
        warnings: [],
        headerMap
      };
    }

    // Обрабатываем строки
    const orders = [];
    const errors = [];
    const warnings = [];

    this.addDebugLog(`Начинаем обработку ${rows.length} строк данных`);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNumber = i + 2; // +2 потому что индекс начинается с 0 и есть заголовок

      this.addDebugLog(`Обработка строки ${rowNumber}`, {
        row,
        rowLength: row.length,
        addressValue: row[headerMap.address],
        hasAddress: !!row[headerMap.address]
      });

      if (!row || row.length === 0) {
        this.addDebugLog(`Строка ${rowNumber} пуста, пропускаем`);
        continue;
      }

      const addressValue = row[headerMap.address];
      if (!addressValue || addressValue.toString().trim() === '') {
        this.addDebugLog(`Строка ${rowNumber} не содержит адрес, пропускаем`);
        continue;
      }

      try {
        const order = this.processOrderRow(row, headerMap, rowNumber);
        if (order) {
          orders.push(order);
          this.addDebugLog(`Создан заказ из строки ${rowNumber}`, order);
          this.addDebugLog(`Создан заказ #${order.orderNumber}`, order);
        }
      } catch (error) {
        const errorMsg = `Ошибка обработки строки ${rowNumber}: ${error.message}`;
        this.addDebugLog(errorMsg);
        errors.push(errorMsg);
      }
    }

    this.addDebugLog(`Обработано строк: ${orders.length} из ${rows.length}`);

    // Создаем уникальные списки курьеров и способов оплаты
    this.addDebugLog('Создание уникальных курьеров и способов оплаты');
    const uniqueCouriers = [...new Set(orders.map(order => order.courier).filter(Boolean))];
    const uniquePaymentMethods = [...new Set(orders.map(order => order.paymentMethod).filter(Boolean))];
    const uniqueAddresses = [...new Set(orders.map(order => order.address).filter(Boolean))];

    this.addDebugLog('Созданы уникальные списки', {
      couriers: uniqueCouriers.length,
      paymentMethods: uniquePaymentMethods.length
    });

    // Структурируем данные
    const structuredData = this.structureData(orders);

    return {
      orders: structuredData.orders,
      couriers: structuredData.couriers,
      paymentMethods: structuredData.paymentMethods,
      addresses: structuredData.addresses,
      routes: [],
      errors,
      warnings,
      headerMap
    };
  }

  // ИСПРАВЛЕННАЯ функция mapHeaders
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
        return result;
      };

      // СУММА - проверяем ПЕРВОЙ И с точными критериями!
      if (includesAny(noApostrophes, ['сумма заказа', 'сумма', 'amount', 'price', 'стоимость', 'вартість', 'суммы', 'amounts', 'prices', 'цена', 'стоимость заказа', 'к оплате', 'to pay', 'оплате', 'pay', 'сумма к оплате', 'к оплате сумма']) && 
          !includesAny(noApostrophes, ['номер', '№', 'number', 'id'])) { // исключаем номера
        if (headerMap.amount === undefined) {
          headerMap.amount = index;
          this.addDebugLog(`Найден сумма в колонке ${index}: "${originalHeader}"`);
        }
      } 
      // НОМЕР ЗАКАЗА - проверяем БЕЗ слов, которые могут быть в сумме
      else if (includesAny(noApostrophes, ['номер заказа', 'номер замовлення', '№', 'number', 'order id', 'id заказа']) ||
               (includesAny(noApostrophes, ['номер', 'id', 'order']) && !includesAny(noApostrophes, ['сумма', 'amount', 'price', 'стоимость', 'оплате']))) {
        if (headerMap.orderNumber === undefined) {
          headerMap.orderNumber = index;
          this.addDebugLog(`Найден номер заказа в колонке ${index}: "${originalHeader}"`);
        }
      } 
      // АДРЕС
      else if (includesAny(noApostrophes, ['адрес', 'адреса', 'address', 'адрес доставки', 'location', 'место', 'місце', 'адреса доставки', 'адреса клиента', 'адрес клиента'])) {
        if (headerMap.address === undefined) {
          headerMap.address = index;
          this.addDebugLog(`Найден адрес в колонке ${index}: "${originalHeader}"`);
        }
      } 
      // КУРЬЕР
      else if (includesAny(noApostrophes, ['курьер', 'courier', 'курьеры', 'couriers', 'доставщик', 'курьер имя', 'имя курьера', 'курьер заказа'])) {
        if (headerMap.courier === undefined) {
          headerMap.courier = index;
          this.addDebugLog(`Найден курьер в колонке ${index}: "${originalHeader}"`);
        }
      } 
      // СПОСОБ ОПЛАТЫ
      else if (includesAny(noApostrophes, ['способ оплаты', 'payment method', 'оплата', 'payment', 'способ', 'метод оплаты', 'оплаты способ', 'тип оплаты'])) {
        if (headerMap.paymentMethod === undefined) {
          headerMap.paymentMethod = index;
          this.addDebugLog(`Найден способ оплаты в колонке ${index}: "${originalHeader}"`);
        }
      } 
      // ТЕЛЕФОН
      else if (includesAny(noApostrophes, ['телефон', 'phone', 'моб', 'mobile', 'телефоны', 'phones', 'контакт', 'contact', 'тел', 'телефон клиента'])) {
        if (headerMap.phone === undefined) {
          headerMap.phone = index;
          this.addDebugLog(`Найден телефон в колонке ${index}: "${originalHeader}"`);
        }
      } 
      // ИМЯ КЛИЕНТА
      else if (includesAny(noApostrophes, ['имя', 'імя', 'name', 'имена', 'names', 'клиент', 'client', 'заказчик', 'customer', 'заказчик имя', 'имя заказчика', 'имя клиента'])) {
        if (headerMap.customerName === undefined) {
          headerMap.customerName = index;
          this.addDebugLog(`Найден имя клиента в колонке ${index}: "${originalHeader}"`);
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

    const addressValue = row[headerMap.address];
    if (!addressValue || addressValue.toString().trim() === '') {
      this.addDebugLog(`Строка ${rowNumber} не содержит адрес, пропускаем`);
      return null;
    }

    // Проверяем наличие основных данных
    const hasOrderNumber = headerMap.orderNumber !== undefined && row[headerMap.orderNumber];
    const hasAddress = headerMap.address !== undefined && row[headerMap.address];
    const hasCourier = headerMap.courier !== undefined && row[headerMap.courier];
    const hasPaymentMethod = headerMap.paymentMethod !== undefined && row[headerMap.paymentMethod];

    this.addDebugLog(`Анализ строки ${rowNumber}`, {
      hasOrderNumber,
      hasAddress,
      hasCourier,
      hasPaymentMethod,
      addressValue
    });

    // Улучшенный парсинг суммы
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
        // Удаляем все нечисловые символы кроме точки и запятой
        const cleanValue = stringValue.replace(/[^\d.,]/g, '');
        // Заменяем запятую на точку
        const normalizedValue = cleanValue.replace(',', '.');
        amount = parseFloat(normalizedValue) || 0;
      }
    }

    const order = {
      id: `ORDER_${rowNumber}`,
      orderNumber: headerMap.orderNumber !== undefined ? row[headerMap.orderNumber] : `ORDER_${rowNumber}`,
      status: headerMap.status !== undefined ? row[headerMap.status] : 'Новый',
      type: headerMap.orderType !== undefined ? row[headerMap.orderType] : 'Доставка',
      
      customer: {
        name: headerMap.customerName !== undefined ? row[headerMap.customerName] : '',
        phone: headerMap.phone !== undefined ? row[headerMap.phone] : ''
      },
      
      address: {
        full: row[headerMap.address],
        zone: headerMap.zone !== undefined ? row[headerMap.zone] : 'Зона 1',
        deliveryTime: headerMap.deliveryTime !== undefined ? row[headerMap.deliveryTime] : '10:00-18:00'
      },
      
      financial: {
        amount: amount,
        currency: 'UAH',
        paymentMethod: headerMap.paymentMethod !== undefined ? row[headerMap.paymentMethod] : '',
        discount: 0
      },
      
      timing: {
        created: new Date().toISOString(),
        updated: new Date().toISOString()
      },
      
      courier: headerMap.courier !== undefined ? row[headerMap.courier] : '',
      comment: headerMap.orderComment !== undefined ? row[headerMap.orderComment] : '',
      geocoded: false,
      rowNumber: rowNumber,
      
      // Обратная совместимость
      phone: headerMap.phone !== undefined ? row[headerMap.phone] : '',
      customerName: headerMap.customerName !== undefined ? row[headerMap.customerName] : '',
      address: row[headerMap.address],
      amount: amount,
      paymentMethod: headerMap.paymentMethod !== undefined ? row[headerMap.paymentMethod] : '',
      orderComment: headerMap.orderComment !== undefined ? row[headerMap.orderComment] : ''
    };

    this.addDebugLog(`Обработан заказ из строки ${rowNumber}`, order);
    return order;
  }

  structureData(orders) {
    this.addDebugLog('Структурирование данных');
    
    // Группируем данные
    const courierGroups = {};
    const paymentGroups = {};
    const addressGroups = {};

    orders.forEach(order => {
      // Группировка по курьерам
      if (order.courier) {
        if (!courierGroups[order.courier]) {
          courierGroups[order.courier] = {
            name: order.courier,
            orders: [],
            orderCount: 0,
            totalAmount: 0,
            zones: new Set(),
            paymentMethods: new Set()
          };
        }
        courierGroups[order.courier].orders.push({
          id: order.id || order.orderNumber,
          customer: order.customer?.name || order.customerName,
          address: order.address?.full || order.address,
          amount: order.financial?.amount || order.amount || 0
        });
        courierGroups[order.courier].orderCount++;
        courierGroups[order.courier].totalAmount += order.financial?.amount || order.amount || 0;
        if (order.address?.zone) courierGroups[order.courier].zones.add(order.address.zone);
        if (order.financial?.paymentMethod || order.paymentMethod) {
          courierGroups[order.courier].paymentMethods.add(order.financial?.paymentMethod || order.paymentMethod);
        }
      }

      // Группировка по способам оплаты
      const paymentMethod = order.financial?.paymentMethod || order.paymentMethod;
      if (paymentMethod) {
        if (!paymentGroups[paymentMethod]) {
          paymentGroups[paymentMethod] = {
            method: paymentMethod,
            orders: [],
            orderCount: 0,
            totalAmount: 0,
            averageAmount: 0
          };
        }
        paymentGroups[paymentMethod].orders.push({
          id: order.id || order.orderNumber,
          customer: order.customer?.name || order.customerName,
          amount: order.financial?.amount || order.amount || 0,
          status: order.status
        });
        paymentGroups[paymentMethod].orderCount++;
        paymentGroups[paymentMethod].totalAmount += order.financial?.amount || order.amount || 0;
      }

      // Группировка по адресам
      const address = order.address?.full || order.address;
      if (address) {
        if (!addressGroups[address]) {
          addressGroups[address] = {
            full: address,
            orders: [],
            orderCount: 0,
            totalAmount: 0,
            zones: new Set(),
            couriers: new Set()
          };
        }
        addressGroups[address].orders.push({
          id: order.id || order.orderNumber,
          customer: order.customer?.name || order.customerName,
          courier: order.courier,
          amount: order.financial?.amount || order.amount || 0
        });
        addressGroups[address].orderCount++;
        addressGroups[address].totalAmount += order.financial?.amount || order.amount || 0;
        if (order.address?.zone) addressGroups[address].zones.add(order.address.zone);
        if (order.courier) addressGroups[address].couriers.add(order.courier);
      }
    });

    // Преобразуем в массивы
    const couriers = Object.values(courierGroups).map(courier => ({
      ...courier,
      zones: Array.from(courier.zones),
      paymentMethods: Array.from(courier.paymentMethods)
    }));

    const paymentMethods = Object.values(paymentGroups).map(payment => ({
      ...payment,
      averageAmount: payment.orderCount > 0 ? payment.totalAmount / payment.orderCount : 0
    }));

    const addresses = Object.values(addressGroups).map(address => ({
      ...address,
      zones: Array.from(address.zones),
      couriers: Array.from(address.couriers)
    }));

    return {
      orders,
      couriers,
      paymentMethods,
      addresses
    };
  }

  calculateStatistics(result) {
    const orders = result.orders;
    
    result.statistics = {
      totalOrders: orders.length,
      totalAmount: orders.reduce((sum, order) => sum + (order.financial?.amount || order.amount || 0), 0),
      averageAmount: orders.length > 0 ? orders.reduce((sum, order) => sum + (order.financial?.amount || order.amount || 0), 0) / orders.length : 0,
      deliveryCount: orders.filter(order => (order.type || '').toLowerCase().includes('доставка') || (order.type || '').toLowerCase().includes('delivery')).length,
      pickupCount: orders.filter(order => (order.type || '').toLowerCase().includes('самовывоз') || (order.type || '').toLowerCase().includes('pickup')).length,
      courierStats: {},
      paymentStats: {},
      zoneStats: {}
    };

    this.addDebugLog('Статистика рассчитана', result.statistics);
  }

  getDebugLogs() {
    return this.debugLogs;
  }
}

module.exports = ExcelServiceFinalFix;
