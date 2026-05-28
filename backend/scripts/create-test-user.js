const { User } = require('../src/models');
const { generateAccessToken } = require('../src/middleware/auth');

async function createTestUsers() {
    try {
        // Найти или создать пользователя с divisionId 100000051
        const [user51] = await User.findOrCreate({
            where: { username: 'user51' },
            defaults: {
                passwordHash: 'password123',
                role: 'user',
                isActive: true,
                divisionId: '100000051'
            }
        });

        // Убедиться, что divisionId корректен, если пользователь уже существовал
        user51.divisionId = '100000051';
        await user51.save();

        const token = generateAccessToken(user51);
        console.log('Тестовый пользователь user51 создан/обновлен');
        console.log('Токен для user51:', token);
        console.log('ID подразделения:', user51.divisionId);

    } catch (err) {
        console.error('Ошибка:', err);
    } finally {
        process.exit();
    }
}

createTestUsers();
