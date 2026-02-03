const multer = require('multer');
const ExcelService = require('../services/ExcelService');
const Courier = require('../models/Courier');
const Route = require('../models/Route');
const Order = require('../models/Order');
const PaymentMethod = require('../models/PaymentMethod');
const logger = require('../utils/logger');

class UploadController {
  constructor() {
    this.excelService = ExcelService;
  }

  /**
   * Настройка multer для загрузки файлов
   */
  configureMulter() {
    const storage = multer.memoryStorage();

    const fileFilter = (req, file, cb) => {
      if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.mimetype === 'application/vnd.ms-excel' ||
        file.mimetype === 'text/csv') {
        cb(null, true);
      } else {
        cb(new Error('Разрешены только файлы Excel и CSV'), false);
      }
    };

    return multer({
      storage,
      fileFilter,
      limits: {
        fileSize: 10 * 1024 * 1024 // лимит 10MB
      }
    });
  }

  /**
   * Загрузить и обработать Excel файл
   */
  async uploadExcel(req, res) {
    try {
      logger.info('UploadController: Начало обработки Excel файла');

      if (!req.file) {
        logger.warn('UploadController: Файл не загружен');
        return res.status(400).json({
          success: false,
          error: 'Файл не загружен'
        });
      }

      logger.info(`UploadController: Файл получен - ${req.file.originalname}, размер: ${req.file.size} байт`);

      // Обработка Excel файла
      logger.info('UploadController: Вызываем ExcelService.processExcelFile');

      const result = await this.excelService.processExcelFile(req.file.buffer, req.file.originalname);

      logger.info('UploadController: ExcelService вернул результат:', { success: result.success });

      if (!result.success) {
        return res.status(400).json({
          success: false,
          error: result.error
        });
      }

      // Сохранение данных в базу данных
      const savedData = await this.saveProcessedData(result.data);

      // Генерация отчета
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
        message: `Файл успешно обработан! Заказов: ${savedData.orders.length}, Курьеров: ${savedData.couriers.length}, Способов оплаты: ${savedData.paymentMethods.length}`
      });
    } catch (error) {
      logger.error('Ошибка обработки Excel файла:', error);
      res.status(500).json({
        success: false,
        error: 'Не удалось обработать Excel файл',
        details: error.message
      });
    }
  }

  /**
   * Сохранить обработанные данные в базу данных
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
      // Сохранение курьеров
      for (const courierData of data.couriers) {
        try {
          let courier = await Courier.findOne({ name: courierData.name });
          if (!courier) {
            courier = new Courier(courierData);
            await courier.save();
          }
          results.couriers.push(courier);
        } catch (error) {
          results.errors.push(`Курьер ${courierData.name}: ${error.message}`);
        }
      }

      // Сохранение способов оплаты
      for (const paymentData of data.paymentMethods) {
        try {
          let paymentMethod = await PaymentMethod.findOne({ name: paymentData.name });
          if (!paymentMethod) {
            paymentMethod = new PaymentMethod(paymentData);
            await paymentMethod.save();
          }
          results.paymentMethods.push(paymentMethod);
        } catch (error) {
          results.errors.push(`Способ оплаты ${paymentData.name}: ${error.message}`);
        }
      }

      // Сохранение заказов
      for (const orderData of data.orders) {
        try {
          // Поиск курьера по имени
          let courier = null;
          if (orderData.courier) {
            courier = await Courier.findOne({ name: orderData.courier });
          }

          // Поиск способа оплаты по названию
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
          results.errors.push(`Заказ ${orderData.orderNumber}: ${error.message}`);
        }
      }

      // Создание маршрутов на основе заказов
      const routeData = await this.createRoutesFromOrders(results.orders, results.couriers);
      results.routes = routeData;

    } catch (error) {
      results.errors.push(`Ошибка сохранения данных: ${error.message}`);
    }

    return results;
  }

  /**
   * Создать маршруты на основе заказов
   */
  async createRoutesFromOrders(orders, couriers) {
    const routes = [];

    try {
      // Группировка заказов по курьерам
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

      // Создание маршрута для каждого курьера
      for (const [courierId, courierOrders] of Object.entries(ordersByCourier)) {
        try {
          const courier = couriers.find(c => c._id.toString() === courierId);
          if (!courier) continue;

          const waypoints = [];

          // Создание точек маршрута из заказов
          for (const order of courierOrders) {
            const waypoint = {
              scannedText: order.address,
              formattedAddress: order.address,
              latitude: 50.4501, // Заглушка - в реальном проекте требуется геокодирование
              longitude: 30.5234,
              isWaypoint: true,
              orderNumber: order.orderNumber,
              orderIndex: waypoints.length
            };
            waypoints.push(waypoint);
          }

          if (waypoints.length === 0) continue;

          // Создание стартовой и конечной точек
          const startPoint = {
            scannedText: 'Стартовая точка',
            formattedAddress: 'Киев, Украина',
            latitude: 50.4501,
            longitude: 30.5234,
            isDestination: false,
            isWaypoint: false,
            orderIndex: -1
          };

          const endPoint = {
            scannedText: 'Конечная точка',
            formattedAddress: 'Киев, Украина',
            latitude: 50.4501,
            longitude: 30.5234,
            isDestination: true,
            isWaypoint: false,
            orderIndex: waypoints.length
          };

          // Создание маршрута
          const route = new Route({
            startPoint,
            endPoint,
            waypoints,
            totalDistance: '0 км', // Заглушка
            totalDuration: '0 мин', // Заглушка
            polyline: '',
            transportationMode: 'driving',
            courier: courierId,
            isActive: true,
            priority: 'normal',
            notes: `Маршрут для курьера ${courier.name}. Заказов: ${waypoints.length}`
          });

          await route.save();
          routes.push(route);

          // Обновление статистики курьера
          if (courier.updateStatistics) {
            await courier.updateStatistics();
          }

        } catch (error) {
          logger.error(`Ошибка создания маршрута для курьера ${courierId}:`, error);
        }
      }

    } catch (error) {
      logger.error('Ошибка создания маршрутов:', error);
    }

    return routes;
  }
}

module.exports = { UploadController };


































