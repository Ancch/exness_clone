import dotenv from 'dotenv';
import path from 'path';
import express from 'express';

// Load repo-level .env then package-level .env (package overrides repo)
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

async function main() {
  const { query } = await import('@repo/db');

  const app = express();
  app.use(express.json());

  // GET /candles?symbol=BTCUSDT&interval=1m&limit=200
  app.get('/candles', async (req, res) => {
    const { symbol, interval, limit = 200 } = req.query as any;
    if (!symbol || !interval) return res.status(400).json({ error: 'symbol and interval required' });

    try {
      const rows = await query(
        `SELECT * FROM candles 
         WHERE symbol = $1 AND interval = $2 
         ORDER BY start_time DESC 
         LIMIT $3`,
        [symbol.toUpperCase(), interval, Math.min(Number(limit), 1000)]
      );
      res.json(rows.reverse()); // chronological order
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'internal' });
    }
  });

  const PORT = process.env.PORT || 4000;
  app.listen(PORT, () => {
    console.log(`API Gateway listening on port ${PORT}`);
  });
}

main().catch(err => {
  console.error('Failed to start API Gateway', err);
  process.exit(1);
});