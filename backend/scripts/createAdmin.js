#!/usr/bin/env node

/**
 * Script to create the first admin user (PostgreSQL version)
 * Usage: node scripts/createAdmin.js
 */

const readline = require('readline');
const { sequelize, User, UserPreset, syncDatabase } = require('../src/models');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function createAdmin() {
    try {
        // Connect to PostgreSQL
        console.log('Подключение к PostgreSQL...');
        await sequelize.authenticate();
        console.log('Соединение с PostgreSQL установлено\n');

        // Sync database (create tables if not exist)
        console.log('Синхронизация базы данных...');
        await syncDatabase();
        console.log('База данных синхронизирована\n');

        // Check if admin already exists
        const existingAdmin = await User.findOne({ where: { role: 'admin' } });
        if (existingAdmin) {
            console.log('Администратор уже существует:');
            console.log(`   Имя пользователя: ${existingAdmin.username}`);


            const confirm = await question('Создать еще одного администратора? (yes/no): ');
            if (confirm.toLowerCase() !== 'yes') {
                console.log('Отменено.');
                process.exit(0);
            }
        }

        // Get admin details
        console.log('\n📝 Создание администратора\n');

        const username = await question('Имя пользователя: ');
        if (!username || username.length < 3) {
            console.error('Ошибка: Имя пользователя должно содержать минимум 3 символа');
            process.exit(1);
        }

        const email = await question('Email: ');
        if (!email || !email.includes('@')) {
            console.error('Ошибка: Некорректный email адрес');
            process.exit(1);
        }

        const password = await question('Пароль (минимум 6 символов): ');
        if (!password || password.length < 6) {
            console.error('Ошибка: Пароль должен содержать минимум 6 символов');
            process.exit(1);
        }

        // Check if user already exists
        const existingUser = await User.findOne({
            where: {
                [require('sequelize').Op.or]: [{ username }, { email }]
            }
        });

        if (existingUser) {
            console.error('Ошибка: Пользователь с таким именем или email уже существует');
            process.exit(1);
        }

        // Create admin user
        console.log('\nСоздание пользователя...');
        const admin = await User.create({
            username,
            email,
            passwordHash: password, // Will be hashed by beforeCreate hook
            role: 'admin',
            isActive: true
        });

        // Create default preset
        await UserPreset.create({
            userId: admin.id,
            settings: {
                theme: 'dark',
                cityBias: 'Kyiv, Ukraine'
            },
            updatedBy: admin.id
        });

        console.log('\nАдминистратор успешно создан!\n');
        console.log('Детали:');
        console.log(`   Имя пользователя: ${admin.username}`);
        console.log(`   Email: ${admin.email}`);
        console.log(`   Роль: ${admin.role}`);
        console.log(`   ID: ${admin.id}\n`);
        console.log('Теперь вы можете войти, используя эти данные.\n');

    } catch (error) {
        console.error('Ошибка при создании администратора:', error.message);
        if (error.name === 'SequelizeConnectionError') {
            console.error('\nУбедитесь, что PostgreSQL запущен и учетные данные верны.');
            console.error('Проверьте файл .env или переменные окружения:');
            console.error('   - DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD');
        }
        process.exit(1);
    } finally {
        rl.close();
        await sequelize.close();
        process.exit(0);
    }
}

// Run the script
createAdmin();
