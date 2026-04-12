const { Sequelize } = require('sequelize');
const sequelize = new Sequelize(process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/kill_metraj');
sequelize.query("SELECT * FROM api_kml_hubs").then(r => console.log(r[0])).catch(console.error).finally(() => process.exit(0));
