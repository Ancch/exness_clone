// One-off test script to POST a signed /order/test to Binance using apps/exchange-gateway/.env
// It intentionally avoids printing secrets and prints only the HTTP status and body.

const crypto = require('crypto');
const path = require('path');
const dotenv = require('dotenv');
// Use the built-in AbortController (Node 18+). Fallback not required for modern Node.
const AbortController = globalThis.AbortController;

// Load env from exchange-gateway .env
dotenv.config({ path: path.resolve(__dirname, '../apps/exchange-gateway/.env') });

const clean = (s) => (s || '').replace(/^['"]|['"]$/g, '');

async function run() {
  const apiKey = clean(process.env.BINANCE_API_KEY);
  const secret = clean(process.env.BINANCE_SECRET_KEY);
  const rawBase = clean(process.env.BINANCE_API_BASE) || 'https://api.binance.com';
  const BASE = rawBase.replace(/\/$/, '');
  if (!apiKey || !secret) {
    console.error('Missing BINANCE_API_KEY or BINANCE_SECRET_KEY in apps/exchange-gateway/.env');
    process.exit(2);
  }

  // choose a small symbol/qty that generally exists on testnet
  const symbol = 'BTCUSDT';
  const side = 'BUY';
  const type = 'MARKET';
  const quantity = '0.001';

  const timestamp = Date.now();
  const payload = `symbol=${symbol}&side=${side}&type=${type}&quantity=${quantity}&timestamp=${timestamp}`;
  const sign = crypto.createHmac('sha256', secret).update(payload).digest('hex');

  const apiRoot = BASE.includes('/api') ? BASE : `${BASE}/api`;
  // Use the real order endpoint (this will attempt to create an order on testnet)
  const url = `${apiRoot.replace(/\/$/, '')}/v3/order?${payload}&signature=${sign}`;

  try {
    // Use native fetch available in Node 18+. Add a timeout via AbortController.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const res = await fetch(url, { method: 'POST', headers: { 'X-MBX-APIKEY': apiKey }, signal: controller.signal });
    clearTimeout(timeout);

    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch (e) {
      body = text;
    }

    console.log('HTTP', res.status);
    console.log('Response body:', typeof body === 'string' ? body.slice(0, 2000) : JSON.stringify(body));
    if (!res.ok) process.exit(1);
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('Request timed out');
    } else {
      console.error('Request error:', err.message || err);
    }
    process.exit(1);
  }
}

run();
