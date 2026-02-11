const { sequelize, User, UserPreset } = require('../src/models');
const { hashPassword } = require('../src/middleware/auth');

async function createSuperadmin() {
    try {
        console.log('Connecting to database...');
        await sequelize.authenticate();
        console.log('Database connection established.');

        const username = 'maxsun';
        const password = '00713';
        const role = 'admin';

        // Check if user exists
        const existingUser = await User.findOne({ where: { username } });

        if (existingUser) {
            console.log(`User ${username} already exists. Updating password and role...`);
            existingUser.passwordHash = password; // Will be hashed by beforeUpdate hook or we can hash it manually if needed, but model hook handles it usually.
            // Actually, let's verify if the hook runs on update. User model usually has hooks.
            // To be safe and consistent with auth controller, let's reset it properly.
            existingUser.role = role;
            existingUser.isActive = true;
            await existingUser.save();
            console.log(`User ${username} updated successfully.`);
        } else {
            console.log(`Creating user ${username}...`);
            await User.create({
                username,
                email: 'maxsun@admin.com', // Placeholder email
                passwordHash: password,
                role,
                isActive: true,
                canModifySettings: true,
                preset: {
                    settings: {},
                    updatedBy: 1 // System
                }
            }, {
                include: [{ model: UserPreset, as: 'preset' }]
            });
            console.log(`User ${username} created successfully.`);
        }

    } catch (error) {
        console.error('Error creating superadmin:', error);
    } finally {
        await sequelize.close();
    }
}

createSuperadmin();
