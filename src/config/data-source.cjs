const { DataSource } = require('typeorm');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

module.exports = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USER || 'driver_user',
  password: process.env.DB_PASSWORD || 'driver_password',
  database: process.env.DB_NAME || 'driver_service',
  entities: [path.join(__dirname, '..', '**', '*.entity.ts')],
  migrations: [path.join(__dirname, '..', 'migrations', '*.ts')],
  synchronize: false,
});