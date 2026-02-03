const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');
const logger = require('../utils/logger');

// CQRS Imports
const GetDashboardDataQuery = require('../queries/GetDashboardDataQuery');
const ListCouriersQuery = require('../queries/ListCouriersQuery');
const GetCourierQuery = require('../queries/GetCourierQuery');
const CreateCourierCommand = require('../commands/CreateCourierCommand');

const PROTO_PATH = path.resolve(__dirname, '../../proto/service.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition).kill_metraj;

/**
 * Обработчики сервиса Dashboard
 */
const dashboardHandlers = {
  GetLatestData: async (call, callback) => {
    try {
      const { division_id } = call.request;
      // Примечание: контекст RLS обычно устанавливается через middleware в HTTP.
      // Для gRPC мы передаем явные параметры для простоты.
      const result = await GetDashboardDataQuery.execute({
        divisionId: division_id || 'all',
        user: { role: 'admin' } // Внутренние вызовы предполагают высокие привилегии
      });

      callback(null, {
        success: true,
        payload_json: JSON.stringify(result.payload),
        created_at: result.created_at
      });
    } catch (error) {
      logger.error('Ошибка gRPC GetLatestData:', error);
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  }
};

/**
 * Обработчики сервиса Courier
 */
const courierHandlers = {
  ListCouriers: async (call, callback) => {
    try {
      const { division_id } = call.request;
      const couriers = await ListCouriersQuery.execute({
        divisionId: division_id === 'all' ? null : division_id
      });

      callback(null, {
        success: true,
        couriers: couriers.map(c => ({
          id: String(c.id),
          username: c.username,
          role: c.role,
          division_id: String(c.divisionId),
          is_active: c.isActive
        }))
      });
    } catch (error) {
      logger.error('Ошибка gRPC ListCouriers:', error);
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  },

  GetCourier: async (call, callback) => {
    try {
      const courier = await GetCourierQuery.execute(call.request.id);
      callback(null, {
        success: true,
        courier: {
          id: String(courier.id),
          username: courier.username,
          role: courier.role,
          division_id: String(courier.divisionId),
          is_active: courier.isActive
        }
      });
    } catch (error) {
      callback(null, { success: false, error: error.message });
    }
  },

  CreateCourier: async (call, callback) => {
    try {
      const courier = await CreateCourierCommand.execute(call.request, { user: { role: 'admin' } });
      callback(null, {
        success: true,
        courier: {
          id: String(courier.id),
          username: courier.username,
          role: courier.role,
          division_id: String(courier.divisionId),
          is_active: courier.isActive
        }
      });
    } catch (error) {
      callback(null, { success: false, error: error.message });
    }
  }
};

function startGrpcServer(port = '50051') {
  const server = new grpc.Server();

  server.addService(protoDescriptor.DashboardService.service, dashboardHandlers);
  server.addService(protoDescriptor.CourierService.service, courierHandlers);

  try {
    server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err, boundPort) => {
      if (err) {
        logger.error('Не удалось привязать gRPC сервер:', err);
        return;
      }
      logger.info(`gRPC сервер запущен на порту ${boundPort}`);
    });
  } catch (err) {
    logger.error('Ошибка при запуске gRPC сервера:', err);
  }

  return server;
}

module.exports = { startGrpcServer };
