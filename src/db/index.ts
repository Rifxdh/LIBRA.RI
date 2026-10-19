import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import dotenv from 'dotenv';
import * as schema from './schema.ts';

dotenv.config({ path: ['.env.local', '.env'] });

declare global {
  var _postgresPool: Pool | undefined;
}

export const createPool = () => {
  if (!global._postgresPool) {
    const databaseUrl = process.env.DATABASE_URL;
    global._postgresPool = databaseUrl
      ? new Pool({
        connectionString: databaseUrl,
        ssl: true,
        max: process.env.VERCEL ? 2 : 10,
        connectionTimeoutMillis: 15000,
      })
      : new Pool({
        host: process.env.SQL_HOST,
        port: Number(process.env.SQL_PORT || 5432),
        user: process.env.SQL_USER,
        password: process.env.SQL_PASSWORD,
        database: process.env.SQL_DB_NAME,
        max: 10,
        connectionTimeoutMillis: 15000,
      });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

const pool = createPool();

export const db = drizzle(pool, { schema });
export const isDatabaseConfigured = Boolean(
  process.env.DATABASE_URL || (process.env.SQL_HOST && process.env.SQL_DB_NAME),
);
