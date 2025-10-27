const multer = require('multer');
const ExcelService = require('../services/ExcelService');
const Courier = require('../models/Courier');
const Route = require('../models/Route');
const Order = require('../models/Order');
const PaymentMethod = require('../models/PaymentMethod');

class UploadController {
  constructor() {
    this.excelService = ExcelService;
  }

  /**
   * Configure multer for file uploads
   */
  configureMulter() {
    const storage = multer.memoryStorage();
    
    const fileFilter = (req, file, cb) => {
      if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
          file.mimetype === 'application/vnd.ms-excel' ||
          file.mimetype === 'text/csv') {
        cb(null, true);
      } else {
        cb(new Error('Дозволені тільки Excel та CSV файли'), false);
      }
    };

    return multer({
      storage,
      fileFilter,
      limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
      }
    });
  }

  /**
   * Завантажити та обробити Excel файл
   */
  async uploadExcel(req, res) {
    try {
      console.log('🚀 UploadController: Начало обработки Excel файла');
      
      if (global.addDebugLog) {
        global.addDebugLog('🚀 UploadController: Начало обработки Excel файла');
      }
      
      if (!req.file) {
        console.log('❌ UploadController: Файл не загружен');
        if (global.addDebugLog) {
          global.addDebugLog('❌ UploadController: Файл не загружен');
        }
        return res.status(400).json({
          success: false,
          error: 'Файл не завантажено'
        });
      }

      console.log(`📁 UploadController: Файл получен - ${req.file.originalname}, размер: ${req.file.size} байт`);
      if (global.addDebugLog) {
        global.addDebugLog(`📁 UploadController: Файл получен - ${req.file.originalname}, размер: ${req.file.size} байт`);
      }

      // Обробляємо Excel файл
      console.log('🔄 UploadController: Вызываем ExcelService.processExcelFile');
      if (global.addDebugLog) {
        global.addDebugLog('🔄 UploadController: Вызываем ExcelService.processExcelFile');
      }
      
      const result = await this.excelService.processExcelFile(req.file.buffer, req.file.originalname);
      
      console.log('✅ UploadController: ExcelService вернул результат:', result.success);
      if (global.addDebugLog) {
        global.addDebugLog('✅ UploadController: ExcelService вернул результат', { success: result.success, error: result.error });
      }

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error
        });
      }

      // Зберігаємо дані в базу даних
      const savedData = await this.saveProcessedData(result.data);

      // Генеруємо звіт
      const report = this.excelService.generateReport({
        success: true,
        data: savedData,
        summary: result.summary
      });

      res.json({
        success: true,
        data: savedData,
        summary: {
          totalOrders: savedData.orders.length,
          totalCouriers: savedData.couriers.length,
          totalPaymentMethods: savedData.paymentMethods.length,
          totalRoutes: savedData.routes.length,
          errors: savedData.errors.length,
          warnings: savedData.warnings ? savedData.warnings.length : 0
        },
        report: report,
        message: `Файл успішно оброблено! Замовлень: ${savedData.orders.length}, Курєрів: ${savedData.couriers.length}, Спосібів оплати: ${savedData.paymentMethods.length}`
      });
    } catch (error) {
      console.error('Помилка обробки Excel файлу:', error);
      res.status(500).json({
        success: false,
        error: 'Не вдалося обробити Excel файл',
        details: error.message
      });
    }
  }

  /**
   * Зберегти оброблені дані в базу даних
   */
  async saveProcessedData(data) {
    const results = {
      orders: [],
      couriers: [],
      paymentMethods: [],
      routes: [],
      errors: []
    };

    try {
      // Зберігаємо курєрів
      for (const courierData of data.couriers) {
        try {
          let courier = await Courier.findOne({ name: courierData.name });
          if (!courier) {
            courier = new Courier(courierData);
            await courier.save();
          }
          results.couriers.push(courier);
        } catch (error) {
          results.errors.push(`Кур'єр ${courierData.name}: ${error.message}`);
        }
      }

      // Зберігаємо способи оплати
      for (const paymentData of data.paymentMethods) {
        try {
          let paymentMethod = await PaymentMethod.findOne({ name: paymentData.name });
          if (!paymentMethod) {
            paymentMethod = new PaymentMethod(paymentData);
            await paymentMethod.save();
          }
          results.paymentMethods.push(paymentMethod);
        } catch (error) {
          results.errors.push(`Спосіб оплати ${paymentData.name}: ${error.message}`);
        }
      }

      // Зберігаємо замовлення
      for (const orderData of data.orders) {
        try {
          // Знаходимо курєра за імям
          let courier = null;
          if (orderData.courier) {
            courier = await Courier.findOne({ name: orderData.courier });
          }

          // Знаходимо спосіб оплати за назвою
          let paymentMethod = null;
          if (orderData.paymentMethod) {
            paymentMethod = await PaymentMethod.findOne({ name: orderData.paymentMethod });
          }

          const order = new Order({
            ...orderData,
            courier: courier ? courier._id : null,
            paymentMethod: paymentMethod ? paymentMethod._id : null
          });

          await order.save();
          results.orders.push(order);
        } catch (error) {
          results.errors.push(`Замовлення ${orderData.orderNumber}: ${error.message}`);
        }
      }

      // Створюємо маршрути на основі замовлень
      const routeData = await this.createRoutesFromOrders(results.orders, results.couriers);
      results.routes = routeData;

    } catch (error) {
      results.errors.push(`Помилка збереження даних: ${error.message}`);
    }

    return results;
  }

  /**
   * Створити маршрути на основі замовлень
   */
  async createRoutesFromOrders(orders, couriers) {
    const routes = [];
    
    try {
      // Групуємо замовлення за курєрами
      const ordersByCourier = {};
      
      for (const order of orders) {
        if (order.courier) {
          const courierId = order.courier.toString();
          if (!ordersByCourier[courierId]) {
            ordersByCourier[courierId] = [];
          }
          ordersByCourier[courierId].push(order);
        }
      }

      // Створюємо маршрут для кожного курєра
      for (const [courierId, courierOrders] of Object.entries(ordersByCourier)) {
        try {
          const courier = couriers.find(c => c._id.toString() === courierId);
          if (!courier) continue;

          const waypoints = [];
          
          // Створюємо waypoints з замовлень
          for (const order of courierOrders) {
            const waypoint = {
              scannedText: order.address,
              formattedAddress: order.address,
              latitude: 50.4501, // Заглушка - в реальному проекті потрібно геокодування
              longitude: 30.5234,
              isWaypoint: true,
              orderNumber: order.orderNumber,
              orderIndex: waypoints.length
            };
            waypoints.push(waypoint);
          }

          if (waypoints.length === 0) continue;

          // Створюємо стартову та кінцеву точки
          const startPoint = {
            scannedText: 'Стартова точка',
            formattedAddress: 'Київ, Україна',
            latitude: 50.4501,
            longitude: 30.5234,
            isDestination: false,
            isWaypoint: false,
            orderIndex: -1
          };

          const endPoint = {
            scannedText: 'Кінцева точка',
            formattedAddress: 'Київ, Україна',
            latitude: 50.4501,
            longitude: 30.5234,
            isDestination: true,
            isWaypoint: false,
            orderIndex: waypoints.length
          };

          // Створюємо маршрут
          const route = new Route({
            startPoint,
            endPoint,
            waypoints,
            totalDistance: '0 км', // Заглушка
            totalDuration: '0 хв', // Заглушка
            polyline: '',
            transportationMode: 'driving',
            courier: courierId,
            isActive: true,
            priority: 'normal',
            notes: `Маршрут для курєра ${courier.name}. Замовлень: ${waypoints.length}`
          });

          await route.save();
          routes.push(route);

          // Оновлюємо статистику курєра
          if (courier.updateStatistics) {
            await courier.updateStatistics();
          }

        } catch (error) {
          console.error(`Помилка створення маршруту для курєра ${courierId}:`, error);
        }
      }

    } catch (error) {
      console.error('Помилка створення маршрутів:', error);
    }

    return routes;
  }
}

module.exports = { UploadController };












