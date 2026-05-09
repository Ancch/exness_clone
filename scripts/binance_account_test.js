import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

function clean(s) { return (s||'').replace(/^['\"]|['\"]$/g, ''); }

// Load env from apps/exchange-gateway/.env
const envPath = './apps/exchange-gateway/.env';
if (!fs.existsSync(envPath)) {
  console.error('env file not found:', envPath);
  process.exit(2);
}
const raw = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  env[m[1]] = clean(m[2]);
}

const apiKey = env.BINANCE_API_KEY;
const secret = env.BINANCE_SECRET_KEY;
const API_BASE_RAW = env.BINANCE_API_BASE || 'https://api.binance.com';
if (!apiKey || !secret) {
  console.error('BINANCE_API_KEY or BINANCE_SECRET_KEY missing in', envPath);
  process.exit(2);
}
const BASE = API_BASE_RAW.replace(/\/$/, '');
// Normalize apiRoot to ensure it contains exactly '/api/v3' once
let apiRoot;
if (BASE.includes('/api/v3')) apiRoot = BASE.replace(/\/$/, '');
else if (BASE.endsWith('/api')) apiRoot = `${BASE.replace(/\/$/, '')}/v3`;
else apiRoot = `${BASE}/api/v3`;

const ts = Date.now();
const qs = `timestamp=${ts}`;
const sign = crypto.createHmac('sha256', secret).update(qs).digest('hex');
const url = `${apiRoot.replace(/\/$/, '')}/account?${qs}&signature=${sign}`;

console.log('Using URL:', url);
console.log('Using X-MBX-APIKEY header from apps/exchange-gateway/.env (not printed)');

(async () => {
  try {
    const resp = await fetch(url, { headers: { 'X-MBX-APIKEY': apiKey } });
    const text = await resp.text();
    console.log('HTTP status:', resp.status);
    console.log('Response body:\n', text.slice(0, 2000));
  } catch (err) {
    console.error('Request error:', err);
    process.exit(1);
  }
})();
