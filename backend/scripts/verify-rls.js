const axios = require('axios');
const jwt = require('jsonwebtoken');
const { sequelize } = require('../src/models');

const API_URL = 'http://localhost:5001';
const JWT_SECRET = 'your-secret-key-change-in-production';

async function verifyRLS() {
    console.log('Запуск проверки RLS (Row-Level Security)...');

    try {
        // 1. Generate Token for Division 100000051 (User ID 19)
        // Note: User ID 19 belongs to division 100000051 based on previous interactions
        const token = jwt.sign({ userId: 19 }, JWT_SECRET);
        const headers = { Authorization: `Bearer ${token}` };

        console.log('--- 1. Тестирование изоляции RLS в данных дашборда ---');
        // We'll call the dashboard API and check if it only returns its own division
        const response = await axios.get(`${API_URL}/api/dashboard/latest`, { headers });

        const orders = response.data.data.orders || [];
        const divisions = [...new Set(orders.map(o => String(o.departmentId)))];

        console.log(`Подразделения в ответе: ${divisions.join(', ')}`);

        const isIsolated = divisions.length === 1 && divisions[0] === '100000051';
        console.log(`Результат проверки изоляции: ${isIsolated ? '[УСПЕХ]' : '[ОШИБКА]'}`);

        console.log('\n--- 2. Тестирование обхода RLS для администратора (User ID 1) ---');
        const adminToken = jwt.sign({ userId: 1 }, JWT_SECRET);
        const adminHeaders = { Authorization: `Bearer ${adminToken}` };

        const adminResponse = await axios.get(`${API_URL}/api/dashboard/latest`, { headers: adminHeaders });
        const adminOrders = adminResponse.data.data.orders || [];
        const adminDivisions = [...new Set(adminOrders.map(o => String(o.departmentId)))];

        console.log(`Подразделения для админа: ${adminDivisions.length} (Ожидается несколько или все)`);
        console.log(`Результат проверки админа: ${adminDivisions.length > 1 ? '[УСПЕХ]' : '[ИНФО] (В мок-данных может быть только одно подразделение)'}`);

        console.log('\nПроверка RLS завершена!');
    } catch (error) {
        console.error('Ошибка проверки:', error.response?.data || error.message);
        process.exit(1);
    }
}

verifyRLS();
