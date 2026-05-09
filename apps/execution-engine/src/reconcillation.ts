// apps/execution-engine/src/reconciliation.ts
import { query } from '@repo/db';
import axios from 'axios';
import crypto from 'crypto';

const clean = (s?: string) => s?.replace(/^['"]|['"]$/g, '') ?? '';
const BASE_RAW = clean(process.env.BINANCE_API_BASE) || 'https://api.binance.com/api';
const BINANCE_API = BASE_RAW.replace(/\/$/, '');
const API_KEY = clean(process.env.BINANCE_API_KEY || process.env.BINANCE_API_KEY);
const API_SECRET = clean(process.env.BINANCE_SECRET_KEY || process.env.BINANCE_SECRET_KEY);

function signature(payload: string, secret: string) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

async function axiosGetWithRetry(url: string, headers: Record<string, string>, attempts = 3) {
  let attempt = 0;
  let lastErr: any = null;
  while (attempt < attempts) {
    try {
      return await axios.get(url, { headers });
    } catch (err: any) {
      lastErr = err;
      const code = err?.code;
      // Retry on transient network errors
      if (code === 'EAI_AGAIN' || code === 'ENOTFOUND' || code === 'ETIMEDOUT' || code === 'ECONNRESET') {
        attempt++;
        const wait = 200 * Math.pow(2, attempt);
        console.warn(`Transient network error (${code}) calling ${url}, retrying in ${wait}ms (attempt ${attempt}/${attempts})`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function runReconciliation() {
  try {
    const limboOrders = await query(
      `SELECT * FROM orders WHERE status IN ('SENT_TO_EXCHANGE', 'PARTIALLY_FILLED')`
    );

    for (const order of limboOrders) {
      try {
        // Check order status from Binance (signed GET)
        const ts = Date.now();
        const payload = `symbol=${order.symbol}&origClientOrderId=${order.client_order_id}&timestamp=${ts}`;
        const sign = signature(payload, API_SECRET);
        const url = `${BINANCE_API}/v3/order?${payload}&signature=${sign}`;
  const resp = await axiosGetWithRetry(url, { 'X-MBX-APIKEY': API_KEY });
  const data = resp.data;

        const binanceStatus = data.status; // FILLED, CANCELED, etc.

        if (binanceStatus === 'FILLED' && order.status !== 'FILLED') {
          // We missed a fill – fetch trade list and apply missing fills
          const ts2 = Date.now();
          const payload2 = `symbol=${order.symbol}&orderId=${data.orderId}&timestamp=${ts2}`;
          const sign2 = signature(payload2, API_SECRET);
          const tradesUrl = `${BINANCE_API}/v3/myTrades?${payload2}&signature=${sign2}`;
          const tradesResp = await axiosGetWithRetry(tradesUrl, { 'X-MBX-APIKEY': API_KEY });
          // Manually synthesize missing trades (similar to fillHandler logic)
          // ... (you can call handleFillUpdate with synthesized data, or directly insert)
        } else if (binanceStatus === 'CANCELED') {
          await query(`UPDATE orders SET status = 'CANCELLED' WHERE id = $1`, [order.id]);
        }
      } catch (err: any) {
        // Log response body from Binance when available for easier debugging
        if (err?.response) {
          console.error('Reconciliation error for order', order.id, 'status=', err.response.status, 'body=', err.response.data);
          // If Binance reports order not found, try fetching recent allOrders and search for the clientOrderId
          if (err.response.data && err.response.data.code === -2013) {
            try {
              const tsAll = Date.now();
              const payloadAll = `symbol=${order.symbol}&limit=100&timestamp=${tsAll}`;
              const signAll = signature(payloadAll, API_SECRET);
              const allUrl = `${BINANCE_API}/v3/allOrders?${payloadAll}&signature=${signAll}`;
              const allResp = await axiosGetWithRetry(allUrl, { 'X-MBX-APIKEY': API_KEY });
              const found = (allResp.data || []).find((o: any) => o.clientOrderId === order.client_order_id || String(o.orderId) === String(order.client_order_id));
              if (found) {
                console.log('Reconciliation: located order in allOrders for', order.id, '->', found.orderId || found.clientOrderId);
                const binanceStatus2 = found.status;
                if (binanceStatus2 === 'FILLED' && order.status !== 'FILLED') {
                  const ts3 = Date.now();
                  const payload3 = `symbol=${order.symbol}&orderId=${found.orderId}&timestamp=${ts3}`;
                  const sign3 = signature(payload3, API_SECRET);
                  const tradesUrl2 = `${BINANCE_API}/v3/myTrades?${payload3}&signature=${sign3}`;
                  const tradesResp2 = await axiosGetWithRetry(tradesUrl2, { 'X-MBX-APIKEY': API_KEY });
                  // TODO: apply fills from tradesResp2.data
                } else if (binanceStatus2 === 'CANCELED') {
                  await query(`UPDATE orders SET status = 'CANCELLED' WHERE id = $1`, [order.id]);
                }
              } else {
                console.warn('Reconciliation: order not found in allOrders for', order.id);
              }
            } catch (err2: any) {
              const respData = err2 && err2.response ? err2.response.data : err2;
              console.error('Reconciliation allOrders fallback failed for', order.id, respData);
            }
          }
        } else {
          console.error('Reconciliation error for order', order.id, err);
        }
      }
    }
  } catch (err) {
    console.error('Reconciliation loop error:', err);
  }
}