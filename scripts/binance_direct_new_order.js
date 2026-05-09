// Direct call to binance order endpoint using apps/exchange-gateway .env to see exact response for a given clientOrderId
const path = require('path');
const dotenv = require('dotenv');
const crypto = require('crypto');

dotenv.config({ path: path.resolve(__dirname, '../apps/exchange-gateway/.env') });

const clean = (s) => (s || '').replace(/^['"]|['"]$/g, '');
const API_KEY = clean(process.env.BINANCE_API_KEY);
const API_SECRET = clean(process.env.BINANCE_SECRET_KEY);
const BASE_RAW = clean(process.env.BINANCE_API_BASE) || 'https://api.binance.com/api';
const BINANCE_API = BASE_RAW.replace(/\/$/, '');

function makeSignature(payload) {
  return crypto.createHmac('sha256', API_SECRET).update(payload).digest('hex');
}

async function run(clientOrderId) {
  const symbol = 'BTCUSDT';
  const side = 'BUY';
  const type = 'MARKET';
  const quantity = '0.01';
  const ts = Date.now();
  const payload = `symbol=${symbol}&side=${side}&type=${type}&quantity=${quantity}&newClientOrderId=${clientOrderId}&timestamp=${ts}`;
  const sign = makeSignature(payload);
  const url = `${BINANCE_API}/v3/order?${payload}&signature=${sign}`;
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'X-MBX-APIKEY': API_KEY } });
    const text = await res.text();
    console.log('HTTP', res.status);
    try { console.log('body', JSON.parse(text)); } catch(e) { console.log('body', text.slice(0,2000)); }
  } catch (err) {
    console.error('request error', err);
  }
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/binance_direct_new_order.js <clientOrderId>');
  process.exit(2);
}
run(args[0]);
