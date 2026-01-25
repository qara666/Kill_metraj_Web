#!/usr/bin/env node

/**
 * Script to create the first admin user (PostgreSQL version)
 * Usage: node scripts/createAdmin.js
 */

const readline = require('readline');
const { sequelize, User, UserPreset, syncDatabase } = require('../src/models');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function createAdmin() {
    try {
        // Connect to PostgreSQL
        console.log('подключение к PostgreSQL');
        await sequelize.authenticate();
        console.log('коннектед к PostgreSQL\n');

        // Sync database (create tables if not exist)
        console.log('синк к бд...');
        await syncDatabase();
        console.log('Бд синхрон\n');

        // Check if admin already exists
        const existingAdmin = await User.findOne({ where: { role: 'admin' } });
        if (existingAdmin) {
            console.log('⚠️  Admin user already exists:');
            console.log(`   Username: ${existingAdmin.username}`);
            

            const confirm = await question('Do you want to create another admin? (yes/no): ');
            if (confirm.toLowerCase() !== 'yes') {
                console.log('Cancelled.');
                process.exit(0);
            }
        }

        // Get admin details
        console.log('\n📝 Create Admin User\n');

        const username = await question('Username: ');
        if (!username || username.length < 3) {
            console.error('❌ Username must be at least 3 characters');
            process.exit(1);
        }

        const email = await question('Email: ');
        if (!email || !email.includes('@')) {
            console.error('❌ Invalid email address');
            process.exit(1);
        }

        const password = await question('Password (min 6 characters): ');
        if (!password || password.length < 6) {
            console.error('❌ Password must be at least 6 characters');
            process.exit(1);
        }

        // Check if user already exists
        const existingUser = await User.findOne({
            where: {
                [require('sequelize').Op.or]: [{ username }, { email }]
            }
        });

        if (existingUser) {
            console.error('❌ User with this username or email already exists');
            process.exit(1);
        }

        // Create admin user
        console.log('\nCreating admin user...');
        const admin = await User.create({
            username,
            email,
            passwordHash: password, // Will be hashed by beforeCreate hook
            role: 'admin',
            isActive: true
        });

        // Create default preset
        await UserPreset.create({
            userId: admin.id,
            settings: {
                theme: 'dark',
                cityBias: 'Kyiv, Ukraine'
            },
            updatedBy: admin.id
        });

        console.log('\n✅ Admin user created successfully!\n');
        console.log('Details:');
        console.log(`   Username: ${admin.username}`);
        console.log(`   Email: ${admin.email}`);
        console.log(`   Role: ${admin.role}`);
        console.log(`   ID: ${admin.id}\n`);
        console.log('You can now login with these credentials.\n');

    } catch (error) {
        console.error('❌ Error creating admin:', error.message);
        if (error.name === 'SequelizeConnectionError') {
            console.error('\n💡 Make sure PostgreSQL is running and credentials are correct.');
            console.error('   Check your .env file or environment variables:');
            console.error('   - DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD');
        }
        process.exit(1);
    } finally {
        rl.close();
        await sequelize.close();
        process.exit(0);
    }
}

// Run the script
createAdmin();
