import axios from 'axios';
import { query } from '@repo/db';

export async function bootstrapHistoricalCandles(symbol: string, interval: string) {
  const normalizedSymbol = symbol.toUpperCase();
  const url = `https://api.binance.com/api/v3/klines?symbol=${normalizedSymbol}&interval=${interval}&limit=500`;
  const response = await axios.get(url);
  const rows = response.data;

  for (const row of rows) {
    const [openTime, open, high, low, close, volume] = row;
    await query(
      `INSERT INTO candles (symbol, interval, open, high, low, close, volume, start_time)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (symbol, interval, start_time) DO NOTHING`,
      [symbol, interval, parseFloat(open), parseFloat(high), parseFloat(low), parseFloat(close), parseFloat(volume), openTime]
    );
  }
}