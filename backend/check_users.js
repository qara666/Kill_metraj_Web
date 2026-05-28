const { User } = require('./src/models');
const { sequelize } = require('./src/config/database');

async function checkUsers() {
    try {
        await sequelize.authenticate();
        const users = await User.findAll();
        console.log('--- USER LIST ---');
        users.forEach(u => {
            console.log(`[${u.id}] ${u.username} | Role: ${u.role} | Active: ${u.isActive} | Hash: ${u.passwordHash.substring(0, 10)}...`);
        });
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
checkUsers();
