import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';

dotenv.config();

async function runMigration() {
  const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER || 'driver_user',
    password: process.env.DB_PASSWORD || 'driver_password',
    database: process.env.DB_NAME || 'driver_service',
    entities: ['src/**/*.entity.ts'],
    migrations: ['src/migrations/*.ts'],
    synchronize: false,
  });

  await dataSource.initialize();
  console.log('Data Source has been initialized!');

  const migrations = await dataSource.runMigrations();
  console.log(`Ran ${migrations.length} migrations`);
  
  await dataSource.destroy();
  console.log('Migration completed!');
}

runMigration().catch(error => {
  console.error('Migration failed:', error);
  process.exit(1);
});