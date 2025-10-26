import * as XLSX from 'xlsx';

export interface ExcelOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  address: string;
  phone: string;
  courierName: string;
  paymentMethod: string;
  amount: number;
  status: string;
  deliveryDate: string;
  notes?: string;
}

export interface ExcelCourier {
  id: string;
  name: string;
  phone: string;
  vehicleType: string;
  status: string;
}

export interface ExcelPaymentMethod {
  id: string;
  method: string;
  description: string;
}

export interface ExcelData {
  orders: ExcelOrder[];
  couriers: ExcelCourier[];
  paymentMethods: ExcelPaymentMethod[];
  addresses: string[];
  errors: string[];
  warnings: string[];
  statistics: any;
}

export interface ExcelResult {
  success: boolean;
  data?: ExcelData;
  error?: string;
  summary?: any;
}

class ExcelService {
  private debugLogs: any[] = [];

  addDebugLog(message: string, data: any = null) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      message,
      data: data ? JSON.stringify(data, null, 2) : null
    };
    this.debugLogs.push(logEntry);
    console.log(`[DEBUG] ${message}`, data || '');
  }

  async processExcelFile(file: File): Promise<ExcelResult> {
    this.debugLogs = [];
    this.addDebugLog('Начало обработки Excel файла во frontend');

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { 
        type: 'array',
        cellDates: true,
        cellNF: false,
        cellText: false,
        raw: false
      });

      this.addDebugLog('Excel файл прочитан', { 
        sheetNames: workbook.SheetNames,
        fileSize: file.size 
      });

      // Ищем лист с заказами
      const ordersSheet = this.findOrdersSheet(workbook);
      if (!ordersSheet) {
        throw new Error('Не найден лист с заказами. Ожидаемые названия: "Заказы", "Orders", "Лист1"');
      }

      this.addDebugLog('Найден лист с заказами', { sheetName: ordersSheet.name });

      // Конвертируем в JSON
      const jsonData = XLSX.utils.sheet_to_json(ordersSheet.data, { 
        header: 1,
        defval: '',
        raw: false
      });

      this.addDebugLog('Данные конвертированы в JSON', { 
        totalRows: jsonData.length,
        firstRow: jsonData[0]
      });

      // Обрабатываем данные
      const result = this.processJsonData(jsonData);
      
      this.addDebugLog('Обработка завершена', {
        orders: result.orders.length,
        couriers: result.couriers.length,
        errors: result.errors.length
      });

      return {
        success: true,
        data: result,
        summary: {
          totalRows: jsonData.length,
          successfulGeocoding: result.orders.length,
          failedGeocoding: result.errors.length,
          orders: result.orders.length,
          couriers: result.couriers.length,
          paymentMethods: result.paymentMethods.length,
          errors: result.errors
        }
      };

    } catch (error) {
      this.addDebugLog('Ошибка обработки', { error: (error as Error).message });
      return {
        success: false,
        error: (error as Error).message,
        summary: {
          totalRows: 0,
          successfulGeocoding: 0,
          failedGeocoding: 1,
          orders: 0,
          couriers: 0,
          paymentMethods: 0,
          errors: [(error as Error).message]
        }
      };
    }
  }

  private findOrdersSheet(workbook: XLSX.WorkBook): { name: string; data: XLSX.WorkSheet } | null {
    const possibleNames = ['Заказы', 'Orders', 'Лист1', 'Sheet1', 'Данные', 'Data'];
    
    for (const name of possibleNames) {
      if (workbook.Sheets[name]) {
        return { name, data: workbook.Sheets[name] };
      }
    }

    // Если не найден, берем первый лист
    const firstSheetName = workbook.SheetNames[0];
    if (firstSheetName) {
      return { name: firstSheetName, data: workbook.Sheets[firstSheetName] };
    }

    return null;
  }

  private processJsonData(jsonData: any[]): ExcelData {
    const orders: ExcelOrder[] = [];
    const couriers: ExcelCourier[] = [];
    const paymentMethods: ExcelPaymentMethod[] = [];
    const addresses: string[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];

    if (jsonData.length < 2) {
      errors.push('Файл должен содержать минимум 2 строки (заголовок и данные)');
      return { orders, couriers, paymentMethods, addresses, errors, warnings, statistics: {} };
    }

    // Первая строка - заголовки
    const headers = jsonData[0];
    this.addDebugLog('Заголовки', headers);

    // Определяем индексы колонок
    const columnIndexes = this.findColumnIndexes(headers);
    this.addDebugLog('Индексы колонок', columnIndexes);

    // Обрабатываем данные
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      
      if (!row || row.length === 0) continue;

      try {
        const order = this.createOrderFromRow(row, columnIndexes, i);
        if (order) {
          orders.push(order);
          
          // Добавляем адрес если его нет
          if (order.address && !addresses.includes(order.address)) {
            addresses.push(order.address);
          }

          // Добавляем курьера если его нет
          if (order.courierName) {
            const existingCourier = couriers.find(c => c.name === order.courierName);
            if (!existingCourier) {
              couriers.push({
                id: `courier_${couriers.length + 1}`,
                name: order.courierName,
                phone: '',
                vehicleType: 'car',
                status: 'active'
              });
            }
          }

          // Добавляем способ оплаты если его нет
          if (order.paymentMethod) {
            const existingPayment = paymentMethods.find(p => p.method === order.paymentMethod);
            if (!existingPayment) {
              paymentMethods.push({
                id: `payment_${paymentMethods.length + 1}`,
                method: order.paymentMethod,
                description: order.paymentMethod
              });
            }
          }
        }
      } catch (error) {
        errors.push(`Строка ${i + 1}: ${(error as Error).message}`);
      }
    }

    const statistics = {
      totalOrders: orders.length,
      totalCouriers: couriers.length,
      totalPaymentMethods: paymentMethods.length,
      totalAddresses: addresses.length,
      errorsCount: errors.length,
      warningsCount: warnings.length
    };

    return { orders, couriers, paymentMethods, addresses, errors, warnings, statistics };
  }

  private findColumnIndexes(headers: any[]): any {
    const indexes: any = {};
    
    for (let i = 0; i < headers.length; i++) {
      const header = String(headers[i]).toLowerCase().trim();
      
      if (header.includes('номер') || header.includes('number') || header.includes('id')) {
        indexes.orderNumber = i;
      } else if (header.includes('клиент') || header.includes('customer') || header.includes('имя')) {
        indexes.customerName = i;
      } else if (header.includes('адрес') || header.includes('address')) {
        indexes.address = i;
      } else if (header.includes('телефон') || header.includes('phone')) {
        indexes.phone = i;
      } else if (header.includes('курьер') || header.includes('courier')) {
        indexes.courierName = i;
      } else if (header.includes('оплата') || header.includes('payment')) {
        indexes.paymentMethod = i;
      } else if (header.includes('сумма') || header.includes('amount') || header.includes('цена')) {
        indexes.amount = i;
      } else if (header.includes('статус') || header.includes('status')) {
        indexes.status = i;
      } else if (header.includes('дата') || header.includes('date')) {
        indexes.deliveryDate = i;
      } else if (header.includes('примечание') || header.includes('notes') || header.includes('комментарий')) {
        indexes.notes = i;
      }
    }

    return indexes;
  }

  private createOrderFromRow(row: any[], indexes: any, rowNumber: number): ExcelOrder | null {
    const orderNumber = indexes.orderNumber !== undefined ? row[indexes.orderNumber] : `ORDER_${rowNumber}`;
    const customerName = indexes.customerName !== undefined ? row[indexes.customerName] : 'Неизвестный клиент';
    const address = indexes.address !== undefined ? row[indexes.address] : '';
    const phone = indexes.phone !== undefined ? row[indexes.phone] : '';
    const courierName = indexes.courierName !== undefined ? row[indexes.courierName] : 'Не назначен';
    const paymentMethod = indexes.paymentMethod !== undefined ? row[indexes.paymentMethod] : 'Наличные';
    const amount = indexes.amount !== undefined ? parseFloat(row[indexes.amount]) : 0;
    const status = indexes.status !== undefined ? row[indexes.status] : 'Новый';
    const deliveryDate = indexes.deliveryDate !== undefined ? row[indexes.deliveryDate] : new Date().toISOString();
    const notes = indexes.notes !== undefined ? row[indexes.notes] : '';

    if (!address || address.trim() === '') {
      throw new Error('Адрес не указан');
    }

    return {
      id: `order_${rowNumber}`,
      orderNumber: String(orderNumber),
      customerName: String(customerName),
      address: String(address),
      phone: String(phone),
      courierName: String(courierName),
      paymentMethod: String(paymentMethod),
      amount: amount,
      status: String(status),
      deliveryDate: String(deliveryDate),
      notes: String(notes)
    };
  }
}

export default ExcelService;
