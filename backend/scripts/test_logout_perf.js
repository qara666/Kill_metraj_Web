const axios = require('axios');

async function testLogoutPerformance() {
    const loginUrl = 'http://localhost:5001/api/auth/login';
    const logoutUrl = 'http://localhost:5001/api/auth/logout';
    const credentials = {
        username: 'admin',
        password: 'admin123'
    };

    console.log(`Starting login...`);
    const loginRes = await axios.post(loginUrl, credentials);
    const token = loginRes.data.data.accessToken;
    console.log(`Login success. Starting logout performance test...`);

    for (let i = 0; i < 3; i++) {
        const start = Date.now();
        try {
            await axios.post(logoutUrl, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const duration = Date.now() - start;
            console.log(`Attempt ${i + 1}: Success - Duration: ${duration}ms`);
        } catch (error) {
            const duration = Date.now() - start;
            console.log(`Attempt ${i + 1}: Error - Duration: ${duration}ms - Message: ${error.message}`);
        }
    }
}

testLogoutPerformance();
