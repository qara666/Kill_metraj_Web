const axios = require('axios');

async function testBackend() {
    const baseUrl = 'http://localhost:5001/api/fastopertor';

    console.log('--- 1. Testing Validation Error (Missing API Key) ---');
    try {
        await axios.post(`${baseUrl}/fetch`, { apiUrl: 'https://example.com' });
    } catch (error) {
        console.log('Status:', error.response.status);
        console.log('Response:', error.response.data);
    }

    console.log('\n--- 2. Testing Validation Error (Invalid URL) ---');
    try {
        await axios.post(`${baseUrl}/fetch`, { apiUrl: 'not-a-url', apiKey: 'test' });
    } catch (error) {
        console.log('Status:', error.response.status);
        console.log('Response:', error.response.data);
    }

    console.log('\n--- 3. Testing Mock API Request (if server is running) ---');
    try {
        // This will likely fail if no real API is reachable, but we check the error structure
        const res = await axios.post(`${baseUrl}/fetch`, {
            apiUrl: 'https://httpbin.org/json',
            apiKey: 'mock-key',
            useCache: false
        });
        console.log('Success:', res.data.success);
        console.log('Performance:', res.data.performance);
    } catch (error) {
        console.log('Error Name:', error.response?.data?.error);
        console.log('Error Message:', error.response?.data?.message);
    }
}

testBackend();
