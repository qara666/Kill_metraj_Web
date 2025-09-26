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
        warnings: []
      };

      for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        const data = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        
        const sheetResult = await this.processSheetData(data, sheetName);
        
        result.orders.push(...sheetResult.orders);
        result.couriers.push(...sheetResult.couriers);
        result.paymentMethods.push(...sheetResult.paymentMethods);
        result.routes.push(...sheetResult.routes);
        result.errors.push(...sheetResult.errors);
        result.warnings.push(...sheetResult.warnings);
      }

      return {
        success: true,
        data: result
      };

    } catch (error) {
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

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
      const headers = data[0] || [];
      const headerMap = this.mapHeaders(headers);
      
      // Диагностика
      const hasAddress = headerMap.address !== undefined;
      const totalRows = data.length - 1;
      
      if (!hasAddress) {
        result.errors.push(`Лист "${sheetName}": Нет колонки с адресами. Ожидаемые названия: "Адрес", "Адреса", "Address", "Location"`);
        return result;
      }
      
      if (totalRows === 0) {
        result.errors.push(`Лист "${sheetName}": Нет данных для обработки`);
        return result;
      }
      
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

      // Дополнительная диагностика
      if (result.orders.length === 0 && totalRows > 0) {
        result.warnings.push(`Лист "${sheetName}": Заказы не созданы. Проверьте, что в колонке адресов есть данные`);
      }

    } catch (error) {
      result.errors.push(`Лист "${sheetName}": ${error.message}`);
    }

    return result;
  }

  mapHeaders(headers) {
    const headerMap = {};
    
    headers.forEach((header, index) => {
      if (!header) return;
      
      const normalizedHeader = header.toString().toLowerCase().trim();
      const noApostrophes = normalizedHeader.replace(/[''`]/g, '');
      
      const includesAny = (s, arr) => arr.some(k => s.includes(k));

      // Номер заказа
      if (includesAny(noApostrophes, ['номер', 'номер заказа', 'номер замовлення', 'no', '№', 'number', 'order', 'id'])) {
        if (headerMap.orderNumber === undefined) headerMap.orderNumber = index;
      } 
      // Состояние/Статус
      else if (includesAny(noApostrophes, ['состояние', 'статус', 'status', 'state', 'статус заказа', 'состояние заказа'])) {
        if (headerMap.status === undefined) headerMap.status = index;
      }
      // Тип заказа
      else if (includesAny(noApostrophes, ['тип заказа', 'тип замовлення', 'order type', 'типы заказов', 'order types', 'тип'])) {
        if (headerMap.orderType === undefined) headerMap.orderType = index;
      }
      // Телефон
      else if (includesAny(noApostrophes, ['телефон', 'phone', 'моб', 'mobile', 'телефоны', 'phones', 'контакт', 'contact', 'тел'])) {
        if (headerMap.phone === undefined) headerMap.phone = index;
      }
      // Имя заказчика
      else if (includesAny(noApostrophes, ['имя', 'імя', 'name', 'имена', 'names', 'клиент', 'client', 'заказчик', 'customer', 'заказчик имя', 'имя заказчика'])) {
        if (headerMap.customerName === undefined) headerMap.customerName = index;
      }
      // Всего заказов
      else if (includesAny(noApostrophes, ['всего заказов', 'total orders', 'всего', 'total', 'количество заказов', 'заказов всего'])) {
        if (headerMap.totalOrders === undefined) headerMap.totalOrders = index;
      }
      // Комментарий к заказчику
      else if (includesAny(noApostrophes, ['комментарий к заказчику', 'comment to customer', 'комментарий заказчик', 'заказчик комментарий', 'комментарий клиент'])) {
        if (headerMap.customerComment === undefined) headerMap.customerComment = index;
      }
      // Адрес
      else if (includesAny(noApostrophes, ['адрес', 'адреса', 'address', 'адрес доставки', 'location', 'место', 'місце', 'адреса доставки', 'адреса клиента', 'адрес адрес'])) {
        if (headerMap.address === undefined) headerMap.address = index;
      }
      // Комментарий к адресу
      else if (includesAny(noApostrophes, ['комментарий к адресу', 'comment to address', 'комментарий адрес', 'адрес комментарий', 'комментарий доставка'])) {
        if (headerMap.addressComment === undefined) headerMap.addressComment = index;
      }
      // Зона доставки
      else if (includesAny(noApostrophes, ['зона доставки', 'delivery zone', 'зона', 'zone', 'зона доставки', 'доставка зона'])) {
        if (headerMap.deliveryZone === undefined) headerMap.deliveryZone = index;
      }
      // Время доставки
      else if (includesAny(noApostrophes, ['время доставки', 'delivery time', 'время', 'time', 'доставка время', 'время доставки'])) {
        if (headerMap.deliveryTime === undefined) headerMap.deliveryTime = index;
      }
      // Дата создания
      else if (includesAny(noApostrophes, ['дата создания', 'creation date', 'создания', 'creation', 'дата создания', 'создание дата'])) {
        if (headerMap.creationDate === undefined) headerMap.creationDate = index;
      }
      // Время на кухню
      else if (includesAny(noApostrophes, ['время на кухню', 'time to kitchen', 'кухню', 'kitchen', 'время кухня', 'кухня время'])) {
        if (headerMap.kitchenTime === undefined) headerMap.kitchenTime = index;
      }
      // Доставить к
      else if (includesAny(noApostrophes, ['доставить к', 'deliver by', 'доставить', 'deliver', 'доставка к', 'к доставке'])) {
        if (headerMap.deliverBy === undefined) headerMap.deliverBy = index;
      }
      // Плановое время
      else if (includesAny(noApostrophes, ['плановое время', 'planned time', 'плановое', 'planned', 'время плановое', 'планируемое время'])) {
        if (headerMap.plannedTime === undefined) headerMap.plannedTime = index;
      }
      // Комментарий к заказу
      else if (includesAny(noApostrophes, ['комментарий к заказу', 'comment to order', 'комментарий заказ', 'заказ комментарий', 'комментарий к заказу'])) {
        if (headerMap.orderComment === undefined) headerMap.orderComment = index;
      }
      // Общее время
      else if (includesAny(noApostrophes, ['общее время', 'total time', 'общее', 'total', 'время общее', 'общее время'])) {
        if (headerMap.totalTime === undefined) headerMap.totalTime = index;
      }
      // Скидка %
      else if (includesAny(noApostrophes, ['скидка', 'discount', 'скидка %', 'discount %', 'процент скидки', 'скидка процент'])) {
        if (headerMap.discountPercent === undefined) headerMap.discountPercent = index;
      }
      // К оплате
      else if (includesAny(noApostrophes, ['к оплате', 'to pay', 'оплате', 'pay', 'сумма к оплате', 'к оплате сумма', 'сумма заказа', 'сумма', 'amount', 'price', 'стоимость', 'вартість', 'сумма заказа', 'суммы', 'amounts', 'prices'])) {
        if (headerMap.amount === undefined) headerMap.amount = index;
      }
      // Сдача
      else if (includesAny(noApostrophes, ['сдача', 'change', 'сдача сумма', 'change amount', 'сумма сдачи', 'сдача сумма'])) {
        if (headerMap.changeAmount === undefined) headerMap.changeAmount = index;
      }
      // Способ оплаты
      else if (includesAny(noApostrophes, ['способ оплаты', 'payment method', 'оплата', 'payment', 'способ', 'метод оплаты', 'payment method', 'оплаты способ'])) {
        if (headerMap.paymentMethod === undefined) headerMap.paymentMethod = index;
      }
      // Курьер
      else if (includesAny(noApostrophes, ['курьер', 'courier', 'курьеры', 'couriers', 'доставщик', 'курьер имя', 'имя курьера'])) {
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
