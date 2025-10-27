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
    this.addDebugLog('Начало обработки Excel файла v3');
    
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

      const result = this.initializeResult();

      // Обрабатываем все листы
      workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const sheetResult = this.processSheet(sheet, sheetName);
        
        this.mergeSheetResults(result, sheetResult);
      });

      // Финальная обработка
      this.finalizeResult(result);

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
        summary: this.createSummary(result),
        message: 'Файл успешно обработан v3'
      };

    } catch (error) {
      this.addDebugLog('Ошибка обработки файла', { error: error.message });
      return this.createErrorResult(error.message);
    }
  }

  initializeResult() {
    return {
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
  }

  mergeSheetResults(result, sheetResult) {
    result.orders.push(...sheetResult.orders);
    result.couriers.push(...sheetResult.couriers);
    result.paymentMethods.push(...sheetResult.paymentMethods);
    result.addresses.push(...sheetResult.addresses);
    result.errors.push(...sheetResult.errors);
    result.warnings.push(...sheetResult.warnings);
    
    result.debug.sheets.push({
      name: sheetResult.sheetName || 'Unknown',
      totalRows: sheetResult.totalRows || 0,
      processedRows: sheetResult.processedRows || 0
    });
  }

  finalizeResult(result) {
    // Удаляем дубликаты
    result.couriers = this.removeDuplicates(result.couriers, 'name');
    result.paymentMethods = this.removeDuplicates(result.paymentMethods, 'method');
    result.addresses = this.removeDuplicates(result.addresses, 'address');

    // Рассчитываем статистику
    result.statistics = this.calculateStatistics(result.orders);
    result.debug.totalRows = result.orders.length;
    result.debug.processedRows = result.orders.length;
  }

  createSummary(result) {
    return {
      totalOrders: result.orders.length,
      totalCouriers: result.couriers.length,
      totalPaymentMethods: result.paymentMethods.length,
      successfulGeocoding: 0,
      failedGeocoding: result.orders.length,
      errors: result.errors.length,
      warnings: result.warnings.length
    };
  }

  createErrorResult(errorMessage) {
    return {
      success: false,
      data: {
        orders: [],
        couriers: [],
        paymentMethods: [],
        addresses: [],
        routes: [],
        errors: [errorMessage],
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
      message: `Ошибка обработки файла: ${errorMessage}`
    };
  }

  processSheet(sheet, sheetName) {
    this.addDebugLog(`Обработка листа "${sheetName}"`);
    
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });
    
    if (jsonData.length === 0) {
      this.addDebugLog(`Лист "${sheetName}" пуст`);
      return this.createEmptySheetResult(sheetName);
    }

    // Ищем заголовки
    const headerInfo = this.findHeaders(jsonData);
    const headers = headerInfo.headers;
    const dataStartRow = headerInfo.dataStartRow;
    const dataRows = jsonData.slice(dataStartRow);
    
    this.addDebugLog(`Заголовки листа "${sheetName}"`, {
      headers,
      headersCount: headers.length,
      headersString: headers.join(' | ')
    });

    // Маппинг заголовков
    const headerMap = this.flexibleMapHeaders(headers);
    this.addDebugLog(`Маппинг заголовков для "${sheetName}"`, headerMap);

    // Обрабатываем строки данных
    const result = this.processDataRows(dataRows, headerMap, sheetName);
    
    this.addDebugLog(`Обработано строк: ${result.orders.length} из ${dataRows.length}`);
    return result;
  }

  createEmptySheetResult(sheetName) {
    return {
      orders: [],
      couriers: [],
      paymentMethods: [],
      addresses: [],
      errors: [],
      warnings: [],
      totalRows: 0,
      processedRows: 0,
      sheetName
    };
  }

  processDataRows(dataRows, headerMap, sheetName) {
    const orders = [];
    const couriers = [];
    const paymentMethods = [];
    const addresses = [];
    const errors = [];
    const warnings = [];

    this.addDebugLog(`Начинаем обработку ${dataRows.length} строк данных`);

    dataRows.forEach((row, index) => {
      try {
        const rowNumber = index + 2;
        
        this.addDebugLog(`Обработка строки ${rowNumber}`, {
          row,
          rowLength: row.length,
          hasData: row.some(cell => cell !== undefined && cell !== '')
        });

        if (!this.flexibleIsValidOrderRow(row, headerMap)) {
          this.addDebugLog(`Строка ${rowNumber} пропущена - недостаточно данных`);
          return;
        }

        const order = this.processOrderRow(row, headerMap, rowNumber);
        
        if (order) {
          orders.push(order);
          this.addRelatedData(order, couriers, paymentMethods, addresses);
        }
        
      } catch (error) {
        const errorMsg = `Ошибка обработки строки ${index + 2}: ${error.message}`;
        this.addDebugLog(errorMsg);
        errors.push(errorMsg);
      }
    });

    return {
      orders,
      couriers,
      paymentMethods,
      addresses,
      errors,
      warnings,
      totalRows: dataRows.length,
      processedRows: orders.length,
      sheetName
    };
  }

  addRelatedData(order, couriers, paymentMethods, addresses) {
    if (order.courier) {
      // Ищем существующего курьера
      const existingCourier = couriers.find(c => c.name === order.courier);
      if (existingCourier) {
        existingCourier.orders += 1;
        existingCourier.totalAmount = (existingCourier.totalAmount || 0) + (order.amount || 0);
      } else {
        couriers.push({ 
          name: order.courier, 
          orders: 1,
          totalAmount: order.amount || 0
        });
      }
    }
    
    if (order.paymentMethod) {
      // Ищем существующий способ оплаты
      const existingPayment = paymentMethods.find(p => p.method === order.paymentMethod);
      if (existingPayment) {
        existingPayment.orders += 1;
        existingPayment.totalAmount = (existingPayment.totalAmount || 0) + (order.amount || 0);
      } else {
        paymentMethods.push({ 
          method: order.paymentMethod, 
          orders: 1,
          totalAmount: order.amount || 0
        });
      }
    }
    
    if (order.address) {
      // Ищем существующий адрес
      const existingAddress = addresses.find(a => a.address === order.address);
      if (existingAddress) {
        existingAddress.orders += 1;
        existingAddress.totalAmount = (existingAddress.totalAmount || 0) + (order.amount || 0);
      } else {
        addresses.push({ 
          address: order.address, 
          orders: 1,
          totalAmount: order.amount || 0
        });
      }
    }
  }

  findHeaders(jsonData) {
    this.addDebugLog('Поиск заголовков в Excel файле');
    
    const headerKeywords = [
      'номер', 'состояние', 'тип', 'телефон', 'заказчик', 'адрес', 'зона', 'время', 
      'дата', 'скидка', 'оплате', 'сдача', 'способ', 'курьер', 'имя', 'создания',
      'кухню', 'доставить', 'плановое', 'общее', 'сумма', 'процент'
    ];
    
    let bestHeaderRow = 0;
    let bestHeaderScore = 0;
    let bestHeaders = [];
    
    // Проверяем первые 10 строк
    for (let rowIndex = 0; rowIndex < Math.min(10, jsonData.length); rowIndex++) {
      const row = jsonData[rowIndex];
      if (!row) continue;
      
      const { score, foundHeaders } = this.analyzeRowForHeaders(row, headerKeywords);
      
      this.addDebugLog(`Строка ${rowIndex + 1}: найдено ${score} заголовков`, {
        row: row.slice(0, 10),
        score,
        foundHeaders: foundHeaders.filter(Boolean)
      });
      
      if (score > bestHeaderScore) {
        bestHeaderScore = score;
        bestHeaderRow = rowIndex;
        bestHeaders = foundHeaders;
      }
    }
    
    // Пытаемся объединить с следующей строкой
    const { finalHeaders, dataStartRow } = this.tryCombineHeaders(
      bestHeaders, 
      bestHeaderRow, 
      jsonData, 
      bestHeaderScore
    );
    
    this.addDebugLog('Найдены заголовки', {
      headerRow: bestHeaderRow + 1,
      dataStartRow: dataStartRow + 1,
      headers: finalHeaders,
      score: bestHeaderScore
    });
    
    return {
      headers: finalHeaders,
      dataStartRow: dataStartRow,
      headerRow: bestHeaderRow
    };
  }

  analyzeRowForHeaders(row, headerKeywords) {
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
    
    return { score, foundHeaders };
  }

  tryCombineHeaders(bestHeaders, bestHeaderRow, jsonData, bestHeaderScore) {
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
    
    return {
      finalHeaders: finalHeaders.map(header => header || ''),
      dataStartRow
    };
  }

  combineHeaders(row1, row2) {
    const combined = [];
    const maxLength = Math.max(row1.length, row2.length);
    
    for (let i = 0; i < maxLength; i++) {
      const cell1 = row1[i] || '';
      const cell2 = row2[i] || '';
      
      if (cell1 && cell2) {
        combined[i] = `${cell1} ${cell2}`.trim();
      } else {
        combined[i] = cell1 || cell2;
      }
    }
    
    return combined;
  }

  flexibleMapHeaders(headers) {
    this.addDebugLog('Начинаем гибкий маппинг заголовков', { headers });
    
    const headerMap = {};
    const mappingRules = this.getHeaderMappingRules();
    
    headers.forEach((header, index) => {
      if (!header) return;
      
      const originalHeader = header;
      const normalizedHeader = header.toString().toLowerCase().trim();
      const noApostrophes = normalizedHeader.replace(/['"]/g, '');
      
      this.addDebugLog(`Анализ заголовка ${index}: "${originalHeader}" -> "${normalizedHeader}"`);
      
      this.applyMappingRules(headerMap, index, noApostrophes, originalHeader, mappingRules);
    });
    
    this.addDebugLog('Гибкий маппинг заголовков завершен', headerMap);
    return headerMap;
  }

  getHeaderMappingRules() {
    return {
      customerName: {
        keywords: ['заказчик', 'клиент', 'имя', 'customer', 'name', 'покупатель'],
        exclusions: ['номер', '№', 'number', 'id', 'заказ', 'замовлення', 'всего заказов']
      },
      amount: {
        keywords: ['сумма', 'amount', 'price', 'стоимость', 'вартість', 'цена', 'к оплате', 'оплате', 'сумма сдачи', 'сдача'],
        exclusions: ['номер', '№', 'number', 'id', 'процент', '%']
      },
      orderNumber: {
        keywords: ['номер', '№', 'number', 'id', 'заказ', 'замовлення'],
        exclusions: ['сумма', 'amount', 'price', 'стоимость', 'оплате', 'заказчик', 'клиент']
      },
      address: {
        keywords: ['адрес', 'address', 'доставки', 'delivery']
      },
      courier: {
        keywords: ['курьер', 'courier', 'доставщик', 'delivery', 'driver']
      },
      paymentMethod: {
        keywords: ['оплаты', 'payment', 'способ', 'method', 'оплата', 'pay']
      },
      phone: {
        keywords: ['телефон', 'phone', 'тел', 'мобильный', 'mobile']
      },
      comment: {
        keywords: ['комментарии', 'комментарий', 'comment', 'примечание', 'note']
      }
    };
  }

  applyMappingRules(headerMap, index, noApostrophes, originalHeader, mappingRules) {
    Object.entries(mappingRules).forEach(([field, rule]) => {
      if (headerMap[field] !== undefined) return;
      
      const hasKeyword = this.includesAny(noApostrophes, rule.keywords);
      const hasExclusion = rule.exclusions && this.includesAny(noApostrophes, rule.exclusions);
      
      if (hasKeyword && !hasExclusion) {
        headerMap[field] = index;
        this.addDebugLog(`Найден ${field} в колонке ${index}: "${originalHeader}"`);
      }
    });
  }

  flexibleIsValidOrderRow(row, headerMap) {
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
      const amount = this.parseAmount(row, headerMap, rowNumber);
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
      return order;
      
    } catch (error) {
      this.addDebugLog(`Ошибка обработки строки ${rowNumber}: ${error.message}`);
      return null;
    }
  }

  parseAmount(row, headerMap, rowNumber) {
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
    return amount;
  }

  includesAny(text, keywords) {
    return keywords.some(keyword => text.includes(keyword));
  }

  removeDuplicates(items, keyField) {
    const unique = [];
    const seen = new Set();
    
    items.forEach(item => {
      const key = item[keyField];
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(item);
      }
    });
    
    return unique;
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











