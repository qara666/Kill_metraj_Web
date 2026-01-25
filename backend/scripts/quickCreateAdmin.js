// Quick script to create admin user
const { User, UserPreset, syncDatabase } = require('../src/models');
const bcrypt = require('bcryptjs');

async function createAdmin() {
    try {
        await syncDatabase();

        // Check if admin exists
        const existing = await User.findOne({ where: { role: 'admin' } });
        if (existing) {
            console.log('✅ Admin already exists:', existing.username);
            process.exit(0);
        }

        // Create admin
        const admin = await User.create({
            username: 'admin',
            email: 'admin@yapiko.com',
            passwordHash: 'admin123', // Will be hashed by hook
            role: 'admin',
            isActive: true
        });

        // Create preset
        await UserPreset.create({
            userId: admin.id,
            settings: {
                theme: 'dark',
                cityBias: 'Kyiv, Ukraine'
            },
            updatedBy: admin.id
        });

        console.log('✅ Admin created successfully!');
        console.log('   Username: admin');
        console.log('   Email: admin@yapiko.com');
        console.log('   Password: admin123');
        console.log('   ID:', admin.id);

        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

createAdmin();
