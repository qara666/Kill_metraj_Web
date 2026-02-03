const { User } = require('../src/models');
const { generateAccessToken } = require('../src/middleware/auth');

async function setupTestScenario() {
    try {
        console.log('--- Setting up Test Scenario ---');

        // 1. Ensure users exist with specific divisionIds
        // User test1 -> Division 100000051
        const [test1] = await User.findOrCreate({
            where: { username: 'test1' },
            defaults: {
                passwordHash: 'password123',
                role: 'user',
                isActive: true,
                divisionId: '100000051'
            }
        });
        test1.divisionId = '100000051';
        await test1.save();

        // User 1234 -> Division 100000052
        const [user1234] = await User.findOrCreate({
            where: { username: '1234' },
            defaults: {
                passwordHash: 'password123',
                role: 'user',
                isActive: true,
                divisionId: '100000052'
            }
        });
        user1234.divisionId = '100000052';
        await user1234.save();

        console.log('Пользователи настроены:');
        console.log(`   - test1: Подразделение ${test1.divisionId}, Токен: ${generateAccessToken(test1)}`);
        console.log(`   - 1234:  Подразделение ${user1234.divisionId}, Токен: ${generateAccessToken(user1234)}`);

    } catch (err) {
        console.error('Ошибка настройки:', err);
    } finally {
        process.exit();
    }
}

setupTestScenario();
