const { io } = require('socket.io-client');
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjE4LCJ1c2VybmFtZSI6InVzZXI1MSIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzY5NzkzNzk3LCJleHAiOjE3Njk4NTEzOTd9.26UgxrsLLrtnVS2THIv21JkpRt2T46koFSSNhoVvJOg';
const socket = io('http://localhost:5001', {
    auth: { token }
});

socket.on('connect', () => {
    console.log('Подключено к WebSocket как user51');
});

socket.on('dashboard:update', (data) => {
    console.log('Получено обновление дашборда');
    const orders = data.data.orders || [];
    console.log(`Всего получено заказов: ${orders.length}`);

    const otherDepts = orders.filter(o => String(o.departmentId) !== '100000051');
    if (otherDepts.length === 0 && orders.length > 0) {
        console.log('[УСПЕХ] Все заказы относятся к подразделению 100000051');
    } else if (orders.length > 0) {
        console.log('[ОШИБКА] Получены заказы других подразделений:', otherDepts.map(o => o.departmentId));
    } else {
        console.log('[!] Заказы не получены');
    }

    process.exit(0);
});

socket.on('connect_error', (err) => {
    console.error('Ошибка подключения:', err.message);
    process.exit(1);
});

// Timeout after 10 seconds
setTimeout(() => {
    console.log('Ошибка: Время ожидания истекло');
    process.exit(1);
}, 10000);
