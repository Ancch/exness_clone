import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { WebSocketServer, WebSocket } from "ws";
import { createRedisClient } from "@repo/redis";

const redis = createRedisClient();

const wss = new WebSocketServer({ port: 3001 });

wss.on("connection", (ws: WebSocket) => {
  // Subscriber for this client (ticker & candles)
  const subscriber = redis.duplicate();
  let currentSymbol = "BTCUSDT";
  let subscribedChannels: string[] = [];
  let candleInterval = "1m";

  // Helper to re-subscribe to all required channels
  function subscribeAll() {
    subscriber.unsubscribe(); // unsubscribe everything
    subscribedChannels = [];

    // Always subscribe to ticker
    const tickerChannel = `prices:ticker:${currentSymbol}`;
    subscriber.subscribe(tickerChannel);
    subscribedChannels.push(tickerChannel);

    // Also subscribe to candles if client asked for them (default 1m)
    const candleChannel = `candles:${currentSymbol}:${candleInterval}`;
    subscriber.subscribe(candleChannel);
    subscribedChannels.push(candleChannel);
  }
  subscribeAll();

  subscriber.on("message", (channel, message) => {

      
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
    if (subscribedChannels.includes(channel)) {
      ws.send(message);
    }
  });

  

  ws.on("message", (raw) => {

    try {
      const msg = JSON.parse(raw.toString());
      if (msg.interval && ['1m','5m','1h'].includes(msg.interval)) {
        candleInterval = msg.interval;
        subscribeAll(); // re‑subscribe channels
      }
      if (msg.symbol) {
        currentSymbol = msg.symbol.toUpperCase();
        subscribeAll();
      }
    } catch(e) {}
  });

  ws.on("close", () => {
    subscriber.unsubscribe();
    subscriber.quit();
  });
});

console.log("WebSocket server running on ws://localhost:3001");



// import { WebSocketServer, WebSocket } from "ws";
// import { createRedisClient } from "@repo/redis";

// const redis = createRedisClient();

// const WS_PORT = Number(process.env.PORT || process.env.WS_PORT || 3002);
// const wss = new WebSocketServer({ port: WS_PORT });

// wss.on("connection", (ws: WebSocket) => {
//   // Subscriber for this client (ticker & candles)
//   const subscriber = redis.duplicate();
//   let currentSymbol = "BTCUSDT";
//   let subscribedChannels: string[] = [];

//   // Helper to re-subscribe to all required channels
//   function subscribeAll() {
//     // Unsubscribe everything first
//     try {
//       subscriber.unsubscribe();
//     } catch (e) {
//       // ignore if already unsubscribed
//     }
//     subscribedChannels = [];

//     // Always subscribe to ticker
//     const tickerChannel = `prices:ticker:${currentSymbol}`;
//     subscriber.subscribe(tickerChannel);
//     subscribedChannels.push(tickerChannel);

//     // Also subscribe to candles if client asked for them (default 1m)
//     const candleChannel = `candles:${currentSymbol}:1m`;
//     subscriber.subscribe(candleChannel);
//     subscribedChannels.push(candleChannel);
//   }

//   subscribeAll();

//   subscriber.on("message", (channel, message) => {
//     if (subscribedChannels.includes(channel)) {
//       try {
//         ws.send(message);
//       } catch (err) {
//         // client may have disconnected
//       }
//     }
//   });

//   ws.on("message", (raw) => {
//     try {
//       const msg = JSON.parse(raw.toString());
//       if (msg.symbol) {
//         // Client wants a different symbol
//         currentSymbol = msg.symbol.toUpperCase();
//         subscribeAll();
//       }
//       // Optionally handle more granular subscriptions like msg.candleInterval
//     } catch (e) {
//       // ignore
//     }
//   });

//   ws.on("close", () => {
//     try {
//       subscriber.unsubscribe();
//       subscriber.quit();
//     } catch (e) {
//       // ignore shutdown errors
//     }
//   });
// });

// console.log("WebSocket server running on ws://localhost:3001");