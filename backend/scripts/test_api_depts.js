const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function testApi() {
    const apiKey = process.env.EXTERNAL_API_KEY;
    const apiUrl = process.env.EXTERNAL_API_URL || 'http://app.yaposhka.kh.ua:4999/api/v1/dashboard';

    const depts = [1, 100000051, 100000052, null];

    console.log(`Testing API: ${apiUrl}`);

    for (const dept of depts) {
        console.log(`\nTesting Dept ID: ${dept || 'ALL'}`);
        const params = {
            top: 10,
            timeDeliveryBeg: '03.02.2026 00:00:00',
            timeDeliveryEnd: '03.02.2026 23:59:59'
        };
        if (dept) params.departmentId = dept;

        try {
            const response = await axios.get(apiUrl, {
                headers: { 'x-api-key': apiKey },
                params: params,
                timeout: 5000
            });
            console.log(`  Status: ${response.status}`);
            console.log(`  Orders: ${response.data.orders?.length || 0}`);
            console.log(`  Couriers: ${response.data.couriers?.length || 0}`);
            if (response.data.orders?.length > 0) {
                console.log(`  Sample Order Dept: ${response.data.orders[0].departmentId}`);
            }
        } catch (error) {
            console.error(`  Error: ${error.message}`);
            if (error.response) console.error(`    Data: ${JSON.stringify(error.response.data)}`);
        }
    }
}

testApi();
