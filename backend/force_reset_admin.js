const { User } = require('./src/models');
const { sequelize } = require('./src/config/database');
const bcrypt = require('bcryptjs');

async function forceReset() {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash('admin123', salt);

        // Update directly
        await User.update(
            { passwordHash: hash },
            { where: { username: 'admin' } }
        );

        console.log('--- RESET COMPLETE ---');
        console.log('Username: admin');
        console.log('Password: admin123');
        console.log('Hash used:', hash);
        
        // Immediate self-test
        const user = await User.findOne({ where: { username: 'admin' } });
        const match = await bcrypt.compare('admin123', user.passwordHash);
        console.log('Self-test match:', match);

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
forceReset();
