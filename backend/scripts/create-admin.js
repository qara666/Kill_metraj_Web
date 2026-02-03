const { User } = require('../src/models');
const { sequelize } = require('../src/config/database');
const logger = require('../src/utils/logger');

async function createAdmin() {
    try {
        console.log('--- ADMIN CREATION SCRIPT START ---');

        // Ensure connection
        await sequelize.authenticate();
        console.log('Database connected successfully.');

        const adminData = {
            username: 'admin',
            passwordHash: 'adminpassword123', // Will be hashed by hooks in User model
            role: 'admin',
            isActive: true,
            canModifySettings: true,
            divisionId: 'all'
        };

        const [user, created] = await User.findOrCreate({
            where: { username: adminData.username },
            defaults: adminData
        });

        if (created) {
            console.log('SUCCESS: Admin user created.');
        } else {
            console.log('INFO: Admin user already exists. Updating credentials...');
            user.passwordHash = adminData.passwordHash;
            user.role = adminData.role;
            user.isActive = true;
            await user.save();
            console.log('SUCCESS: Admin credentials updated.');
        }

        console.log('Final Admin Info:', {
            id: user.id,
            username: user.username,
            role: user.role,
            isActive: user.isActive
        });

    } catch (error) {
        console.error('CRITICAL ERROR during admin creation:', error);
    } finally {
        await sequelize.close();
        console.log('--- SCRIPT FINISHED ---');
        process.exit();
    }
}

createAdmin();
