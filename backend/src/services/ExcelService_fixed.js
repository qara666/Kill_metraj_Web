const XLSX = require('xlsx');
const { GoogleMapsService } = require('./GoogleMapsService');

class ExcelService {
  constructor() {
    this.googleMapsService = new GoogleMapsService();
  }

  async processExcelFile(buffer) {
    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
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
          headerMap: null
        }
      };

      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        
        // Сохраняем информацию о листе для диагностики
        result.debug.sheets.push({
          name: sheetName,
          rows: data.length,
          headers: data[0] || [],
          hasData: data.length > 1
        });
        
        result.debug.totalRows += data.length - 1; // исключаем заголовки
        
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
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
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

  async processSheetData(data, sheetName) {
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
      const headers = data[0] || [];
      const headerMap = this.mapHeaders(headers);
      result.headerMap = headerMap;
      
      const hasAddress = headerMap.address !== undefined;
      const totalRows = data.length - 1;
      
      if (!hasAddress) {
        result.errors.push(`Лист "${sheetName}": Нет колонки с адресами. Найденные заголовки: ${JSON.stringify(headers)}`);
        return result;
      }
      
      if (totalRows === 0) {
        result.errors.push(`Лист "${sheetName}": Нет данных для обработки`);
        return result;
      }
      
      let processedCount = 0;
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        if (!row || row.length === 0) continue;

        try {
          const processedRow = this.processRow(row, headerMap, i + 1);
          
          if (processedRow.type === 'order') {
            result.orders.push(processedRow.data);
            processedCount++;
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
      }

    } catch (error) {
      result.errors.push(`Лист "${sheetName}": ${error.message}`);
    }

    return result;
  }

  createUniqueCouriersAndPayments(result) {
    // Создаем уникальные курьеры из заказов
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

    // Обновляем списки
    result.couriers = Array.from(courierMap.values());
    result.paymentMethods = Array.from(paymentMap.values());
  }

  mapHeaders(headers) {
    const headerMap = {};
    
    headers.forEach((header, index) => {
      if (!header) return;
      
      const normalizedHeader = header.toString().toLowerCase().trim();
      const noApostrophes = normalizedHeader.replace(/[''`]/g, '');
      
      const includesAny = (s, arr) => arr.some(k => s.includes(k));

      if (includesAny(noApostrophes, ['номер', 'номер заказа', 'номер замовлення', 'no', '№', 'number', 'order', 'id'])) {
        if (headerMap.orderNumber === undefined) headerMap.orderNumber = index;
      } else if (includesAny(noApostrophes, ['состояние', 'статус', 'status', 'state', 'статус заказа', 'состояние заказа'])) {
        if (headerMap.status === undefined) headerMap.status = index;
      } else if (includesAny(noApostrophes, ['тип заказа', 'тип замовлення', 'order type', 'типы заказов', 'order types', 'тип'])) {
        if (headerMap.orderType === undefined) headerMap.orderType = index;
      } else if (includesAny(noApostrophes, ['телефон', 'phone', 'моб', 'mobile', 'телефоны', 'phones', 'контакт', 'contact', 'тел'])) {
        if (headerMap.phone === undefined) headerMap.phone = index;
      } else if (includesAny(noApostrophes, ['имя', 'імя', 'name', 'имена', 'names', 'клиент', 'client', 'заказчик', 'customer', 'заказчик имя', 'имя заказчика'])) {
        if (headerMap.customerName === undefined) headerMap.customerName = index;
      } else if (includesAny(noApostrophes, ['всего заказов', 'total orders', 'всего', 'total', 'количество заказов', 'заказов всего'])) {
        if (headerMap.totalOrders === undefined) headerMap.totalOrders = index;
      } else if (includesAny(noApostrophes, ['комментарий к заказчику', 'comment to customer', 'комментарий заказчик', 'заказчик комментарий', 'комментарий клиент'])) {
        if (headerMap.customerComment === undefined) headerMap.customerComment = index;
      } else if (includesAny(noApostrophes, ['адрес', 'адреса', 'address', 'адрес доставки', 'location', 'место', 'місце', 'адреса доставки', 'адреса клиента', 'адрес адрес'])) {
        if (headerMap.address === undefined) headerMap.address = index;
      } else if (includesAny(noApostrophes, ['комментарий к адресу', 'comment to address', 'комментарий адрес', 'адрес комментарий', 'комментарий доставка'])) {
        if (headerMap.addressComment === undefined) headerMap.addressComment = index;
      } else if (includesAny(noApostrophes, ['зона доставки', 'delivery zone', 'зона', 'zone', 'зона доставки', 'доставка зона'])) {
        if (headerMap.deliveryZone === undefined) headerMap.deliveryZone = index;
      } else if (includesAny(noApostrophes, ['время доставки', 'delivery time', 'время', 'time', 'доставка время', 'время доставки'])) {
        if (headerMap.deliveryTime === undefined) headerMap.deliveryTime = index;
      } else if (includesAny(noApostrophes, ['дата создания', 'creation date', 'создания', 'creation', 'дата создания', 'создание дата'])) {
        if (headerMap.creationDate === undefined) headerMap.creationDate = index;
      } else if (includesAny(noApostrophes, ['время на кухню', 'time to kitchen', 'кухню', 'kitchen', 'время кухня', 'кухня время'])) {
        if (headerMap.kitchenTime === undefined) headerMap.kitchenTime = index;
      } else if (includesAny(noApostrophes, ['доставить к', 'deliver by', 'доставить', 'deliver', 'доставка к', 'к доставке'])) {
        if (headerMap.deliverBy === undefined) headerMap.deliverBy = index;
      } else if (includesAny(noApostrophes, ['плановое время', 'planned time', 'плановое', 'planned', 'время плановое', 'планируемое время'])) {
        if (headerMap.plannedTime === undefined) headerMap.plannedTime = index;
      } else if (includesAny(noApostrophes, ['комментарий к заказу', 'comment to order', 'комментарий заказ', 'заказ комментарий', 'комментарий к заказу'])) {
        if (headerMap.orderComment === undefined) headerMap.orderComment = index;
      } else if (includesAny(noApostrophes, ['общее время', 'total time', 'общее', 'total', 'время общее', 'общее время'])) {
        if (headerMap.totalTime === undefined) headerMap.totalTime = index;
      } else if (includesAny(noApostrophes, ['скидка', 'discount', 'скидка %', 'discount %', 'процент скидки', 'скидка процент'])) {
        if (headerMap.discountPercent === undefined) headerMap.discountPercent = index;
      } else if (includesAny(noApostrophes, ['к оплате', 'to pay', 'оплате', 'pay', 'сумма к оплате', 'к оплате сумма', 'сумма заказа', 'сумма', 'amount', 'price', 'стоимость', 'вартість', 'сумма заказа', 'суммы', 'amounts', 'prices'])) {
        if (headerMap.amount === undefined) headerMap.amount = index;
      } else if (includesAny(noApostrophes, ['сдача', 'change', 'сдача сумма', 'change amount', 'сумма сдачи', 'сдача сумма'])) {
        if (headerMap.changeAmount === undefined) headerMap.changeAmount = index;
      } else if (includesAny(noApostrophes, ['способ оплаты', 'payment method', 'оплата', 'payment', 'способ', 'метод оплаты', 'payment method', 'оплаты способ'])) {
        if (headerMap.paymentMethod === undefined) headerMap.paymentMethod = index;
      } else if (includesAny(noApostrophes, ['курьер', 'courier', 'курьеры', 'couriers', 'доставщик', 'курьер имя', 'имя курьера'])) {
        if (headerMap.courier === undefined) headerMap.courier = index;
      }
    });

    return headerMap;
  }

  processRow(row, headerMap, rowNumber) {
    const hasOrderNumber = headerMap.orderNumber !== undefined && row[headerMap.orderNumber] && row[headerMap.orderNumber].toString().trim() !== '';
    const hasAddress = headerMap.address !== undefined && row[headerMap.address] && row[headerMap.address].toString().trim() !== '';
    const hasCourier = headerMap.courier !== undefined && row[headerMap.courier] && row[headerMap.courier].toString().trim() !== '';
    const hasPaymentMethod = headerMap.paymentMethod !== undefined && row[headerMap.paymentMethod] && row[headerMap.paymentMethod].toString().trim() !== '';

    if (hasAddress) {
      return {
        type: 'order',
        data: this.processOrderRow(row, headerMap, rowNumber)
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
      throw new Error('Неможливо визначити тип рядка — перевірте заголовки та дані');
    }
  }

  processOrderRow(row, headerMap, rowNumber) {
    const order = {
      orderNumber: headerMap.orderNumber !== undefined ? row[headerMap.orderNumber] : `ORDER_${rowNumber}`,
      status: headerMap.status !== undefined ? row[headerMap.status] : 'Новый',
      orderType: headerMap.orderType !== undefined ? row[headerMap.orderType] : 'Доставка',
      phone: headerMap.phone !== undefined ? row[headerMap.phone] : '',
      customerName: headerMap.customerName !== undefined ? row[headerMap.customerName] : '',
      totalOrders: headerMap.totalOrders !== undefined ? parseInt(row[headerMap.totalOrders]) || 0 : 0,
      customerComment: headerMap.customerComment !== undefined ? row[headerMap.customerComment] : '',
      address: row[headerMap.address],
      addressComment: headerMap.addressComment !== undefined ? row[headerMap.addressComment] : '',
      deliveryZone: headerMap.deliveryZone !== undefined ? row[headerMap.deliveryZone] : '',
      deliveryTime: headerMap.deliveryTime !== undefined ? row[headerMap.deliveryTime] : '',
      creationDate: headerMap.creationDate !== undefined ? row[headerMap.creationDate] : new Date().toISOString(),
      kitchenTime: headerMap.kitchenTime !== undefined ? row[headerMap.kitchenTime] : '',
      deliverBy: headerMap.deliverBy !== undefined ? row[headerMap.deliverBy] : '',
      plannedTime: headerMap.plannedTime !== undefined ? row[headerMap.plannedTime] : '',
      orderComment: headerMap.orderComment !== undefined ? row[headerMap.orderComment] : '',
      totalTime: headerMap.totalTime !== undefined ? row[headerMap.totalTime] : '',
      discountPercent: headerMap.discountPercent !== undefined ? parseFloat(row[headerMap.discountPercent]) || 0 : 0,
      amount: headerMap.amount !== undefined ? parseFloat(row[headerMap.amount]) || 0 : 0,
      changeAmount: headerMap.changeAmount !== undefined ? parseFloat(row[headerMap.changeAmount]) || 0 : 0,
      paymentMethod: headerMap.paymentMethod !== undefined ? row[headerMap.paymentMethod] : 'Наличные',
      courier: headerMap.courier !== undefined ? row[headerMap.courier] : '',
      coordinates: null,
      geocoded: false
    };

    return order;
  }

  processCourierRow(row, headerMap, rowNumber) {
    return {
      name: row[headerMap.courier],
      phone: headerMap.phone !== undefined ? row[headerMap.phone] : '',
      status: 'Активный',
      currentLocation: null,
      isAvailable: true
    };
  }

  processPaymentMethodRow(row, headerMap, rowNumber) {
    return {
      name: row[headerMap.paymentMethod],
      isActive: true
    };
  }
}

module.exports = ExcelService;
