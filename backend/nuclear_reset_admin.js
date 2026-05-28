const { User, sequelize } = require('./src/models');
const bcrypt = require('bcryptjs');

async function nuclearReset() {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        // 1. Delete admin
        await User.destroy({ where: { username: 'admin' }, force: true });
        console.log('Deleted existing admin.');

        // 2. Create fresh admin (Let the hook do the hashing!)
        const admin = await User.create({
            username: 'admin',
            passwordHash: 'admin123', // Hook will hash this!
            role: 'admin',
            isActive: true,
            divisionId: 'all',
            canModifySettings: true
        });
        console.log('Created fresh admin with Hook-based hashing.');
        console.log('New Password Hash in DB:', admin.passwordHash);

        // 3. Self-Test
        const isValid = await admin.comparePassword('admin123');
        console.log('Is "admin123" valid for this hash?', isValid);

        if (isValid) {
            console.log('--- SUCCESS! Admin reconstructed. ---');
            process.exit(0);
        } else {
            console.error('--- FAIL! Even the fresh hook-based hash is invalid. Check bcryptjs version! ---');
            process.exit(1);
        }

    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
nuclearReset();
