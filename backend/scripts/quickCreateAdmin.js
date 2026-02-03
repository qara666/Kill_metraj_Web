// Quick script to create admin user
const { User, UserPreset, syncDatabase } = require('../src/models');
const bcrypt = require('bcryptjs');

async function createAdmin() {
    try {
        await syncDatabase();

        // Check if admin exists
        const existing = await User.findOne({ where: { role: 'admin' } });
        if (existing) {
            console.log('Администратор уже существует:', existing.username);
            process.exit(0);
        }

        // Create admin
        const admin = await User.create({
            username: 'admin',
            email: 'admin@yapiko.com',
            passwordHash: 'admin123', // Will be hashed by hook
            role: 'admin',
            isActive: true
        });

        // Create preset
        await UserPreset.create({
            userId: admin.id,
            settings: {
                theme: 'dark',
                cityBias: 'Kyiv, Ukraine'
            },
            updatedBy: admin.id
        });

        console.log('Администратор успешно создан!');
        console.log('   Имя пользователя: admin');
        console.log('   Email: admin@yapiko.com');
        console.log('   Пароль: admin123');
        console.log('   ID:', admin.id);

        process.exit(0);
    } catch (error) {
        console.error('Ошибка:', error.message);
        process.exit(1);
    }
}

createAdmin();
