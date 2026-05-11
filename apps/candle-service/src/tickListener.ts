import { createRedisClient } from '@repo/redis';
import { Tick } from '@repo/types/market';
import { handleTick } from './aggregator';



export function startTickListener(symbols: string[]) {
  const sub = createRedisClient();
  for (const symbol of symbols) {
    sub.subscribe(`prices:tick:${symbol}`);
  }

  sub.on('message', (channel, message) => {
    if (channel.startsWith('prices:tick:')) {
      const tick: Tick = JSON.parse(message);
      handleTick(tick);
    }
  });
}