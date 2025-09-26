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

  mapHeaders(headers) {
    const headerMap = {};
    
    headers.forEach((header, index) => {
      if (!header) return;
      
      const normalizedHeader = header.toString().toLowerCase().trim();
      const noApostrophes = normalizedHeader.replace(/[''`]/g, '');
      
      const includesAny = (s, arr) => arr.some(k => s.includes(k));

      if (includesAny(noApostrophes, ['номер', 'номер заказа', 'номер замовлення', 'no', '№', 'number', 'order', 'id'])) {
        if (headerMap.orderNumber === undefined) headerMap.orderNumber = index;
      } else if (includesAny(noApostrophes, ['адреса', 'адрес', 'address', 'адрес доставки', 'location', 'место', 'місце', 'адреса доставки', 'адреса клиента'])) {
        if (headerMap.address === undefined) headerMap.address = index;
      } else if (includesAny(noApostrophes, ['телефон', 'phone', 'моб', 'mobile', 'телефоны', 'phones', 'контакт', 'contact'])) {
        if (headerMap.phone === undefined) headerMap.phone = index;
      } else if (includesAny(noApostrophes, ['курєр', 'курер', 'курьер', 'courier', 'доставщик', 'курьеры', 'couriers'])) {
        if (headerMap.courier === undefined) headerMap.courier = index;
      } else if (includesAny(noApostrophes, ['оплата', 'способ оплаты', 'payment', 'оплат', 'сплата', 'способ', 'метод оплаты', 'payment method'])) {
        if (headerMap.paymentMethod === undefined) headerMap.paymentMethod = index;
      } else if (includesAny(noApostrophes, ['сума', 'сумма', 'amount', 'price', 'стоимость', 'вартість', 'сумма заказа', 'к оплате', 'суммы', 'amounts', 'prices'])) {
        if (headerMap.amount === undefined) headerMap.amount = index;
      } else if (includesAny(noApostrophes, ['тип заказа', 'тип замовлення', 'order type', 'типы заказов', 'order types'])) {
        if (headerMap.orderType === undefined) headerMap.orderType = index;
      } else if (includesAny(noApostrophes, ['имя', 'імя', 'name', 'имена', 'names', 'клиент', 'client', 'заказчик', 'customer'])) {
        if (headerMap.customerName === undefined) headerMap.customerName = index;
      } else if (includesAny(noApostrophes, ['примітка', 'примечание', 'note', 'comment', 'комментарий', 'заметка'])) {
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
      address: row[headerMap.address],
      phone: headerMap.phone !== undefined ? row[headerMap.phone] : '',
      customerName: headerMap.customerName !== undefined ? row[headerMap.customerName] : '',
      orderType: headerMap.orderType !== undefined ? row[headerMap.orderType] : 'Доставка',
      paymentMethod: headerMap.paymentMethod !== undefined ? row[headerMap.paymentMethod] : 'Наличные',
      courier: headerMap.courier !== undefined ? row[headerMap.courier] : '',
      amount: headerMap.amount !== undefined ? parseFloat(row[headerMap.amount]) || 0 : 0,
      note: headerMap.note !== undefined ? row[headerMap.note] : '',
      priority: headerMap.priority !== undefined ? row[headerMap.priority] : 'Обычный',
      status: headerMap.status !== undefined ? row[headerMap.status] : 'Новый',
      date: headerMap.date !== undefined ? row[headerMap.date] : new Date().toISOString(),
      time: headerMap.time !== undefined ? row[headerMap.time] : '',
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
