const { Sequelize } = require('sequelize');
const sequelize = new Sequelize('postgres://postgres:@localhost:5432/kill_metraj', {
    dialect: 'postgres',
    logging: console.log
});

async function test() {
    try {
        await sequelize.authenticate();
        console.log('Connected');

        await sequelize.query(`
            SET LOCAL app.test_var = 'hello';
            SET LOCAL app.test_var2 = 'world';
        `, {
            raw: true,
            plain: true,
            hooks: false
        });

        const [results] = await sequelize.query("SELECT current_setting('app.test_var'), current_setting('app.test_var2')");
        console.log('Results:', results);
    } catch (err) {
        console.error('Error:', err);
    } finally {
        await sequelize.close();
    }
}

test();
