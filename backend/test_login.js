const { User } = require('./src/models');
const { sequelize } = require('./src/config/database');

async function testLogin() {
    try {
        await sequelize.authenticate();
        const user = await User.findOne({ where: { username: 'admin' } });
        if (!user) {
            console.log('Admin not found');
            process.exit(1);
        }
        
        const isMatch = await user.comparePassword('admin123');
        console.log(`Login check for admin/admin123: ${isMatch ? 'SUCCESS' : 'FAILED'}`);
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}
testLogin();
