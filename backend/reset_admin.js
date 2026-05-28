const { User } = require('./src/models');
const { sequelize } = require('./src/config/database');

async function resetAdmin() {
    try {
        console.log('--- Admin Reset Tool ---');
        await sequelize.authenticate();
        console.log('Database connected.');

        // Find or Create admin
        const [admin, created] = await User.findOrCreate({
            where: { username: 'admin' },
            defaults: {
                passwordHash: 'admin123',
                role: 'admin',
                isActive: true,
                canModifySettings: true,
                divisionId: 'all'
            }
        });

        if (!created) {
            console.log('Admin already exists. Resetting password to "admin123"...');
            admin.passwordHash = 'admin123'; // The beforeUpdate hook will hash this
            await admin.save();
        } else {
            console.log('Admin created with password "admin123".');
        }

        console.log('SUCCESS: Admin access restored.');
        process.exit(0);
    } catch (err) {
        console.error('FAILED to reset admin:', err.message);
        process.exit(1);
    }
}

resetAdmin();
