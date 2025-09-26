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
      // Перевіряємо формат файлу
      const fileExtension = this.getFileExtension(filename);
      if (!this.supportedFormats.includes(fileExtension)) {
        throw new Error(`Непідтримуваний формат файлу: ${fileExtension}. Підтримувані формати: ${this.supportedFormats.join(', ')}`);
      }

      // Читаємо Excel файл
      const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
      const sheetNames = workbook.SheetNames;
      
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
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
          header: 1,
          defval: '',
          raw: false
        });

        // Пропускаємо порожні рядки
        const cleanData = jsonData.filter(row => 
          row.some(cell => cell && cell.toString().trim() !== '')
        );

        if (cleanData.length === 0) {
          processedData.warnings.push(`Лист "${sheetName}" порожній`);
          continue;
        }

        // Обробляємо дані з листа
        const sheetResult = await this.processSheetData(cleanData, sheetName);
        
        // Об'єднуємо результати
        processedData.orders.push(...sheetResult.orders);
        processedData.couriers.push(...sheetResult.couriers);
        processedData.paymentMethods.push(...sheetResult.paymentMethods);
        processedData.routes.push(...sheetResult.routes);
        processedData.errors.push(...sheetResult.errors);
        processedData.warnings.push(...sheetResult.warnings);
      }

      // Валідуємо та обробляємо дані
      const validationResult = await this.validateAndProcessData(processedData);
      
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
      console.error('Помилка обробки Excel файлу:', error);
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
          result.errors.push(`Рядок ${i + 1}: ${rowError.message}`);
        }
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
    
    headers.forEach((header, index) => {
      if (!header) return;
      
      const normalizedHeader = header.toString().toLowerCase().trim();
      // Also normalize by removing apostrophes to be robust to variations
      const noApostrophes = normalizedHeader.replace(/['’`]/g, '');
      
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
    const hasOrderNumber = headerMap.orderNumber !== undefined && row[headerMap.orderNumber];
    const hasAddress = headerMap.address !== undefined && row[headerMap.address];
    const hasCourier = headerMap.courier !== undefined && row[headerMap.courier];
    const hasPaymentMethod = headerMap.paymentMethod !== undefined && row[headerMap.paymentMethod];

    if (hasOrderNumber && hasAddress) {
      // Це замовлення
      return {
        type: 'order',
        data: this.processOrderRow(row, headerMap, rowNumber)
      };
    } else if (hasCourier && !hasOrderNumber) {
      // Це курєр
      return {
        type: 'courier',
        data: this.processCourierRow(row, headerMap, rowNumber)
      };
    } else if (hasPaymentMethod && !hasOrderNumber) {
      // Це спосіб оплати
      return {
        type: 'payment',
        data: this.processPaymentMethodRow(row, headerMap, rowNumber)
      };
    } else {
      // Якщо немає чітких полів, спробуємо створити замовлення за адресою
      if (hasAddress) {
        return {
          type: 'order',
          data: this.processOrderRow(row, headerMap, rowNumber)
        };
      }
      // Інакше маркуємо як помилку, щоб користувач бачив проблему
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
      throw new Error('Номер замовлення є обовязковим');
    }
    if (!order.address) {
      throw new Error('Адреса є обовязковою');
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
