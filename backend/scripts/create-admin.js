const { User, sequelize } = require('../src/models');
const bcrypt = require('bcryptjs');

async function createAdmin() {
    try {
        // Ensure connection
        await sequelize.authenticate();
        logger.info('Подключение к базе данных успешно установлено');

        // Get info from command line or defaults
        const username = process.argv[2] || 'admin';
        const password = process.argv[3] || 'admin123';
        const departmentId = process.argv[4] || '100000000';

        logger.info('Проверка существования пользователя', { username });

        const existingUser = await User.findOne({ where: { username } });
        if (existingUser) {
            logger.info('Пользователь уже существует, обновление пароля', { username });
            existingUser.password = await bcrypt.hash(password, 10);
            await existingUser.save();
            logger.info('Пароль успешно обновлен');
        } else {
            logger.info('Создание нового администратора', { username });
            await User.create({
                username,
                passwordHash: password, // Model hooks will hash this
                role: 'admin',
                isActive: true,
                canModifySettings: true,
                divisionId: departmentId
            });
            logger.info('Администратор успешно создан');
        }

        console.log('\n-----------------------------------');
        console.log(`Имя пользователя: ${username}`);
        console.log(`Пароль: ${password}`);
        console.log(`Роль: admin`);
        console.log('-----------------------------------\n');

    } catch (error) {
        logger.error('Ошибка при создании администратора', { error: error.message });
    } finally {
        await sequelize.close();
        process.exit();
    }
}

createAdmin();
