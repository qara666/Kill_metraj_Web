const { sequelize, User } = require('../src/models');

async function checkUsers() {
    try {
        await sequelize.authenticate();
        console.log('Соединение с PostgreSQL установлено');

        const users = await User.findAll();

        console.log('Найдено ' + users.length + ' пользователей:');
        users.forEach(u => {
            console.log(`- ID: ${u.id}, Имя: ${u.username}, Email: ${u.email}, Роль: ${u.role}, Активен: ${u.isActive}`);
        });

    } catch (error) {
        console.error('Ошибка:', error);
    } finally {
        await sequelize.close();
    }
}

checkUsers();
