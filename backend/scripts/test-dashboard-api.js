#!/usr/bin/env node
/**
 * Test Dashboard API Request
 * 
 * This script simulates the exact request that caused the 500 error
 * to help diagnose the issue with enhanced logging.
 */

const axios = require('axios');
require('dotenv').config();

async function testDashboardRequest() {
    const params = {
        top: 1000,
        dateShift: '27.01.2026',
        timeDeliveryBeg: '27.01.2026 11:00:00',
        timeDeliveryEnd: '27.01.2026 23:00:00',
        departmentId: 100000052
    };

    const apiKey = process.env.EXTERNAL_API_KEY || '';

    if (!apiKey) {
        console.error('❌ EXTERNAL_API_KEY not set in .env');
        process.exit(1);
    }

    console.log('Тестирование запроса к Dashboard API');
    console.log('='.repeat(60));
    console.log('Параметры:', JSON.stringify(params, null, 2));
    console.log('='.repeat(60));

    try {
        const response = await axios.get('http://app.yaposhka.kh.ua:4999/api/v1/dashboard', {
            params,
            headers: {
                'x-api-key': apiKey,
                'Accept': 'application/json'
            },
            timeout: 30000
        });

        console.log('Успех!');
        console.log('Статус:', response.status);
        console.log('Заказов:', response.data.orders?.length || 0);
        console.log('Курьеров:', response.data.couriers?.length || 0);

    } catch (error) {
        console.error('Ошибка запроса');

        if (error.response) {
            console.error('Статус:', error.response.status);
            console.error('Текст статуса:', error.response.statusText);
            console.error('Данные ответа:', JSON.stringify(error.response.data, null, 2));
            console.error('Заголовки ответа:', error.response.headers);
        } else if (error.request) {
            console.error('Ответ не получен');
            console.error('Ошибка:', error.message);
        } else {
            console.error('Ошибка:', error.message);
        }

        process.exit(1);
    }
}

testDashboardRequest();
