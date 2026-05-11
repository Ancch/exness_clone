import express, { Request, Response, Router } from "express";
import { auth, AuthenticatedRequest } from "src/middleware";
import { createRedisClient } from "@repo/redis";
import { query } from "@repo/db";
const marketRouter: Router = express.Router();
const redis = createRedisClient();

type TickerParams = {
  symbol: string;
};
// GET /market/ticker/:symbol  (requires auth)
marketRouter.get('/market/ticker/:symbol', auth, async (req: Request<TickerParams>, res: Response) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const raw = await redis.get(`ticker:${symbol}`);
    if (!raw) {
      return res.status(404).json({ error: 'Ticker not available' });
    }
    res.json(JSON.parse(raw));
  } catch (err) {
    console.error('Ticker error:', err);
    res.status(500).json({ error: 'internal' });
  }
});

// GET /market/candles/:symbol?interval=1m&limit=200  (no auth needed for public data)
marketRouter.get('/market/candles', async (req: Request<TickerParams>, res: Response) => {
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
      res.status(500).json({ error: 'internal server err' });
    }
});



export default marketRouter;
