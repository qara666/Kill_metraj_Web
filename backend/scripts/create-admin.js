const { User, sequelize } = require('../src/models');
const bcrypt = require('bcryptjs');

async function createAdmin() {
    try {
        // Ensure connection
        await sequelize.authenticate();
        console.log('Connected to database successfully.');

        // Get info from command line or defaults
        const username = process.argv[2] || 'admin';
        const password = process.argv[3] || 'admin123';
        const departmentId = process.argv[4] || '100000000';

        console.log(`Checking for user: ${username}...`);

        const existingUser = await User.findOne({ where: { username } });
        if (existingUser) {
            console.log(`User ${username} already exists! Updating password...`);
            existingUser.password = await bcrypt.hash(password, 10);
            await existingUser.save();
            console.log('Password updated successfully.');
        } else {
            console.log(`Creating new admin user: ${username}...`);
            await User.create({
                username,
                password, // Model hooks will hash this
                role: 'admin',
                isActive: true,
                canModifySettings: true,
                departmentId
            });
            console.log('Admin user created successfully!');
        }

        console.log('\n-----------------------------------');
        console.log(`Username: ${username}`);
        console.log(`Password: ${password}`);
        console.log(`Role: admin`);
        console.log('-----------------------------------\n');

    } catch (error) {
        console.error('Error creating admin user:', error);
    } finally {
        await sequelize.close();
        process.exit();
    }
}

createAdmin();
