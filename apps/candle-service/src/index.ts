import dotenv from 'dotenv';
import path from 'path';

// Load repo-level then package .env before creating DB/redis pools
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
  const { startTickListener } = await import('./tickListener.js');
  const { bootstrapHistoricalCandles } = await import('./bootstrap.js');

  const SYMBOLS = ['btcusdt', 'ethusdt', 'solusdt', 'adausdt', 'xrpusdt', 'bnbusdt', 'dogeusdt'];
  const INTERVALS = ['1m', '5m', '1h'];

  for (const symbol of SYMBOLS) {
    for (const interval of INTERVALS) {
      await bootstrapHistoricalCandles(symbol, interval);
    }
  }
  startTickListener(SYMBOLS);
  console.log('Candle service running…');
}

main().catch(console.error);