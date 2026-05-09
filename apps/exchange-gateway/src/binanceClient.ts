import axios, { AxiosRequestConfig } from 'axios';
import crypto from 'crypto';

// helper to strip surrounding quotes
const clean = (s?: string) => s?.replace(/^['\"]|['\"]$/g, '') ?? '';

const MOCK = process.env.BINANCE_MOCK_TRADING === '1';

function signature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

export async function newOrder(params: {
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET'; // extend later
  quantity: number;
  newClientOrderId: string;
}) {
  if (MOCK) {
    // Return a realistic mock response quickly for local dev
    return {
      symbol: params.symbol,
      orderId: `mock-${Date.now()}`,
      clientOrderId: params.newClientOrderId,
      status: 'NEW',
      executedQty: '0',
      cummulativeQuoteQty: '0',
      price: '0',
      origQty: String(params.quantity),
      fills: []
    };
  }

  const apiKey = clean(process.env.BINANCE_API_KEY!);
  const secret = clean(process.env.BINANCE_SECRET_KEY!);
  const timestamp = Date.now();

  const payload = `symbol=${params.symbol}&side=${params.side}&type=${params.type}&quantity=${params.quantity}&newClientOrderId=${params.newClientOrderId}&timestamp=${timestamp}`;
  const sign = signature(payload, secret);

    // Compute API root at call time from env
    function computeApiRoot() {
      const raw = clean(process.env.BINANCE_API_BASE) || 'https://api.binance.com';
      // ensure no trailing slash
      let root = raw.replace(/\/$/, '');
      // If path doesn't include /api, append it
      if (!root.includes('/api')) root = `${root}/api`;
      // Ensure we end with /v3
      if (!root.endsWith('/v3')) root = `${root.replace(/\/$/, '')}/v3`;
      return root;
    }

  // Build URL: if BASE already contains '/api/v3', use it directly, otherwise append '/api/v3'
    const apiRoot = computeApiRoot();
  const url = `${apiRoot.replace(/\/$/, '')}/order?${payload}&signature=${sign}`;
  const config: AxiosRequestConfig = {
    method: 'POST',
    url,
    headers: { 'X-MBX-APIKEY': apiKey },
    timeout: 20_000,
  };

  try {
    console.log('binanceClient: request', { requestId: params.newClientOrderId, url });
    const response = await axios(config);
    console.log('binanceClient: response', { requestId: params.newClientOrderId, status: response.status, dataSnippet: JSON.stringify(response.data).slice(0,1000) });
    return response.data;
  } catch (err: any) {
    // Axios error could contain response with data
    console.error('binanceClient: axios error', { requestId: params.newClientOrderId, message: err.message, code: err.code, responseData: err.response?.data, responseStatus: err.response?.status });
    throw err;
  }
}

export async function cancelOrder(symbol: string, orderId: string) {
  if (MOCK) {
    return { symbol, orderId, status: 'CANCELED' };
  }

  const apiKey = clean(process.env.BINANCE_API_KEY!);
  const secret = clean(process.env.BINANCE_SECRET_KEY!);
  const timestamp = Date.now();
  const payload = `symbol=${symbol}&orderId=${orderId}&timestamp=${timestamp}`;
  const sign = signature(payload, secret);
  const apiRoot2 = (function(){
    const raw = clean(process.env.BINANCE_API_BASE) || 'https://api.binance.com';
    let root = raw.replace(/\/$/, '');
    if (!root.includes('/api')) root = `${root}/api`;
    if (!root.endsWith('/v3')) root = `${root.replace(/\/$/, '')}/v3`;
    return root;
  })();
  const res = await axios.delete(`${apiRoot2.replace(/\/$/, '')}/order?${payload}&signature=${sign}`, {
    headers: { 'X-MBX-APIKEY': apiKey }
  });
  return res.data;
}