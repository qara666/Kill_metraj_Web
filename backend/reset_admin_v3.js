const { sequelize } = require('./src/config/database');
const bcrypt = require('bcryptjs');

async function forceResetV3() {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        // 1. Generate known hash for 'admin123'
        const hash = await bcrypt.hash('admin123', 10);
        console.log(`Generated hash: ${hash}`);

        // 2. Direct Update (Bypass hooks)
        await sequelize.query(
            `UPDATE users SET "passwordHash" = :hash, role = 'admin', "isActive" = true, "divisionId" = 'all' 
             WHERE username = 'admin'`,
            { replacements: { hash } }
        );

        // 3. Clear Dashboard State 
        const [admin] = await sequelize.query("SELECT id FROM users WHERE username = 'admin'", { type: sequelize.QueryTypes.SELECT });
        if (admin) {
            await sequelize.query(`DELETE FROM "dashboard_states" WHERE "userId" = :userId`, { replacements: { userId: admin.id } });
            console.log(`Cleared dashboard_states for admin ID ${admin.id}`);
        }

        console.log('--- RESET V3 COMPLETE ---');
        console.log('Username: admin');
        console.log('Password: admin123');
        console.log('Mode: ALL Divisions');
        console.log('STATUS: Direct SQL injection successful. Access restored.');

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
forceResetV3();
