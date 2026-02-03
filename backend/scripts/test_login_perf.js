const axios = require('axios');

async function testLoginPerformance() {
    const url = 'http://localhost:5001/api/auth/login';
    const credentials = {
        username: 'admin',
        password: 'admin123'
    };

    console.log(`Starting login performance test to ${url}...`);

    for (let i = 0; i < 3; i++) {
        const start = Date.now();
        try {
            const response = await axios.post(url, credentials);
            const duration = Date.now() - start;
            console.log(`Attempt ${i + 1}: Success - Duration: ${duration}ms`);
        } catch (error) {
            const duration = Date.now() - start;
            console.log(`Attempt ${i + 1}: Error - Duration: ${duration}ms - Message: ${error.message}`);
            if (error.response) console.log(`  Status: ${error.response.status} - Data: ${JSON.stringify(error.response.data)}`);
        }
    }
}

testLoginPerformance();
