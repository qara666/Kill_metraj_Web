const { sequelize, User } = require('./src/models');

async function testCreateUser() {
    try {
        console.log('Authenticating...');
        await sequelize.authenticate();
        console.log('Connection has been established successfully.');

        console.log('Attempting to create user without email...');
        const user = await User.create({
            username: 'debug_user_' + Date.now(),
            email: null,
            passwordHash: 'password123',
            role: 'user',
            isActive: true
        });

        console.log('User created successfully:', user.toJSON());
    } catch (error) {
        console.error('Failed to create user:', error);
        if (error.errors) {
            error.errors.forEach(e => console.error('Validation error:', e.message));
        }
    } finally {
        await sequelize.close();
    }
}

testCreateUser();
