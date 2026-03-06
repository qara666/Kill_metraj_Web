const { sequelize, User, UserPreset } = require('../src/models');
const logger = require('../src/utils/logger');

async function createAdmin() {
    try {
        const username = process.env.ADMIN_USERNAME || 'admin';
        const email = process.env.ADMIN_EMAIL || 'admin@example.com';
        const password = process.env.ADMIN_PASSWORD;

        if (!password) {
            console.error('❌ Ошибка: Переменная окружения ADMIN_PASSWORD не установлена.');
            console.log('Использование: ADMIN_USERNAME=admin ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=ваш_пароль node scripts/createAdminOnRender.js');
            process.exit(1);
        }

        console.log('📡 Подключение к базе данных...');
        await sequelize.authenticate();
        console.log('✅ Соединение с базой данных установлено.');

        // Проверка существующего пользователя
        const existingUser = await User.findOne({ where: { username } });

        if (existingUser) {
            console.log(`⚠️ Пользователь "${username}" уже существует. Обновление пароля и роли...`);
            existingUser.passwordHash = password; // Модель User имеет hook beforeUpdate для хеширования
            existingUser.role = 'admin';
            existingUser.isActive = true;
            await existingUser.save();
            console.log(`✅ Данные пользователя "${username}" успешно обновлены.`);
        } else {
            console.log(`📝 Создание нового администратора: ${username} (${email})...`);

            // Создаем пользователя и пресет (используя транзакцию для безопасности)
            const result = await sequelize.transaction(async (t) => {
                const admin = await User.create({
                    username,
                    email,
                    passwordHash: password, // Модель User имеет hook beforeCreate для хеширования
                    role: 'admin',
                    isActive: true
                }, { transaction: t });

                await UserPreset.create({
                    userId: admin.id,
                    settings: {
                        theme: 'dark',
                        cityBias: 'Kyiv, Ukraine'
                    },
                    updatedBy: admin.id
                }, { transaction: t });

                return admin;
            });

            console.log(`✅ Администратор "${username}" успешно создан. ID: ${result.id}`);
        }

    } catch (error) {
        console.error('❌ Критическая ошибка при создании администратора:');
        console.error(error.message);
        if (error.errors) {
            error.errors.forEach(err => console.error(`  - ${err.message}`));
        }
        process.exit(1);
    } finally {
        await sequelize.close();
        process.exit(0);
    }
}

createAdmin();
