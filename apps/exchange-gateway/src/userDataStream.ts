import WebSocket from 'ws';

let ws: WebSocket | null = null;
let listenKey: string | null = null;

// Add HMAC-SHA256 signing helper (install crypto-js if needed: npm i crypto-js @types/crypto-js)
import CryptoJS from 'crypto-js';

function signRequest(params: Record<string, string>, secret: string): string {
  const queryString = new URLSearchParams(params).toString();
  return CryptoJS.HmacSHA256(queryString, secret).toString(CryptoJS.enc.Hex);
}

// Updated createListenKey
export async function createListenKey() {
  const apiKey = process.env.BINANCE_API_KEY!;
  const secret = process.env.BINANCE_SECRET_KEY!;
  if (!secret) throw new Error('BINANCE_SECRET_KEY is not set');

  const timestamp = Date.now().toString();
  const params: Record<string, string> = { timestamp };
  params.signature = signRequest(params, secret);

  const API_BASE = process.env.BINANCE_API_BASE || 'https://testnet.binance.vision/api';
  const endpoint = `${API_BASE.replace(/\/$/, '')}/v3/userDataStream`;  // Fixed: always /v3/, drop dynamic logic
  console.log('Creating Binance listenKey via', endpoint);

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 
      'X-MBX-APIKEY': apiKey 
    },
    body: new URLSearchParams(params)  // Send as form data
  });

  // ... rest unchanged
}

// In keep-alive interval (update similarly):
setInterval(async () => {
  if (!listenKey) return;
  const params: Record<string, string> = { listenKey, timestamp: Date.now().toString() };
  params.signature = signRequest(params, process.env.BINANCE_SECRET_KEY!);
  
  const keepAliveEndpoint = `${process.env.BINANCE_API_BASE!.replace(/\/$/, '')}/v3/userDataStream`;
  const resp = await fetch(keepAliveEndpoint, {
    method: 'PUT',
    headers: { 'X-MBX-APIKEY': process.env.BINANCE_API_KEY! },
    body: new URLSearchParams(params)
  });
  if (!resp.ok) {
    console.warn('Keep-alive failed:', resp.status);  // Triggers recreate on next close
  }
}, 30 * 60 * 1000);

// export async function createListenKey(): Promise<string> {
//   const apiKey = process.env.BINANCE_API_KEY;
//   if (!apiKey) throw new Error('BINANCE_API_KEY is not set');

//   const API_BASE_RAW = process.env.BINANCE_API_BASE || 'https://api.binance.com';
//   const API_BASE = API_BASE_RAW;
//   // If the provided API_BASE already contains the userDataStream path, use it as-is.
//   const endpoint = API_BASE.includes('/api/') || API_BASE.includes('userDataStream')
//     ? API_BASE.replace(/\/$/, '')
//     : `${API_BASE.replace(/\/$/, '')}/api/v3/userDataStream`;
//   console.log('Creating Binance listenKey via', endpoint);

//   const resp = await fetch(endpoint, {
//     method: 'POST',
//     headers: { 'X-MBX-APIKEY': apiKey }
//   });

//   const text = await resp.text();
//   if (!resp.ok) {
//     console.error('Failed to create Binance listenKey', resp.status, text);
//     throw new Error(`Binance listenKey request failed: ${resp.status}`);
//   }

//   try {
//     const json = JSON.parse(text);
//     if (!json.listenKey) {
//       console.error('Binance response did not include listenKey:', json);
//       throw new Error('listenKey missing in Binance response');
//     }
//     return json.listenKey;
//   } catch (err) {
//     console.error('Failed to parse Binance listenKey response as JSON:', text.slice(0, 200));
//     throw err;
//   }
// }

export function startUserDataStream(onMessage: (data: any) => void) {
  createListenKey()
    .then(key => {
      (listenKey as any) = key;
      const WS_BASE_RAW = process.env.BINANCE_WS_BASE || 'wss://stream.binance.com:9443';
      const WS_BASE = (WS_BASE_RAW);
      // If WS_BASE already includes a /ws path, append the listenKey directly. Otherwise add '/ws/'
      const wsUrl = WS_BASE.includes('/ws')
        ? `${WS_BASE.replace(/\/$/, '')}/${listenKey}`
        : `${WS_BASE.replace(/\/$/, '')}/ws/${listenKey}`;
      console.log('Connecting to Binance user data stream at', wsUrl);
      ws = new WebSocket(wsUrl);

      ws.on('open', () => console.log('User Data Stream connected'));

      ws.on('message', (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.e === 'executionReport') {
          onMessage({
            orderId: msg.i.toString(),            // exchange order ID
            clientOrderId: msg.c,                 // our clientOrderId
            symbol: msg.s,
            side: msg.S,
            status: msg.X,                        // NEW, PARTIALLY_FILLED, FILLED, CANCELED
            executedQuantity: parseFloat(msg.l),
            price: parseFloat(msg.L) || 0,
            lastExecutedQuantity: parseFloat(msg.z),
            commission: parseFloat(msg.n),
            timestamp: msg.E
          });
        }
        // handle other events as needed
      });

      ws.on('close', () => {
        console.log('User Data Stream closed, reconnecting in 10s');
        setTimeout(() => startUserDataStream(onMessage), 10000);
      });

      // Keep alive every 30 minutes
      setInterval(async () => {
        const API_BASE = process.env.BINANCE_API_BASE || 'https://api.binance.com';
        const keepAliveEndpoint = `${API_BASE.replace(/\/$/, '')}/api/v3/userDataStream?listenKey=${listenKey}`;
        try {
          await fetch(keepAliveEndpoint, {
            method: 'PUT',
            headers: { 'X-MBX-APIKEY': process.env.BINANCE_API_KEY! }
          });
        } catch (e) {
          console.warn('Failed to keep alive Binance listenKey', e);
        }
      }, 30 * 60 * 1000);
    })
    .catch(err => {
      console.error('Could not start Binance user data stream:', err.message || err);
      console.info('If you are testing locally, you can set BINANCE_MOCK_USERDATA=1 to enable a simulated execution report stream.');
      if (process.env.BINANCE_MOCK_USERDATA === '1') {
        console.info('Starting mocked user-data stream (BINANCE_MOCK_USERDATA=1)');
        // Simple mock: emit a fake execution report every 10s
        setInterval(() => {
          onMessage({
            orderId: 'mock-' + Date.now(),
            clientOrderId: 'mock-client',
            symbol: 'BTCUSDT',
            side: 'BUY',
            status: 'FILLED',
            executedQuantity: 0.01,
            price: 80000,
            timestamp: Date.now()
          });
        }, 10000);
      }
    });
} 