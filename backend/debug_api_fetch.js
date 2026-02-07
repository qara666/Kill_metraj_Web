const axios = require('axios');

const API_URL = 'http://app.yaposhka.kh.ua:4999/api/v1/dashboard';
const API_KEY = 'KMFh23298&23201)8172^&21Vs@gfgsd';
const DEPT_ID = '100000052';

async function testFetch() {
    try {
        const targetDate = new Date();
        const dateStr = targetDate.toISOString().split('T')[0];

        console.log(`Fetching for date: ${dateStr}`);
        console.log(`URL: ${API_URL}`);

        const params = {
            top: 2000,
            timeDeliveryBeg: `${dateStr} 00:00:00`, // Incorrect format for this specific API usually?
            // The fetcher uses formatDate(date, '00:00:00') -> "dd.mm.yyyy 00:00:00"
            // Let's match the fetcher's format exactly
            timeDeliveryBeg: formatDate(targetDate, '00:00:00'),
            timeDeliveryEnd: formatDate(targetDate, '23:59:59'),
            departmentId: DEPT_ID
        };

        console.log('Params:', params);

        const response = await axios.get(API_URL, {
            headers: {
                'x-api-key': API_KEY,
                'Accept': 'application/json'
            },
            params: params,
            timeout: 10000
        });

        const data = response.data;
        console.log('Response Status:', response.status);
        console.log('--- DATA SUMMARY ---');
        console.log('Orders count:', data.orders?.length);
        console.log('Couriers count:', data.couriers?.length);

        if (data.orders?.length > 0) {
            // Analyze courier distribution
            const courierCounts = {};
            data.orders.forEach(o => {
                const c = o.courier || 'MISSING';
                courierCounts[c] = (courierCounts[c] || 0) + 1;
            });

            console.log('--- COURIER DISTRIBUTION ---');
            Object.entries(courierCounts).forEach(([courier, count]) => {
                console.log(`${courier}: ${count} orders`);
            });

            // Check if we have any orders with real courier names that match the couriers list
            const courierNames = data.couriers.map(c => c.name);
            console.log('Known Couriers:', courierNames.join(', '));

            const assignedOrders = data.orders.filter(o => o.courier && o.courier !== 'ID:0' && o.courier !== '');
            if (assignedOrders.length > 0) {
                console.log('Sample Assigned Order:', JSON.stringify(assignedOrders[0], null, 2));
            } else {
                console.log('!!! NO ORDERS ASSIGNED TO SPECIFIC COURIERS IN API RESPONSE !!!');
            }
            // Check for courier fields in orders
            const ordersWithCourier = data.orders.filter(o => o.courier && o.courier !== '');
            console.log(`Orders with courier field: ${ordersWithCourier.length} / ${data.orders.length}`);
            if (ordersWithCourier.length > 0) {
                console.log('Sample Order with Courier:', JSON.stringify(ordersWithCourier[0].courier, null, 2));
            }
        }

        if (data.couriers?.length > 0) {
            console.log('Sample Courier:', JSON.stringify(data.couriers[0], null, 2));
        } else {
            console.log('!!! NO COURIERS RECEIVED !!!');
        }

    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Data:', error.response.data);
        }
    }
}

function formatDate(date, timeStr) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year} ${timeStr}`;
}

testFetch();
