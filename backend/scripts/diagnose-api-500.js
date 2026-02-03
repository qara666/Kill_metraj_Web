const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });


const API_URL = 'http://app.yaposhka.kh.ua:4999/api/v1/dashboard';
const API_KEY = process.env.EXTERNAL_API_KEY;

async function testParams(params, label) {
    console.log(`\n--- Тестирование: ${label} ---`);
    console.log('Параметры:', JSON.stringify(params, null, 2));

    try {
        const response = await axios.get(API_URL, {
            params: params,
            headers: {
                'x-api-key': API_KEY,
                'Accept': 'application/json'
            },
            timeout: 10000
        });
        console.log(`УСПЕХ! Статус: ${response.status}`);
        console.log(`Заказов: ${response.data.orders?.length || 0}, Курьеров: ${response.data.couriers?.length || 0}`);
    } catch (error) {
        console.log(`ОШИБКА! Статус: ${error.response?.status || 'Нет статуса'}`);
        console.log(`Данные: ${JSON.stringify(error.response?.data || error.message, null, 2)}`);
    }
}

async function runTests() {
    if (!API_KEY) {
        console.error('API KEY отсутствует в .env');
        return;
    }

    const todayStr = '27.01.2026';
    const realDeptId = 100000052;

    // Test 1: DateShift + real departmentId
    await testParams({
        top: 10,
        dateShift: todayStr,
        departmentId: realDeptId
    }, 'DateShift + Real DepartmentID');

    // Test 2: dateShift + timeDelivery range + real departmentId
    await testParams({
        top: 10,
        dateShift: todayStr,
        timeDeliveryBeg: `${todayStr} 00:00:00`,
        timeDeliveryEnd: `${todayStr} 23:59:59`,
        departmentId: realDeptId
    }, 'DateShift + TimeDelivery + Real DeptID');

    // Test 3: Only TimeDelivery + real departmentId (User's request)
    await testParams({
        top: 10,
        timeDeliveryBeg: `${todayStr} 00:00:00`,
        timeDeliveryEnd: `${todayStr} 23:59:59`,
        departmentId: realDeptId
    }, 'Only TimeDelivery + Real DeptID');
}



runTests();
