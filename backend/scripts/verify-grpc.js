const grpc = require('@grpc/grpc-js');
const protoLoader = require('@grpc/proto-loader');
const path = require('path');

const PROTO_PATH = path.resolve(__dirname, '../proto/service.proto');

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true
});

const protoDescriptor = grpc.loadPackageDefinition(packageDefinition).kill_metraj;

const client = new protoDescriptor.CourierService(
    'localhost:50051',
    grpc.credentials.createInsecure()
);

const dashboardClient = new protoDescriptor.DashboardService(
    'localhost:50051',
    grpc.credentials.createInsecure()
);

async function verifyGrpc() {
    console.log('Запуск проверки gRPC...');

    try {
        // 1. Test ListCouriers
        console.log('--- 1. Тестирование CourierService.ListCouriers ---');
        client.ListCouriers({ division_id: 'all' }, (err, response) => {
            if (err) {
                console.error('Ошибка ListCouriers:', err.message);
            } else {
                console.log('Успех ListCouriers:', response.success);
                console.log('Количество:', response.couriers.length);
                if (response.couriers.length > 0) {
                    console.log('Первый курьер:', response.couriers[0].username);
                }
            }

            // 2. Test GetDashboardData
            console.log('\n--- 2. Тестирование DashboardService.GetLatestData ---');
            dashboardClient.GetLatestData({ division_id: 'all' }, (err, response) => {
                if (err) {
                    console.error('Ошибка GetLatestData:', err.message);
                } else {
                    console.log('Успех GetLatestData:', response.success);
                    const payload = JSON.parse(response.payload_json);
                    console.log('Количество заказов:', payload.orders ? payload.orders.length : 0);
                    console.log('Создано в:', response.created_at);
                }

                console.log('\nПроверка gRPC завершена!');
                process.exit(0);
            });
        });
    } catch (error) {
        console.error('Ошибка в скрипте проверки:', error.message);
        process.exit(1);
    }
}

// Wait a bit for server to start if run manually
setTimeout(verifyGrpc, 2000);
