import { Pool } from 'pg';
import net from 'net';
import path from 'path';

// We'll attempt to load dotenv automatically if DB envs are missing. This
// makes running individual packages (where a dev runner doesn't inject envs)
// more robust. Consumers should still load dotenv early when possible.

let _dbPassword = process.env.DB_PASSWORD;

async function ensureEnvLoaded() {
  // quick check — if password present, nothing to do
  if (typeof _dbPassword === 'string' && _dbPassword.length > 0) return;

  try {
    // Try to dynamically import dotenv and load repo root then package .env
    const dotenv = await import('dotenv');
    dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
    dotenv.config({ path: path.resolve(process.cwd(), '.env') });
    // refresh value
    _dbPassword = process.env.DB_PASSWORD;
    console.log('◇ attempted to load .env files for DB config');
  } catch (err: any) {
    // ignore — we'll validate below and throw a helpful error
    console.warn('◇ could not auto-load dotenv (module missing?)', err?.message || err);
  }

  console.log(`◇ DB env: host=${process.env.DB_HOST}, port=${process.env.DB_PORT}, name=${process.env.DB_NAME}, user=${process.env.DB_USER}, password_type=${typeof _dbPassword}`);
  if (typeof _dbPassword !== 'string' || _dbPassword.length === 0) {
    console.error('DB_PASSWORD is missing or not a string. Check your .env files and dotenv loading order.');
    // throw a clearer error to fail fast in dev
    throw new Error('DB_PASSWORD is missing or not a string. Set DB_PASSWORD in your .env');
  }
}

function waitForPort(host: string, port: number, attempts = 30, delayMs = 500) {
  return new Promise<void>((resolve, reject) => {
    let tries = 0;
    const tryConnect = () => {
      tries++;
      const socket = net.connect({ host, port }, () => {
        socket.destroy();
        resolve();
      });
      socket.on('error', (err) => {
        socket.destroy();
        if (tries >= attempts) return reject(err);
        setTimeout(tryConnect, delayMs);
      });
    };
    tryConnect();
  });
}

const dbHost = process.env.DB_HOST || '127.0.0.1';
const dbPort = parseInt(process.env.DB_PORT || '5432', 10);

let pool: Pool;

async function initPool() {
  // Ensure env is loaded and validated before starting the pool.
  await ensureEnvLoaded();

  // Wait for the DB port to be ready (dev-friendly). If it never becomes ready, this will reject and crash.
  await waitForPort(dbHost, dbPort, 60, 500);
  pool = new Pool({
    host: dbHost,
    port: dbPort,
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: _dbPassword,
  });
}

const poolReady = initPool();

export const query = async (text: string, params?: any[]) => {
  await poolReady;
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res.rows;
  } finally {
    client.release();
  }
};

export default async function getPool() {
  await poolReady;
  return pool;
}