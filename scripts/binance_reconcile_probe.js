// Probe script to call Binance /v3/order and /v3/myTrades for a given symbol/order client id
// Loads env from apps/exchange-gateway/.env

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

async function getOrder(symbol, origClientOrderId) {
  const ts = Date.now();
  const payload = `symbol=${symbol}&origClientOrderId=${origClientOrderId}&timestamp=${ts}`;
  const sign = makeSignature(payload);
  const url = `${BINANCE_API}/v3/order?${payload}&signature=${sign}`;
  const res = await fetch(url, { headers: { 'X-MBX-APIKEY': API_KEY } });
  const body = await res.text();
  console.log('GET /order', res.status, body);
}

async function getMyTrades(symbol, orderId) {
  const ts = Date.now();
  const payload = `symbol=${symbol}&orderId=${orderId}&timestamp=${ts}`;
  const sign = makeSignature(payload);
  const url = `${BINANCE_API}/v3/myTrades?${payload}&signature=${sign}`;
  const res = await fetch(url, { headers: { 'X-MBX-APIKEY': API_KEY } });
  const body = await res.text();
  console.log('GET /myTrades', res.status, body);
}

(async () => {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error('Usage: node scripts/binance_reconcile_probe.js SYMBOL ORIG_CLIENT_ORDER_ID [ORDER_ID]');
    process.exit(2);
  }
  const [symbol, origClientOrderId, orderId] = args;
  await getOrder(symbol, origClientOrderId);
  if (orderId) await getMyTrades(symbol, orderId);
})();
