import { createRedisClient } from '@repo/redis';
import { Tick } from '@repo/types/market';
import { handleTick } from './aggregator';

export function startTickListener() {
  const sub = createRedisClient();
  const symbol = 'BTCUSDT';
  sub.subscribe(`prices:tick:${symbol}`);

  sub.on('message', (channel, message) => {
    if (channel.startsWith('prices:tick:')) {
      const tick: Tick = JSON.parse(message);
      handleTick(tick);
    }
  });

  // reconnect logic if needed (simple version)
}