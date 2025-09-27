const XLSX = require('xlsx');

class ExcelServiceImproved {
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
          sheets: [],
          totalRows: 0,
          processedRows: 0,
          headerMap: null,
          rawData: [],
          logs: this.debugLogs
        }
      };

      for (const sheetName of workbook.SheetNames) {
        this.addDebugLog(`Обработка листа: ${sheetName}`);
        
        const worksheet = workbook.Sheets[sheetName];
        
        // Пробуем разные способы чтения данных
        let data;
        try {
          // Способ 1: стандартное чтение
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
          
          // Способ 2: чтение как массив объектов
          try {
            data = XLSX.utils.sheet_to_json(worksheet, { 
              header: 1, 
              defval: null,
              raw: true
            });
            this.addDebugLog(`Данные прочитаны альтернативным способом`, {
              rows: data.length,
              firstRow: data[0]
            });
          } catch (error2) {
            this.addDebugLog(`Ошибка альтернативного чтения: ${error2.message}`);
            result.errors.push(`Не удалось прочитать лист "${sheetName}": ${error2.message}`);
            continue;
          }
        }
        
        // Сохраняем информацию о листе
        result.debug.sheets.push({
          name: sheetName,
          rows: data.length,
          headers: data[0] || [],
          hasData: data.length > 1,
          rawFirstRow: data[0],
          rawSecondRow: data[1] || null
        });
        
        result.debug.totalRows += data.length - 1;
        
        // Сохраняем сырые данные для анализа
        if (data.length > 0) {
          result.debug.rawData.push({
            sheet: sheetName,
            data: data.slice(0, 5) // Первые 5 строк для анализа
          });
        }
        
        const sheetResult = await this.processSheetData(data, sheetName);
        
        result.orders.push(...sheetResult.orders);
        result.couriers.push(...sheetResult.couriers);
        result.paymentMethods.push(...sheetResult.paymentMethods);
        result.routes.push(...sheetResult.routes);
        result.errors.push(...sheetResult.errors);
        result.warnings.push(...sheetResult.warnings);
        
        result.debug.processedRows += sheetResult.orders.length;
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
    this.addDebugLog(`Обработка листа "${sheetName}"`, {
      totalRows: data.length,
      firstRow: data[0],
      secondRow: data[1] || null
    });

    const result = {
      orders: [],
      couriers: [],
      paymentMethods: [],
      routes: [],
      errors: [],
      warnings: [],
      headerMap: null
    };

    try {
      if (!data || data.length === 0) {
        result.errors.push(`Лист "${sheetName}": Нет данных`);
        return result;
      }

      const headers = data[0] || [];
      this.addDebugLog(`Заголовки листа "${sheetName}"`, {
        headers: headers,
        headersCount: headers.length,
        headersString: headers.join(' | ')
      });

      const headerMap = this.mapHeaders(headers);
      result.headerMap = headerMap;
      
      this.addDebugLog(`Маппинг заголовков для "${sheetName}"`, headerMap);
      
      const hasAddress = headerMap.address !== undefined;
      const totalRows = data.length - 1;
      
      if (!hasAddress) {
        result.errors.push(`Лист "${sheetName}": Нет колонки с адресами. Найденные заголовки: ${JSON.stringify(headers)}`);
        
        // Пытаемся найти похожие заголовки
        const possibleAddressHeaders = headers.filter(h => 
          h && h.toString().toLowerCase().includes('адрес')
        );
        if (possibleAddressHeaders.length > 0) {
          result.warnings.push(`Возможные заголовки адресов: ${possibleAddressHeaders.join(', ')}`);
        }
        
        return result;
      }
      
      if (totalRows === 0) {
        result.errors.push(`Лист "${sheetName}": Нет данных для обработки`);
        return result;
      }
      
      this.addDebugLog(`Начинаем обработку ${totalRows} строк данных`);
      
      let processedCount = 0;
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) {
          this.addDebugLog(`Пропускаем пустую строку ${i + 1}`);
          continue;
        }

        this.addDebugLog(`Обработка строки ${i + 1}`, {
          row: row,
          rowLength: row.length,
          addressValue: row[headerMap.address],
          hasAddress: row[headerMap.address] && row[headerMap.address].toString().trim() !== ''
        });

        try {
          const processedRow = this.processRow(row, headerMap, i + 1);
          
          if (processedRow.type === 'order') {
            result.orders.push(processedRow.data);
            processedCount++;
            this.addDebugLog(`Создан заказ #${processedRow.data.orderNumber}`, processedRow.data);
          } else if (processedRow.type === 'courier') {
            result.couriers.push(processedRow.data);
          } else if (processedRow.type === 'payment') {
            result.paymentMethods.push(processedRow.data);
          } else if (processedRow.type === 'route') {
            result.routes.push(processedRow.data);
          }
        } catch (rowError) {
          this.addDebugLog(`Ошибка в строке ${i + 1}: ${rowError.message}`, {
            row: row,
            error: rowError.message
          });
          result.errors.push(`Рядок ${i + 1}: ${rowError.message}`);
        }
      }

      this.addDebugLog(`Обработано строк: ${processedCount} из ${totalRows}`);

      // Создаем уникальные списки курьеров и способов оплаты
      this.createUniqueCouriersAndPayments(result);

      if (result.orders.length === 0 && totalRows > 0) {
        result.warnings.push(`Лист "${sheetName}": Заказы не созданы. Проверьте данные в колонке адресов (колонка ${headerMap.address})`);
        
        // Дополнительная диагностика
        const addressColumn = headerMap.address;
        const addressData = data.slice(1).map(row => row[addressColumn]).filter(addr => addr && addr.toString().trim() !== '');
        result.warnings.push(`Найдено ${addressData.length} непустых адресов в колонке ${addressColumn}`);
        
        if (addressData.length > 0) {
          result.warnings.push(`Примеры адресов: ${addressData.slice(0, 3).join(', ')}`);
        }

        // Показываем примеры данных
        const sampleRows = data.slice(1, 4).map((row, index) => ({
          rowNumber: index + 2,
          data: row,
          address: row[addressColumn]
        }));
        result.warnings.push(`Примеры строк данных: ${JSON.stringify(sampleRows, null, 2)}`);
      }

    } catch (error) {
      this.addDebugLog(`Ошибка обработки листа "${sheetName}": ${error.message}`, error.stack);
      result.errors.push(`Лист "${sheetName}": ${error.message}`);
    }

    return result;
  }

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
        if (originalHeader.toLowerCase().includes('сумма')) {
          this.addDebugLog(`Проверка суммы для "${originalHeader}": "${s}" включает любой из [${arr.join(', ')}] = ${result}`);
        }
        return result;
      };

      // Сумма (проверяем ПЕРВОЙ, так как "сумма заказа" содержит "заказ")
      if (includesAny(noApostrophes, ['сумма заказа', 'сумма', 'amount', 'price', 'стоимость', 'вартість', 'суммы', 'amounts', 'prices', 'цена', 'стоимость заказа', 'заказ сумма', 'заказа сумма', 'к оплате', 'to pay', 'оплате', 'pay', 'сумма к оплате', 'к оплате сумма'])) {
        if (headerMap.amount === undefined) {
          headerMap.amount = index;
          this.addDebugLog(`Найден сумма в колонке ${index}: "${originalHeader}"`);
        }
      } 
      // Номер заказа
      else if (includesAny(noApostrophes, ['номер', 'номер заказа', 'номер замовлення', 'no', '№', 'number', 'order', 'id', 'заказ', 'замовлення'])) {
        if (headerMap.orderNumber === undefined) {
          headerMap.orderNumber = index;
          this.addDebugLog(`Найден номер заказа в колонке ${index}: "${originalHeader}"`);
        }
      } 
      // Статус
      else if (includesAny(noApostrophes, ['состояние', 'статус', 'status', 'state', 'статус заказа', 'состояние заказа'])) {
        if (headerMap.status === undefined) {
          headerMap.status = index;
          this.addDebugLog(`Найден статус в колонке ${index}: "${originalHeader}"`);
        }
      } 
      // Тип заказа
      else if (includesAny(noApostrophes, ['тип заказа', 'тип замовлення', 'order type', 'типы заказов', 'order types', 'тип'])) {
        if (headerMap.orderType === undefined) {
          headerMap.orderType = index;
          this.addDebugLog(`Найден тип заказа в колонке ${index}: "${originalHeader}"`);
        }
      } 
      // Телефон
      else if (includesAny(noApostrophes, ['телефон', 'phone', 'моб', 'mobile', 'телефоны', 'phones', 'контакт', 'contact', 'тел', 'телефон клиента'])) {
        if (headerMap.phone === undefined) {
          headerMap.phone = index;
          this.addDebugLog(`Найден телефон в колонке ${index}: "${originalHeader}"`);
        }
      } 
      // Имя клиента
      else if (includesAny(noApostrophes, ['имя', 'імя', 'name', 'имена', 'names', 'клиент', 'client', 'заказчик', 'customer', 'заказчик имя', 'имя заказчика', 'имя клиента'])) {
        if (headerMap.customerName === undefined) {
          headerMap.customerName = index;
          this.addDebugLog(`Найден имя клиента в колонке ${index}: "${originalHeader}"`);
        }
      } 
      // Адрес (самое важное!)
      else if (includesAny(noApostrophes, ['адрес', 'адреса', 'address', 'адрес доставки', 'location', 'место', 'місце', 'адреса доставки', 'адреса клиента', 'адрес адрес', 'адрес заказа', 'адрес доставки заказа'])) {
        if (headerMap.address === undefined) {
          headerMap.address = index;
          this.addDebugLog(`Найден адрес в колонке ${index}: "${originalHeader}"`);
        }
      } 
      // Способ оплаты
      else if (includesAny(noApostrophes, ['способ оплаты', 'payment method', 'оплата', 'payment', 'способ', 'метод оплаты', 'payment method', 'оплаты способ', 'тип оплаты'])) {
        if (headerMap.paymentMethod === undefined) {
          headerMap.paymentMethod = index;
          this.addDebugLog(`Найден способ оплаты в колонке ${index}: "${originalHeader}"`);
        }
      } 
      // Курьер
      else if (includesAny(noApostrophes, ['курьер', 'courier', 'курьеры', 'couriers', 'доставщик', 'курьер имя', 'имя курьера', 'курьер заказа'])) {
        if (headerMap.courier === undefined) {
          headerMap.courier = index;
          this.addDebugLog(`Найден курьер в колонке ${index}: "${originalHeader}"`);
        }
      }
      // Комментарий
      else if (includesAny(noApostrophes, ['комментарий', 'comment', 'комментарий к заказу', 'comment to order', 'комментарий заказ', 'заказ комментарий', 'примечание', 'note'])) {
        if (headerMap.orderComment === undefined) {
          headerMap.orderComment = index;
          this.addDebugLog(`Найден комментарий в колонке ${index}: "${originalHeader}"`);
        }
      }
    });

    this.addDebugLog('Маппинг заголовков завершен', headerMap);
    return headerMap;
  }

  processRow(row, headerMap, rowNumber) {
    this.addDebugLog(`Обработка строки ${rowNumber}`, {
      row: row,
      headerMap: headerMap
    });

    const hasOrderNumber = headerMap.orderNumber !== undefined && row[headerMap.orderNumber] && row[headerMap.orderNumber].toString().trim() !== '';
    const hasAddress = headerMap.address !== undefined && row[headerMap.address] && row[headerMap.address].toString().trim() !== '';
    const hasCourier = headerMap.courier !== undefined && row[headerMap.courier] && row[headerMap.courier].toString().trim() !== '';
    const hasPaymentMethod = headerMap.paymentMethod !== undefined && row[headerMap.paymentMethod] && row[headerMap.paymentMethod].toString().trim() !== '';

    this.addDebugLog(`Анализ строки ${rowNumber}`, {
      hasOrderNumber,
      hasAddress,
      hasCourier,
      hasPaymentMethod,
      addressValue: hasAddress ? row[headerMap.address] : null
    });

    if (hasAddress) {
      const order = this.processOrderRow(row, headerMap, rowNumber);
      this.addDebugLog(`Создан заказ из строки ${rowNumber}`, order);
      return {
        type: 'order',
        data: order
      };
    } else if (hasCourier && !hasAddress) {
      return {
        type: 'courier',
        data: this.processCourierRow(row, headerMap, rowNumber)
      };
    } else if (hasPaymentMethod && !hasAddress) {
      return {
        type: 'payment',
        data: this.processPaymentMethodRow(row, headerMap, rowNumber)
      };
    } else {
      throw new Error(`Неможливо визначити тип рядка — перевірте заголовки та дані. Адрес: ${hasAddress}, Курьер: ${hasCourier}, Оплата: ${hasPaymentMethod}`);
    }
  }

  processOrderRow(row, headerMap, rowNumber) {
    // Улучшенный парсинг суммы
    let amount = 0;
    if (headerMap.amount !== undefined && row[headerMap.amount]) {
      const amountValue = row[headerMap.amount];
      this.addDebugLog(`Парсинг суммы из строки ${rowNumber}`, {
        rawValue: amountValue,
        type: typeof amountValue,
        stringValue: amountValue.toString()
      });
      
      // Пробуем разные способы парсинга
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

    const order = {
      orderNumber: headerMap.orderNumber !== undefined ? row[headerMap.orderNumber] : `ORDER_${rowNumber}`,
      status: headerMap.status !== undefined ? row[headerMap.status] : 'Новый',
      orderType: headerMap.orderType !== undefined ? row[headerMap.orderType] : 'Доставка',
      phone: headerMap.phone !== undefined ? row[headerMap.phone] : '',
      customerName: headerMap.customerName !== undefined ? row[headerMap.customerName] : '',
      address: row[headerMap.address],
      amount: amount,
      paymentMethod: headerMap.paymentMethod !== undefined ? row[headerMap.paymentMethod] : '',
      courier: headerMap.courier !== undefined ? row[headerMap.courier] : '',
      orderComment: headerMap.orderComment !== undefined ? row[headerMap.orderComment] : '',
      geocoded: false,
      rowNumber: rowNumber
    };

    this.addDebugLog(`Обработан заказ из строки ${rowNumber}`, order);
    return order;
  }

  processCourierRow(row, headerMap, rowNumber) {
    return {
      name: row[headerMap.courier],
      rowNumber: rowNumber
    };
  }

  processPaymentMethodRow(row, headerMap, rowNumber) {
    return {
      name: row[headerMap.paymentMethod],
      rowNumber: rowNumber
    };
  }

  createUniqueCouriersAndPayments(result) {
    this.addDebugLog('Создание уникальных курьеров и способов оплаты');
    
    const courierMap = new Map();
    const paymentMap = new Map();

    result.orders.forEach(order => {
      // Обрабатываем курьера
      if (order.courier && order.courier.trim()) {
        if (!courierMap.has(order.courier)) {
          courierMap.set(order.courier, {
            name: order.courier,
            orderCount: 0,
            totalAmount: 0,
            orders: []
          });
        }
        const courier = courierMap.get(order.courier);
        courier.orderCount++;
        courier.totalAmount += order.amount || 0;
        courier.orders.push({
          orderNumber: order.orderNumber,
          address: order.address,
          amount: order.amount
        });
      }

      // Обрабатываем способ оплаты
      if (order.paymentMethod && order.paymentMethod.trim()) {
        if (!paymentMap.has(order.paymentMethod)) {
          paymentMap.set(order.paymentMethod, {
            name: order.paymentMethod,
            orderCount: 0,
            totalAmount: 0,
            orders: []
          });
        }
        const payment = paymentMap.get(order.paymentMethod);
        payment.orderCount++;
        payment.totalAmount += order.amount || 0;
        payment.orders.push({
          orderNumber: order.orderNumber,
          address: order.address,
          amount: order.amount
        });
      }
    });

    result.couriers = Array.from(courierMap.values());
    result.paymentMethods = Array.from(paymentMap.values());
    
    this.addDebugLog('Созданы уникальные списки', {
      couriers: result.couriers.length,
      paymentMethods: result.paymentMethods.length
    });
  }

  calculateStatistics(result) {
    const stats = result.statistics;
    
    stats.totalOrders = result.orders.length;
    stats.totalAmount = result.orders.reduce((sum, order) => sum + (order.amount || 0), 0);
    stats.averageAmount = stats.totalOrders > 0 ? stats.totalAmount / stats.totalOrders : 0;
    
    stats.deliveryCount = result.orders.filter(order => order.orderType === 'Доставка').length;
    stats.pickupCount = result.orders.filter(order => order.orderType === 'Самовивіз').length;
    
    // Статистика по курьерам
    result.couriers.forEach(courier => {
      stats.courierStats[courier.name] = {
        orderCount: courier.orderCount || 0,
        totalAmount: courier.totalAmount || 0,
        averageAmount: courier.orderCount > 0 ? (courier.totalAmount || 0) / courier.orderCount : 0
      };
    });
    
    // Статистика по способам оплаты
    result.paymentMethods.forEach(payment => {
      stats.paymentStats[payment.name] = {
        orderCount: payment.orderCount || 0,
        totalAmount: payment.totalAmount || 0,
        averageAmount: payment.orderCount > 0 ? (payment.totalAmount || 0) / payment.orderCount : 0
      };
    });
  }
}

module.exports = ExcelServiceImproved;
