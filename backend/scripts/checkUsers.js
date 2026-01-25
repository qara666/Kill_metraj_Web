const { sequelize, User } = require('../src/models');

async function checkUsers() {
    try {
        await sequelize.authenticate();
        console.log('коннект к PostgreSQL');

        const users = await User.findAll();

        console.log('Found ' + users.length + ' users:');
        users.forEach(u => {
            console.log(`- ID: ${u.id}, Username: ${u.username}, Email: ${u.email}, Role: ${u.role}, Active: ${u.isActive}`);
        });

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await sequelize.close();
    }
}

checkUsers();
