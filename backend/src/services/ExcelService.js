const XLSX = require('xlsx');
const mongoose = require('mongoose');

class ExcelService {
  constructor() {
    this.supportedFormats = ['.xlsx', '.xls', '.csv'];
    this.maxFileSize = 10 * 1024 * 1024; // 10MB
  }

  /**
   * Обробляє Excel файл та розбиває на блоки даних
   * @param {Buffer} fileBuffer - Буфер файлу
   * @param {string} filename - Назва файлу
   * @returns {Object} Результат обробки
   */
  async processExcelFile(fileBuffer, filename) {
    try {
      console.log('🚀 ExcelService: Начало обработки файла:', filename);
      if (global.addDebugLog) {
        global.addDebugLog('🚀 ExcelService: Начало обработки файла', { filename, size: fileBuffer.length });
      }
      
      // Перевіряємо формат файлу
      const fileExtension = this.getFileExtension(filename);
      console.log('📄 ExcelService: Расширение файла:', fileExtension);
      if (global.addDebugLog) {
        global.addDebugLog('📄 ExcelService: Расширение файла', fileExtension);
      }
      
      if (!this.supportedFormats.includes(fileExtension)) {
        throw new Error(`Непідтримуваний формат файлу: ${fileExtension}. Підтримувані формати: ${this.supportedFormats.join(', ')}`);
      }

      // Читаємо Excel файл
      console.log('📖 ExcelService: Читаем Excel файл...');
      if (global.addDebugLog) {
        global.addDebugLog('📖 ExcelService: Читаем Excel файл...');
      }
      
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheetNames = workbook.SheetNames;
      
      console.log('📋 ExcelService: Найдено листов:', sheetNames.length, sheetNames);
      if (global.addDebugLog) {
        global.addDebugLog('📋 ExcelService: Найдено листов', { count: sheetNames.length, names: sheetNames });
      }
      
      if (sheetNames.length === 0) {
        throw new Error('Файл не містить жодного листа');
      }

      // Обробляємо кожен лист
      const processedData = {
        orders: [],
        couriers: [],
        paymentMethods: [],
        routes: [],
        errors: [],
        warnings: []
      };

      for (const sheetName of sheetNames) {
        console.log(`📊 ExcelService: Обрабатываем лист: "${sheetName}"`);
        if (global.addDebugLog) {
          global.addDebugLog(`📊 ExcelService: Обрабатываем лист: "${sheetName}"`);
        }
        
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1,
          defval: '',
          raw: false
        });

        console.log(`📋 ExcelService: Сырые данные из листа (${jsonData.length} строк):`, jsonData.slice(0, 3));
        if (global.addDebugLog) {
          global.addDebugLog(`📋 ExcelService: Сырые данные из листа (${jsonData.length} строк)`, jsonData.slice(0, 3));
        }

        // Пропускаємо порожні рядки
        const cleanData = jsonData.filter(row => 
          row.some(cell => cell && cell.toString().trim() !== '')
        );

        console.log(`🧹 ExcelService: После очистки: ${cleanData.length} строк`);
        if (global.addDebugLog) {
          global.addDebugLog(`🧹 ExcelService: После очистки: ${cleanData.length} строк`);
        }

        if (cleanData.length === 0) {
          console.log(`⚠️ ExcelService: Лист "${sheetName}" пустой`);
          if (global.addDebugLog) {
            global.addDebugLog(`⚠️ ExcelService: Лист "${sheetName}" пустой`);
          }
          processedData.warnings.push(`Лист "${sheetName}" порожній`);
          continue;
        }

        // Обробляємо дані з листа
        console.log(`🔄 ExcelService: Вызываем processSheetData для листа "${sheetName}"`);
        if (global.addDebugLog) {
          global.addDebugLog(`🔄 ExcelService: Вызываем processSheetData для листа "${sheetName}"`);
        }
        
        const sheetResult = await this.processSheetData(cleanData, sheetName);
        
        // Об'єднуємо результати
        processedData.orders.push(...sheetResult.orders);
        processedData.couriers.push(...sheetResult.couriers);
        processedData.paymentMethods.push(...sheetResult.paymentMethods);
        processedData.routes.push(...sheetResult.routes);
        processedData.errors.push(...sheetResult.errors);
        processedData.warnings.push(...sheetResult.warnings);
      }

      console.log(`\n📈 ExcelService: Итоги обработки всех листов:`);
      console.log(`📦 Заказов: ${processedData.orders.length}`);
      console.log(`🚚 Курьеров: ${processedData.couriers.length}`);
      console.log(`💳 Способов оплаты: ${processedData.paymentMethods.length}`);
      console.log(`🗺️ Маршрутов: ${processedData.routes.length}`);
      console.log(`❌ Ошибок: ${processedData.errors.length}`);
      console.log(`⚠️ Предупреждений: ${processedData.warnings.length}`);
      
      if (global.addDebugLog) {
        global.addDebugLog(`📈 ExcelService: Итоги обработки всех листов`, {
          orders: processedData.orders.length,
          couriers: processedData.couriers.length,
          paymentMethods: processedData.paymentMethods.length,
          routes: processedData.routes.length,
          errors: processedData.errors.length,
          warnings: processedData.warnings.length
        });
      }

      // Валідуємо та обробляємо дані
      console.log('🔄 ExcelService: Вызываем validateAndProcessData');
      if (global.addDebugLog) {
        global.addDebugLog('🔄 ExcelService: Вызываем validateAndProcessData');
      }
      
      const validationResult = await this.validateAndProcessData(processedData);
      
      console.log(`\n✅ ExcelService: Финальные результаты:`);
      console.log(`📦 Валидных заказов: ${validationResult.orders.length}`);
      console.log(`🚚 Валидных курьеров: ${validationResult.couriers.length}`);
      console.log(`💳 Валидных способов оплаты: ${validationResult.paymentMethods.length}`);
      
      if (global.addDebugLog) {
        global.addDebugLog(`✅ ExcelService: Финальные результаты`, {
          orders: validationResult.orders.length,
          couriers: validationResult.couriers.length,
          paymentMethods: validationResult.paymentMethods.length,
          routes: validationResult.routes.length,
          errors: validationResult.errors.length,
          warnings: validationResult.warnings.length
        });
      }
      
      return {
        success: true,
        data: validationResult,
        summary: {
          totalOrders: validationResult.orders.length,
          totalCouriers: validationResult.couriers.length,
          totalPaymentMethods: validationResult.paymentMethods.length,
          totalRoutes: validationResult.routes.length,
          errors: validationResult.errors.length,
          warnings: validationResult.warnings.length
        }
      };

    } catch (error) {
      console.error('❌ ExcelService: Помилка обробки Excel файлу:', error);
      if (global.addDebugLog) {
        global.addDebugLog('❌ ExcelService: Помилка обробки Excel файлу', { error: error.message, stack: error.stack });
      }
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  /**
   * Обробляє дані з одного листа
   * @param {Array} data - Дані з листа
   * @param {string} sheetName - Назва листа
   * @returns {Object} Оброблені дані
   */
  async processSheetData(data, sheetName) {
    const result = {
      orders: [],
      couriers: [],
      paymentMethods: [],
      routes: [],
      errors: [],
      warnings: []
    };

    try {
      // Знаходимо заголовки (перший рядок)
      const headers = data[0] || [];
      const headerMap = this.mapHeaders(headers);

      console.log(`📊 Обрабатываем ${data.length - 1} строк данных...`);
      
      // Обробляємо кожен рядок даних
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        try {
          const processedRow = this.processRow(row, headerMap, i + 1);
          
          if (processedRow.type === 'order') {
            result.orders.push(processedRow.data);
          } else if (processedRow.type === 'courier') {
            result.couriers.push(processedRow.data);
          } else if (processedRow.type === 'payment') {
            result.paymentMethods.push(processedRow.data);
          } else if (processedRow.type === 'route') {
            result.routes.push(processedRow.data);
          }
        } catch (rowError) {
          console.log(`❌ Ошибка в строке ${i + 1}: ${rowError.message}`);
          result.errors.push(`Рядок ${i + 1}: ${rowError.message}`);
        }
      }
      
      console.log(`📈 Результаты обработки листа: заказов=${result.orders.length}, курьеров=${result.couriers.length}, способов оплаты=${result.paymentMethods.length}, ошибок=${result.errors.length}`);
      
      // Добавляем в debug логи
      if (global.addDebugLog) {
        global.addDebugLog(`📈 Результаты обработки листа: заказов=${result.orders.length}, курьеров=${result.couriers.length}, способов оплаты=${result.paymentMethods.length}, ошибок=${result.errors.length}`);
      }

    } catch (error) {
      result.errors.push(`Лист "${sheetName}": ${error.message}`);
    }

    return result;
  }

  /**
   * Мапить заголовки колонок
   * @param {Array} headers - Заголовки
   * @returns {Object} Мапа заголовків
   */
  mapHeaders(headers) {
    const headerMap = {};
    
    console.log('🔍 Анализ заголовков Excel файла:');
    console.log('📋 Исходные заголовки:', headers);
    
    // Добавляем в debug логи
    if (global.addDebugLog) {
      global.addDebugLog('🔍 Анализ заголовков Excel файла');
      global.addDebugLog('📋 Исходные заголовки', headers);
    }
    
    headers.forEach((header, index) => {
      if (!header) return;
      
      const normalizedHeader = header.toString().toLowerCase().trim();
      // Also normalize by removing apostrophes to be robust to variations
      const noApostrophes = normalizedHeader.replace(/[''`]/g, '');
      
      console.log(`  ${index}: "${header}" -> "${normalizedHeader}" -> "${noApostrophes}"`);
      
      // Helpers
      const includesAny = (s, arr) => arr.some(k => s.includes(k));

      // Мапимо українські, російські та англійські заголовки
      if (includesAny(noApostrophes, ['номер', 'номер заказа', 'номер замовлення', 'no', '№', 'number', 'order', 'id'])) {
        if (headerMap.orderNumber === undefined) headerMap.orderNumber = index;
      } else if (includesAny(noApostrophes, ['адреса', 'адрес', 'address', 'адрес доставки'])) {
        if (headerMap.address === undefined) headerMap.address = index;
      } else if (includesAny(noApostrophes, ['телефон', 'phone', 'моб', 'mobile'])) {
        if (headerMap.phone === undefined) headerMap.phone = index;
      } else if (includesAny(noApostrophes, ['курєр', 'курер', 'курьер', 'courier', 'доставщик'])) {
        if (headerMap.courier === undefined) headerMap.courier = index;
      } else if (includesAny(noApostrophes, ['оплата', 'способ оплаты', 'payment', 'оплат', 'сплата'])) {
        if (headerMap.paymentMethod === undefined) headerMap.paymentMethod = index;
      } else if (includesAny(noApostrophes, ['сума', 'сумма', 'amount', 'price', 'стоимость', 'вартість', 'сумма заказа', 'к оплате'])) {
        if (headerMap.amount === undefined) headerMap.amount = index;
      } else if (includesAny(noApostrophes, ['тип заказа', 'тип замовлення', 'order type'])) {
        if (headerMap.orderType === undefined) headerMap.orderType = index;
      } else if (includesAny(noApostrophes, ['имя', 'імя', 'name'])) {
        if (headerMap.customerName === undefined) headerMap.customerName = index;
      } else if (includesAny(noApostrophes, ['примітка', 'примечание', 'note', 'comment'])) {
        if (headerMap.note === undefined) headerMap.note = index;
      } else if (includesAny(noApostrophes, ['пріоритет', 'приоритет', 'priority'])) {
        if (headerMap.priority === undefined) headerMap.priority = index;
      } else if (includesAny(noApostrophes, ['статус', 'status'])) {
        if (headerMap.status === undefined) headerMap.status = index;
      } else if (includesAny(noApostrophes, ['дата', 'date'])) {
        if (headerMap.date === undefined) headerMap.date = index;
      } else if (includesAny(noApostrophes, ['час', 'время', 'time'])) {
        if (headerMap.time === undefined) headerMap.time = index;
      }
    });

    console.log('🗺️ Результат маппинга заголовков:', headerMap);
    
    // Добавляем в debug логи
    if (global.addDebugLog) {
      global.addDebugLog('🗺️ Результат маппинга заголовков', headerMap);
    }
    
    return headerMap;
  }

  /**
   * Обробляє один рядок даних
   * @param {Array} row - Рядок даних
   * @param {Object} headerMap - Мапа заголовків
   * @param {number} rowNumber - Номер рядка
   * @returns {Object} Оброблений рядок
   */
  processRow(row, headerMap, rowNumber) {
    // Визначаємо тип рядка на основі наявних даних
    const hasOrderNumber = headerMap.orderNumber !== undefined && row[headerMap.orderNumber] && row[headerMap.orderNumber].toString().trim() !== '';
    const hasAddress = headerMap.address !== undefined && row[headerMap.address] && row[headerMap.address].toString().trim() !== '';
    const hasCourier = headerMap.courier !== undefined && row[headerMap.courier] && row[headerMap.courier].toString().trim() !== '';
    const hasPaymentMethod = headerMap.paymentMethod !== undefined && row[headerMap.paymentMethod] && row[headerMap.paymentMethod].toString().trim() !== '';

    console.log(`📊 Обработка строки ${rowNumber}:`, {
      hasOrderNumber,
      hasAddress,
      hasCourier,
      hasPaymentMethod,
      orderNumber: hasOrderNumber ? row[headerMap.orderNumber] : 'нет',
      address: hasAddress ? row[headerMap.address] : 'нет',
      courier: hasCourier ? row[headerMap.courier] : 'нет',
      rawRow: row,
      headerMap: headerMap
    });

    // Добавляем в debug логи
    if (global.addDebugLog) {
      global.addDebugLog(`📊 Обработка строки ${rowNumber}`, {
        hasOrderNumber,
        hasAddress,
        hasCourier,
        hasPaymentMethod,
        orderNumber: hasOrderNumber ? row[headerMap.orderNumber] : 'нет',
        address: hasAddress ? row[headerMap.address] : 'нет',
        courier: hasCourier ? row[headerMap.courier] : 'нет',
        rawRow: row,
        headerMap: headerMap
      });
    }

    if (hasAddress) {
      // Це замовлення (если есть адрес, создаем заказ)
      console.log(`✅ Строка ${rowNumber}: Определена как ЗАКАЗ (по адресу)`);
      
      // Добавляем в debug логи
      if (global.addDebugLog) {
        global.addDebugLog(`✅ Строка ${rowNumber}: Определена как ЗАКАЗ (по адресу)`);
      }
      
      return {
        type: 'order',
        data: this.processOrderRow(row, headerMap, rowNumber)
      };
    } else if (hasCourier && !hasAddress) {
      // Це курєр
      console.log(`✅ Строка ${rowNumber}: Определена как КУРЬЕР`);
      
      // Добавляем в debug логи
      if (global.addDebugLog) {
        global.addDebugLog(`✅ Строка ${rowNumber}: Определена как КУРЬЕР`);
      }
      
      return {
        type: 'courier',
        data: this.processCourierRow(row, headerMap, rowNumber)
      };
    } else if (hasPaymentMethod && !hasAddress) {
      // Це спосіб оплати
      console.log(`✅ Строка ${rowNumber}: Определена как СПОСОБ ОПЛАТЫ`);
      
      // Добавляем в debug логи
      if (global.addDebugLog) {
        global.addDebugLog(`✅ Строка ${rowNumber}: Определена как СПОСОБ ОПЛАТЫ`);
      }
      
      return {
        type: 'payment',
        data: this.processPaymentMethodRow(row, headerMap, rowNumber)
      };
    } else {
      // Інакше маркуємо як помилку, щоб користувач бачив проблему
      console.log(`❌ Строка ${rowNumber}: НЕ ОПРЕДЕЛЕНА - нет адресы`);
      
      // Добавляем в debug логи
      if (global.addDebugLog) {
        global.addDebugLog(`❌ Строка ${rowNumber}: НЕ ОПРЕДЕЛЕНА - нет адресы`);
      }
      
      throw new Error('Неможливо визначити тип рядка — перевірте заголовки та дані');
    }
  }

  /**
   * Обробляє рядок замовлення
   * @param {Array} row - Рядок даних
   * @param {Object} headerMap - Мапа заголовків
   * @param {number} rowNumber - Номер рядка
   * @returns {Object} Дані замовлення
   */
  processOrderRow(row, headerMap, rowNumber) {
    const order = {
      orderNumber: this.getCellValue(row, headerMap.orderNumber),
      address: this.getCellValue(row, headerMap.address),
      phone: this.getCellValue(row, headerMap.phone),
      courier: this.getCellValue(row, headerMap.courier),
      paymentMethod: this.getCellValue(row, headerMap.paymentMethod),
      amount: this.parseAmount(this.getCellValue(row, headerMap.amount)),
      note: this.getCellValue(row, headerMap.note),
      priority: this.getCellValue(row, headerMap.priority) || 'normal',
      status: this.getCellValue(row, headerMap.status) || 'pending',
      date: this.parseDate(this.getCellValue(row, headerMap.date)),
      time: this.getCellValue(row, headerMap.time),
      rowNumber: rowNumber
    };

    // Валідація обовязкових полів
    if (!order.orderNumber) {
      console.log(`⚠️ Строка ${rowNumber}: Нет номера заказа, создаем временный номер`);
      order.orderNumber = `TEMP_${rowNumber}`;
    }
    if (!order.address) {
      throw new Error('Адреса є обовязковою');
    }

    console.log(`📦 Создан заказ: ${order.orderNumber} - ${order.address}`);
    
    // Добавляем в debug логи
    if (global.addDebugLog) {
      global.addDebugLog(`📦 Создан заказ: ${order.orderNumber} - ${order.address}`);
    }
    
    return order;
  }

  /**
   * Обробляє рядок курєра
   * @param {Array} row - Рядок даних
   * @param {Object} headerMap - Мапа заголовків
   * @param {number} rowNumber - Номер рядка
   * @returns {Object} Дані курєра
   */
  processCourierRow(row, headerMap, rowNumber) {
    const courier = {
      name: this.getCellValue(row, headerMap.courier),
      phone: this.getCellValue(row, headerMap.phone),
      vehicleType: this.getCellValue(row, headerMap.vehicleType) || 'car',
      location: this.getCellValue(row, headerMap.address),
      isActive: true,
      rowNumber: rowNumber
    };

    if (!courier.name) {
      throw new Error('Імя курєра є обовязковим');
    }

    return courier;
  }

  /**
   * Обробляє рядок способу оплати
   * @param {Array} row - Рядок даних
   * @param {Object} headerMap - Мапа заголовків
   * @param {number} rowNumber - Номер рядка
   * @returns {Object} Дані способу оплати
   */
  processPaymentMethodRow(row, headerMap, rowNumber) {
    const paymentMethod = {
      name: this.getCellValue(row, headerMap.paymentMethod),
      description: this.getCellValue(row, headerMap.note),
      isActive: true,
      rowNumber: rowNumber
    };

    if (!paymentMethod.name) {
      throw new Error('Назва способу оплати є обовязковою');
    }

    return paymentMethod;
  }

  /**
   * Обробляє рядок маршруту
   * @param {Array} row - Рядок даних
   * @param {Object} headerMap - Мапа заголовків
   * @param {number} rowNumber - Номер рядка
   * @returns {Object} Дані маршруту
   */
  processRouteRow(row, headerMap, rowNumber) {
    const route = {
      startPoint: this.getCellValue(row, headerMap.address),
      endPoint: this.getCellValue(row, headerMap.address), // Можна розширити
      courier: this.getCellValue(row, headerMap.courier),
      priority: this.getCellValue(row, headerMap.priority) || 'normal',
      note: this.getCellValue(row, headerMap.note),
      rowNumber: rowNumber
    };

    return route;
  }

  /**
   * Валідує та обробляє всі дані
   * @param {Object} data - Дані для валідації
   * @returns {Object} Валідовані дані
   */
  async validateAndProcessData(data) {
    const result = {
      orders: [],
      couriers: [],
      paymentMethods: [],
      routes: [],
      errors: [],
      warnings: []
    };

    // Валідуємо замовлення
    for (const order of data.orders) {
      try {
        const validatedOrder = await this.validateOrder(order);
        result.orders.push(validatedOrder);
      } catch (error) {
        result.errors.push(`Замовлення ${order.orderNumber}: ${error.message}`);
      }
    }

    // Валідуємо курєрів
    for (const courier of data.couriers) {
      try {
        const validatedCourier = await this.validateCourier(courier);
        result.couriers.push(validatedCourier);
      } catch (error) {
        result.errors.push(`Кур'єр ${courier.name}: ${error.message}`);
      }
    }

    // Валідуємо способи оплати
    for (const paymentMethod of data.paymentMethods) {
      try {
        const validatedPaymentMethod = await this.validatePaymentMethod(paymentMethod);
        result.paymentMethods.push(validatedPaymentMethod);
      } catch (error) {
        result.errors.push(`Спосіб оплати ${paymentMethod.name}: ${error.message}`);
      }
    }

    // Валідуємо маршрути
    for (const route of data.routes) {
      try {
        const validatedRoute = await this.validateRoute(route);
        result.routes.push(validatedRoute);
      } catch (error) {
        result.errors.push(`Маршрут: ${error.message}`);
      }
    }

    // Додаємо попередження
    result.warnings.push(...data.warnings);

    return result;
  }

  /**
   * Валідує замовлення
   * @param {Object} order - Замовлення
   * @returns {Object} Валідоване замовлення
   */
  async validateOrder(order) {
    // Перевіряємо унікальність номера замовлення
    const existingOrder = await mongoose.model('Order').findOne({ orderNumber: order.orderNumber });
    if (existingOrder) {
      throw new Error('Замовлення з таким номером вже існує');
    }

    return {
      ...order,
      _id: new mongoose.Types.ObjectId(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Валідує курєра
   * @param {Object} courier - Курєр
   * @returns {Object} Валідований курєр
   */
  async validateCourier(courier) {
    // Перевіряємо унікальність курєра
    const existingCourier = await mongoose.model('Courier').findOne({ name: courier.name });
    if (existingCourier) {
      throw new Error('Курєр з таким імям вже існує');
    }

    return {
      ...courier,
      _id: new mongoose.Types.ObjectId(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Валідує спосіб оплати
   * @param {Object} paymentMethod - Спосіб оплати
   * @returns {Object} Валідований спосіб оплати
   */
  async validatePaymentMethod(paymentMethod) {
    return {
      ...paymentMethod,
      _id: new mongoose.Types.ObjectId(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Валідує маршрут
   * @param {Object} route - Маршрут
   * @returns {Object} Валідований маршрут
   */
  async validateRoute(route) {
    return {
      ...route,
      _id: new mongoose.Types.ObjectId(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * Отримує значення комірки
   * @param {Array} row - Рядок
   * @param {number} index - Індекс
   * @returns {string} Значення комірки
   */
  getCellValue(row, index) {
    if (index === undefined || index >= row.length) return '';
    const value = row[index];
    return value ? value.toString().trim() : '';
  }

  /**
   * Парсить суму
   * @param {string} amount - Сума
   * @returns {number} Парсена сума
   */
  parseAmount(amount) {
    if (!amount) return 0;
    const cleaned = amount.toString().replace(/[^\d.,]/g, '');
    const normalized = cleaned.replace(',', '.');
    return parseFloat(normalized) || 0;
  }

  /**
   * Парсить дату
   * @param {string} date - Дата
   * @returns {Date} Парсена дата
   */
  parseDate(date) {
    if (!date) return new Date();
    const parsed = new Date(date);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  /**
   * Отримує розширення файлу
   * @param {string} filename - Назва файлу
   * @returns {string} Розширення файлу
   */
  getFileExtension(filename) {
    return filename.toLowerCase().substring(filename.lastIndexOf('.'));
  }

  /**
   * Створює звіт про обробку
   * @param {Object} result - Результат обробки
   * @returns {string} Звіт
   */
  generateReport(result) {
    if (!result.success) {
      return `❌ Помилка обробки файлу: ${result.error}`;
    }

    const { summary } = result;
    let report = '✅ Файл успішно оброблено!\n\n';
    report += `📊 Статистика:\n`;
    report += `• Замовлень: ${summary.totalOrders}\n`;
    report += `• Кур'єрів: ${summary.totalCouriers}\n`;
    report += `• Спосібів оплати: ${summary.totalPaymentMethods}\n`;
    report += `• Маршрутів: ${summary.totalRoutes}\n`;
    report += `• Помилок: ${summary.errors}\n`;
    report += `• Попереджень: ${summary.warnings}\n`;

    if (summary.errors > 0) {
      report += `\n❌ Помилки:\n`;
      result.data.errors.forEach(error => {
        report += `• ${error}\n`;
      });
    }

    if (summary.warnings > 0) {
      report += `\n⚠️ Попередження:\n`;
      result.data.warnings.forEach(warning => {
        report += `• ${warning}\n`;
      });
    }

    return report;
  }
}

module.exports = new ExcelService();
