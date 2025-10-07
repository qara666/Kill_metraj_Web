const XLSX = require('xlsx');

class ExcelService_v3 {
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
    this.addDebugLog('Начало обработки Excel файла v3 (гибкий парсер)');
    
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

      // Обрабатываем все листы
      workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const sheetResult = this.processSheet(sheet, sheetName);
        
        result.orders.push(...sheetResult.orders);
        result.couriers.push(...sheetResult.couriers);
        result.paymentMethods.push(...sheetResult.paymentMethods);
        result.addresses.push(...sheetResult.addresses);
        result.errors.push(...sheetResult.errors);
        result.warnings.push(...sheetResult.warnings);
        
        result.debug.sheets.push({
          name: sheetName,
          totalRows: sheetResult.totalRows || 0,
          processedRows: sheetResult.processedRows || 0
        });
      });

      // Удаляем дубликаты
      result.couriers = this.removeDuplicateCouriers(result.couriers);
      result.paymentMethods = this.removeDuplicatePaymentMethods(result.paymentMethods);
      result.addresses = this.removeDuplicateAddresses(result.addresses);

      // Рассчитываем статистику
      result.statistics = this.calculateStatistics(result.orders);
      result.debug.totalRows = result.orders.length;
      result.debug.processedRows = result.orders.length;

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
        message: 'Файл успешно обработан v3 (гибкий парсер)'
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
        warnings: [],
        totalRows: 0,
        processedRows: 0
      };
    }

    // Ищем заголовки - они могут быть в разных строках
    const headerInfo = this.findHeaders(jsonData);
    const headers = headerInfo.headers;
    const dataStartRow = headerInfo.dataStartRow;
    const dataRows = jsonData.slice(dataStartRow);
    
    this.addDebugLog(`Заголовки листа "${sheetName}"`, {
      headers,
      headersCount: headers.length,
      headersString: headers.join(' | ')
    });

    // Гибкий маппинг заголовков
    const headerMap = this.flexibleMapHeaders(headers);
    
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
          hasData: row.some(cell => cell !== undefined && cell !== '')
        });

        // Более гибкая проверка валидности строки
        if (!this.flexibleIsValidOrderRow(row, headerMap)) {
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
      warnings,
      totalRows: dataRows.length,
      processedRows: orders.length
    };
  }

  flexibleMapHeaders(headers) {
    this.addDebugLog('Начинаем гибкий маппинг заголовков', { headers });
    
    const headerMap = {};
    
    headers.forEach((header, index) => {
      if (!header) return;
      
      const originalHeader = header;
      const normalizedHeader = header.toString().toLowerCase().trim();
      const noApostrophes = normalizedHeader.replace(/['"]/g, '');
      
      this.addDebugLog(`Анализ заголовка ${index}: "${originalHeader}" -> "${normalizedHeader}"`);
      
      // ИМЯ КЛИЕНТА - очень гибкий поиск
      if (this.includesAny(noApostrophes, [
        'заказчик', 'клиент', 'имя', 'customer', 'name', 'покупатель', 'покупатель (имя)',
        'заказчик (имя)', 'клиент (имя)', 'покупатель (имя)', 'заказчик имя', 'клиент имя',
        'заказчик имя', 'заказчик имя', 'заказчик имя', 'заказчик имя', 'заказчик имя'
      ]) && !this.includesAny(noApostrophes, ['номер', '№', 'number', 'id', 'заказ', 'замовлення', 'всего заказов'])) {
        if (headerMap.customerName === undefined) {
          headerMap.customerName = index;
          this.addDebugLog(`Найден имя клиента в колонке ${index}: "${originalHeader}"`);
        }
      }
      // СУММА - очень гибкий поиск
      else if (this.includesAny(noApostrophes, [
        'сумма', 'amount', 'price', 'стоимость', 'вартість', 'цена', 'суммы', 'amounts', 'prices',
        'сумма заказа', 'стоимость заказа', 'к оплате', 'to pay', 'оплате', 'pay', 'сумма к оплате',
        'к оплате сумма', 'сумма замовлення', 'сумма замовлення', 'сумма заказа', 'сумма заказа',
        'к оплате', 'оплате', 'сумма сдачи', 'сдача', 'сумма сдачи'
      ]) && !this.includesAny(noApostrophes, ['номер', '№', 'number', 'id', 'процент', '%'])) {
        if (headerMap.amount === undefined) {
          headerMap.amount = index;
          this.addDebugLog(`Найден сумма в колонке ${index}: "${originalHeader}"`);
        }
      }
      // НОМЕР ЗАКАЗА - гибкий поиск
      else if (this.includesAny(noApostrophes, [
        'номер', '№', 'number', 'id', 'заказ', 'замовлення', 'номер заказа', 'номер замовлення',
        'заказ номер', 'замовлення номер', 'order', 'order number', 'order id'
      ]) && !this.includesAny(noApostrophes, ['сумма', 'amount', 'price', 'стоимость', 'оплате', 'заказчик', 'клиент'])) {
        if (headerMap.orderNumber === undefined) {
          headerMap.orderNumber = index;
          this.addDebugLog(`Найден номер заказа в колонке ${index}: "${originalHeader}"`);
        }
      }
      // АДРЕС - очень гибкий поиск
      else if (this.includesAny(noApostrophes, [
        'адрес', 'address', 'доставки', 'delivery', 'адрес доставки', 'адрес доставки',
        'адрес доставки', 'адрес доставки', 'адрес доставки', 'адрес доставки', 'адрес доставки',
        'адрес доставки', 'адрес доставки', 'адрес доставки', 'адрес доставки', 'адрес доставки',
        'адрес', 'адрес', 'адрес', 'адрес', 'адрес'
      ])) {
        if (headerMap.address === undefined) {
          headerMap.address = index;
          this.addDebugLog(`Найден адрес в колонке ${index}: "${originalHeader}"`);
        }
      }
      // КУРЬЕР - гибкий поиск
      else if (this.includesAny(noApostrophes, [
        'курьер', 'courier', 'доставщик', 'delivery', 'driver', 'курьер доставки', 'курьер доставки',
        'курьер доставки', 'курьер доставки', 'курьер доставки', 'курьер доставки', 'курьер доставки',
        'курьер', 'курьер', 'курьер', 'курьер', 'курьер'
      ])) {
        if (headerMap.courier === undefined) {
          headerMap.courier = index;
          this.addDebugLog(`Найден курьер в колонке ${index}: "${originalHeader}"`);
        }
      }
      // СПОСОБ ОПЛАТЫ - гибкий поиск
      else if (this.includesAny(noApostrophes, [
        'оплаты', 'payment', 'способ', 'method', 'оплата', 'pay', 'способ оплаты', 'способ оплаты',
        'способ оплаты', 'способ оплаты', 'способ оплаты', 'способ оплаты', 'способ оплаты',
        'способ оплаты', 'способ оплаты', 'способ оплаты', 'способ оплаты', 'способ оплаты'
      ])) {
        if (headerMap.paymentMethod === undefined) {
          headerMap.paymentMethod = index;
          this.addDebugLog(`Найден способ оплаты в колонке ${index}: "${originalHeader}"`);
        }
      }
      // ТЕЛЕФОН - гибкий поиск
      else if (this.includesAny(noApostrophes, [
        'телефон', 'phone', 'тел', 'мобильный', 'mobile', 'телефон клиента', 'телефон клиента',
        'телефон клиента', 'телефон клиента', 'телефон клиента', 'телефон клиента', 'телефон клиента',
        'телефон', 'телефон', 'телефон', 'телефон', 'телефон'
      ])) {
        if (headerMap.phone === undefined) {
          headerMap.phone = index;
          this.addDebugLog(`Найден телефон в колонке ${index}: "${originalHeader}"`);
        }
      }
      // КОММЕНТАРИИ - гибкий поиск
      else if (this.includesAny(noApostrophes, [
        'комментарии', 'комментарий', 'comment', 'примечание', 'note', 'комментарий к заказу',
        'комментарий к заказу', 'комментарий к заказу', 'комментарий к заказу', 'комментарий к заказу'
      ])) {
        if (headerMap.comment === undefined) {
          headerMap.comment = index;
          this.addDebugLog(`Найден комментарий в колонке ${index}: "${originalHeader}"`);
        }
      }
    });
    
    this.addDebugLog('Гибкий маппинг заголовков завершен', headerMap);
    return headerMap;
  }

  flexibleIsValidOrderRow(row, headerMap) {
    // Считаем строку валидной если есть хотя бы адрес ИЛИ курьер ИЛИ способ оплаты
    const hasAddress = headerMap.address !== undefined && row[headerMap.address] && row[headerMap.address].toString().trim();
    const hasCourier = headerMap.courier !== undefined && row[headerMap.courier] && row[headerMap.courier].toString().trim();
    const hasPaymentMethod = headerMap.paymentMethod !== undefined && row[headerMap.paymentMethod] && row[headerMap.paymentMethod].toString().trim();
    const hasCustomerName = headerMap.customerName !== undefined && row[headerMap.customerName] && row[headerMap.customerName].toString().trim();
    const hasAmount = headerMap.amount !== undefined && row[headerMap.amount] && row[headerMap.amount].toString().trim();
    
    this.addDebugLog(`Гибкий анализ строки ${row[0] || 'unknown'}`, {
      hasAddress,
      hasCourier,
      hasPaymentMethod,
      hasCustomerName,
      hasAmount,
      addressValue: row[headerMap.address] || '',
      courierValue: row[headerMap.courier] || '',
      paymentValue: row[headerMap.paymentMethod] || ''
    });
    
    // Строка валидна если есть хотя бы 2 из 3 основных полей
    const validFields = [hasAddress, hasCourier, hasPaymentMethod].filter(Boolean).length;
    const isValid = validFields >= 2 || (hasCustomerName && hasAmount);
    
    this.addDebugLog(`Строка валидна: ${isValid} (${validFields} из 3 полей)`);
    return isValid;
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

  findHeaders(jsonData) {
    this.addDebugLog('Поиск заголовков в Excel файле');
    
    // Ищем строки с заголовками - они содержат ключевые слова
    const headerKeywords = [
      'номер', 'состояние', 'тип', 'телефон', 'заказчик', 'адрес', 'зона', 'время', 
      'дата', 'скидка', 'оплате', 'сдача', 'способ', 'курьер', 'имя', 'создания',
      'кухню', 'доставить', 'плановое', 'общее', 'сумма', 'процент'
    ];
    
    let bestHeaderRow = 0;
    let bestHeaderScore = 0;
    let bestHeaders = [];
    
    // Проверяем первые 10 строк на наличие заголовков
    for (let rowIndex = 0; rowIndex < Math.min(10, jsonData.length); rowIndex++) {
      const row = jsonData[rowIndex];
      if (!row) continue;
      
      let score = 0;
      const foundHeaders = [];
      
      row.forEach((cell, colIndex) => {
        if (cell && typeof cell === 'string') {
          const cellLower = cell.toLowerCase().trim();
          const hasKeyword = headerKeywords.some(keyword => cellLower.includes(keyword));
          if (hasKeyword) {
            score++;
            foundHeaders[colIndex] = cell;
          }
        }
      });
      
      this.addDebugLog(`Строка ${rowIndex + 1}: найдено ${score} заголовков`, {
        row: row.slice(0, 10), // первые 10 колонок
        score,
        foundHeaders: foundHeaders.filter(Boolean)
      });
      
      if (score > bestHeaderScore) {
        bestHeaderScore = score;
        bestHeaderRow = rowIndex;
        bestHeaders = foundHeaders;
      }
    }
    
    // Если нашли заголовки, попробуем объединить с следующей строкой
    let finalHeaders = bestHeaders;
    let dataStartRow = bestHeaderRow + 1;
    
    if (bestHeaderScore > 0 && bestHeaderRow + 1 < jsonData.length) {
      const nextRow = jsonData[bestHeaderRow + 1];
      const combinedHeaders = this.combineHeaders(bestHeaders, nextRow);
      
      if (combinedHeaders.filter(Boolean).length > bestHeaders.filter(Boolean).length) {
        finalHeaders = combinedHeaders;
        dataStartRow = bestHeaderRow + 2;
        this.addDebugLog('Объединили заголовки из двух строк');
      }
    }
    
    // Очищаем заголовки от undefined
    const cleanHeaders = finalHeaders.map(header => header || '');
    
    this.addDebugLog('Найдены заголовки', {
      headerRow: bestHeaderRow + 1,
      dataStartRow: dataStartRow + 1,
      headers: cleanHeaders,
      score: bestHeaderScore
    });
    
    return {
      headers: cleanHeaders,
      dataStartRow: dataStartRow,
      headerRow: bestHeaderRow
    };
  }

  combineHeaders(row1, row2) {
    const combined = [];
    const maxLength = Math.max(row1.length, row2.length);
    
    for (let i = 0; i < maxLength; i++) {
      const cell1 = row1[i] || '';
      const cell2 = row2[i] || '';
      
      if (cell1 && cell2) {
        // Объединяем если оба не пустые
        combined[i] = `${cell1} ${cell2}`.trim();
      } else {
        // Берем непустую ячейку
        combined[i] = cell1 || cell2;
      }
    }
    
    return combined;
  }

  includesAny(text, keywords) {
    return keywords.some(keyword => text.includes(keyword));
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
    
    const deliveryCount = orders.filter(order => order.type === 'Доставка').length;
    const pickupCount = orders.filter(order => order.type === 'Самовывоз').length;
    
    this.addDebugLog('Статистика рассчитана', {
      totalOrders,
      totalAmount,
      averageAmount,
      deliveryCount,
      pickupCount
    });
    
    return {
      totalOrders,
      totalAmount,
      averageAmount,
      deliveryCount,
      pickupCount,
      courierStats: {},
      paymentStats: {},
      zoneStats: {}
    };
  }
}

module.exports = ExcelService_v3;
