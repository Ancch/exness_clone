import { Tick } from '@repo/types/market';
import { createRedisClient } from '@repo/redis';
import { query } from '@repo/db';

const redis = createRedisClient();
const redisPub = redis.duplicate();

const INTERVALS: Record<string, number> = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '1h': 60 * 60 * 1000,
};

interface CandleData {
  symbol: string;
  interval: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  startTime: number;
}

const activeCandles = new Map<string, CandleData>();

export function handleTick(tick: Tick) {
  for (const [intervalStr, ms] of Object.entries(INTERVALS)) {
    const bucket = Math.floor(tick.timestamp / ms) * ms;
    const key = `${tick.symbol}:${intervalStr}:${bucket}`;

    let candle = activeCandles.get(key);
    if (!candle) {
      candle = {
        symbol: tick.symbol,
        interval: intervalStr,
        open: tick.price,
        high: tick.price,
        low: tick.price,
        close: tick.price,
        volume: tick.quantity,
        startTime: bucket,
      };
      activeCandles.set(key, candle);
    } else {
      candle.high = Math.max(candle.high, tick.price);
      candle.low = Math.min(candle.low, tick.price);
      candle.close = tick.price;
      candle.volume += tick.quantity;
    }
  }
}

function flushClosedCandles() {
  const now = Date.now();
  for (const [key, candle] of activeCandles.entries()) {
    const intervalMs = INTERVALS[candle.interval];
    if (!intervalMs) {
      return;
    } else {
    if (now >= candle.startTime + intervalMs) {
      query(
        `INSERT INTO candles (symbol, interval, open, high, low, close, volume, start_time)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (symbol, interval, start_time) DO NOTHING`,
        [candle.symbol, candle.interval, candle.open, candle.high, candle.low, candle.close, candle.volume, candle.startTime]
      ).catch(err => console.error('DB insert error', err));

      const channel = `candles:${candle.symbol}:${candle.interval}`;
      redisPub.publish(channel, JSON.stringify({
        symbol: candle.symbol,
        interval: candle.interval,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
        startTime: candle.startTime,
      }));

      activeCandles.delete(key);
    }      
    }

  }
}

setInterval(flushClosedCandles, 1000);