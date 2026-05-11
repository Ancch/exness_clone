import WebSocket from "ws";
import { createRedisClient } from "@repo/redis";
import { Tick, Ticker } from "@repo/types/market";
import { applySpread } from "./pricing";

const redis = createRedisClient();
const symbol = "btcusdt";

const SYMBOLS = ['btcusdt', 'ethusdt', 'solusdt', 'adausdt', 'xrpusdt', 'bnbusdt', 'dogeusdt']; // you can fetch this list dynamically from Binance exchangeInfo

function connect() {
  const streams = SYMBOLS.map(s => `${s}@trade`).join('/');
  const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
  const ws = new WebSocket(url);

  ws.on('message', async (raw) => {
    const msg = JSON.parse(raw.toString());
    // The combined stream wraps each event as { stream: "...", data: {...} }
    if (!msg.data) return;
    const tickData = msg.data;

    const tick: Tick = {
      symbol: tickData.s.toUpperCase(),
      price: parseFloat(tickData.p),
      quantity: parseFloat(tickData.q),
      timestamp: tickData.T,
    };

    // Publish raw tick (unchanged)
    await redis.publish(`prices:tick:${tick.symbol}`, JSON.stringify(tick));

    // Apply broker pricing
    const { bid, ask } = applySpread(tick.price);
    const ticker: Ticker = { 
       symbol: tick.symbol,
       bid, 
       ask, 
       last: tick.price, 
       timestamp: tick.timestamp 
      };

    // Publish broker ticker to Pub/Sub
    await redis.publish(`prices:ticker:${ticker.symbol}`, JSON.stringify(ticker));

    // Store raw (minimal spread) ticker for internal exchange
    const rawTicker = {
      symbol: tick.symbol,
      bid: tick.price * 0.9995,
      ask: tick.price * 1.0005,
      last: tick.price,
      timestamp: tick.timestamp,
    };
    await redis.set(`raw:ticker:${rawTicker.symbol}`, JSON.stringify(rawTicker));
    // Also store broker ticker (optional, if you want frontend default)
    await redis.set(`broker:ticker:${ticker.symbol}`, JSON.stringify(ticker));
  });

  ws.on("close", () => {
    console.log("Binance WebSocket closed, reconnecting in 3s...");
    setTimeout(connect, 3000);
  });

  ws.on("error", (err) => console.error("Binance WS error:", err));
  // reconnect logic unchanged...
}


connect();
