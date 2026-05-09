import WebSocket from "ws";
import { createRedisClient } from "@repo/redis";
import { Tick, Ticker } from "@repo/types/market";
import { applySpread } from "./pricing";

const redis = createRedisClient();
const symbol = "btcusdt";

function connect() {
  const ws = new WebSocket(
    `wss://stream.binance.com:9443/ws/${symbol}@trade`
  );

  ws.on("message", async (data) => {
    const msg = JSON.parse(data.toString());

    const tick: Tick = {
      symbol: msg.s.toUpperCase(),
      price: parseFloat(msg.p),
      quantity: parseFloat(msg.q),
      timestamp: msg.T,
    };

    // 1. Publish raw tick for candle-service
    await redis.publish(
      `prices:tick:${tick.symbol}`,
      JSON.stringify(tick)
    );

    // 2. Apply broker pricing
    const { bid, ask } = applySpread(tick.price);

    // 3. Build ticker object
    const ticker: Ticker = {
      symbol: tick.symbol,
      bid,
      ask,
      last: tick.price,
      timestamp: tick.timestamp,
    };

    
    // 4. Publish ticker to Pub/Sub channel (for websocket-service)
    await redis.publish(
      `prices:ticker:${ticker.symbol}`,
      JSON.stringify(ticker)
    );

        // After fetching the raw trade, compute raw bid/ask (without spread)
    const rawTicker = {
      symbol: tick.symbol,
      bid: tick.price * 0.9995,  // just an example of a minimal raw spread
      ask: tick.price * 1.0005,
      last: tick.price,
      timestamp: tick.timestamp,
    };
    await redis.set(
      `ticker:${rawTicker.symbol}`, 
      JSON.stringify(rawTicker)
    );
// Keep you existing spread ticker for websocket (for frontend default view)
    // 5. Set latest ticker in Redis cache (for execution-engine)
    await redis.set(
      `ticker:${ticker.symbol}`,
      JSON.stringify(ticker)
    );
  });

  ws.on("close", () => {
    console.log("Binance WebSocket closed, reconnecting in 3s...");
    setTimeout(connect, 3000);
  });

  ws.on("error", (err) => console.error("Binance WS error:", err));
}

connect();
// import WebSocket from "ws";
// import { createRedisClient } from "@repo/redis/index";
// import { Tick, Ticker } from "@repo/types/market";

// const redis = createRedisClient();

// const SYMBOL = "btcusdt";

// function applySpread(lastPrice: number): { bid: number; ask: number } {
//   const spread = 0.0005; // 0.05%
//   return {
//     bid: lastPrice * (1 - spread),
//     ask: lastPrice * (1 + spread),
//   };
// }

// function connectBinance() {
//   const url = `wss://stream.binance.com:9443/ws/${SYMBOL}@trade`;
//   const ws = new WebSocket(url);

//   ws.on("open", () => console.log(`Connected to Binance for ${SYMBOL}`));

//   ws.on("message", async (data) => {
//     const msg = JSON.parse(data.toString());

//     const tick: Tick = {
//       symbol: msg.s.toUpperCase(),
//       price: parseFloat(msg.p),
//       quantity: parseFloat(msg.q),
//       timestamp: msg.T,
//     };

//     // Publish raw tick
//     await redis.publish(`prices:tick:${tick.symbol}`, JSON.stringify(tick));

//     // Apply pricing and publish broker ticker
//     const { bid, ask } = applySpread(tick.price);
//     const ticker: Ticker = {
//       symbol: tick.symbol,
//       bid,
//       ask,
//       last: tick.price,
//       timestamp: tick.timestamp,
//     };

//     await redis.publish(
//       `prices:ticker:${tick.symbol}`,
//       JSON.stringify(ticker)
//     );
//   });

//   ws.on("close", () => {
//     console.log("Binance WebSocket closed, reconnecting in 3s...");
//     setTimeout(connectBinance, 3000);
//   });

//   ws.on("error", (err) => console.error("WS error:", err));
// }

// connectBinance();