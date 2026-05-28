const { User, DashboardState } = require('./src/models');
const { sequelize } = require('./src/config/database');
const bcrypt = require('bcryptjs');

async function forceResetV2() {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        // 1. Force Admin Password & Division
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash('admin123', salt);

        const [user] = await User.upsert({
            username: 'admin',
            passwordHash: hash,
            role: 'admin',
            isActive: true,
            divisionId: '100000052', // Match the department found in logs
            canModifySettings: true
        });

        // 2. Clear Dashboard State (Prevents empty UI override)
        const admin = await User.findOne({ where: { username: 'admin' } });
        if (admin) {
            await DashboardState.destroy({ where: { userId: admin.id } });
            console.log(`Cleared DashboardState for admin (ID: ${admin.id})`);
        }

        console.log('--- RESET V2 COMPLETE ---');
        console.log('Username: admin');
        console.log('Password: admin123');
        console.log('Division: 100000052');
        console.log('SUCCESS: Access and Data Link restored.');

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
forceResetV2();
