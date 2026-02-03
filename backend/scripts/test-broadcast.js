/**
 * Manual Data Injection Test Script
 * 
 * This script inserts a mock dashboard response into the database
 * to trigger the PostgreSQL NOTIFY, which should be picked up by the 
 * backend server and broadcasted via Socket.io to the frontend.
 */

const { Client } = require('pg');
const crypto = require('crypto');
require('dotenv').config();

async function injectTestData() {
    const client = new Client({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'yapiko_auto_km',
        user: process.env.DB_USER || 'msun',
        password: process.env.DB_PASSWORD || '1234'
    });

    try {
        console.log('Подключение к базе данных...');
        await client.connect();
        console.log('Подключено');

        // Create a mock payload
        const mockPayload = {
            orders: [
                {
                    id: 'TEST_ORDER_' + Date.now(),
                    number: 'TEST-123',
                    customerName: 'Test Customer',
                    address: 'Test Address 1, Kharkiv',
                    lat: 50.00,
                    lon: 36.23,
                    plannedTime: Date.now()
                }
            ],
            couriers: [
                {
                    id: 'TEST_COURIER_1',
                    name: 'Test Courier',
                    status: 'online'
                }
            ]
        };

        const payloadJson = JSON.stringify(mockPayload);
        const dataHash = crypto.createHash('md5').update(payloadJson).digest('hex');

        console.log('Вставка тестовых данных...');
        const result = await client.query(
            `INSERT INTO api_dashboard_cache (payload, data_hash, status_code) 
       VALUES ($1, $2, $3) 
       RETURNING id, created_at`,
            [payloadJson, dataHash, 200]
        );

        const inserted = result.rows[0];
        console.log(`Данные успешно вставлены!`);
        console.log(`   ID: ${inserted.id}`);
        console.log(`   Создано в: ${inserted.created_at}`);
        console.log(`\nПроверьте логи бэкенда и консоль фронтенда для подтверждения обновления!`);

    } catch (error) {
        console.error('Ошибка вставки:', error.message);
    } finally {
        await client.end();
    }
}

injectTestData();
