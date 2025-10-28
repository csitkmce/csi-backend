import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

declare global {
  var pgPool: Pool | undefined;
}

export const pool = global.pgPool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  // Set IST timezone for all connections
  options: '-c timezone=Asia/Kolkata',
});

// Set timezone on pool initialization
pool.on('connect', async (client) => {
  try {
    await client.query(`SET timezone = 'Asia/Kolkata';`);
  } catch (err) {
    console.error('Failed to set timezone on connection:', err);
  }
});

if (!global.pgPool) global.pgPool = pool;