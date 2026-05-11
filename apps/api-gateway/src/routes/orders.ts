import express, { Response, Router } from "express";
import { v4 as uuid } from "uuid";
import { createRedisClient } from "@repo/redis";
import { query } from "@repo/db";
import { auth, AuthenticatedRequest } from "src/middleware";   // must have userId

const orderRouter: Router = express.Router();
const redis = createRedisClient();

// POST /orders — place a new order
orderRouter.post('/orders', auth,  async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { symbol, side, type, quantity, requestedPrice, accountId, leverage } = req.body;

    // Validate required fields
    if (!symbol || !side || !type || !quantity || !accountId) {
      return res.status(400).json({
        error: 'symbol, side, type, quantity, and accountId are required'
      });
    }

    // Validate side and type
    if (!['BUY', 'SELL'].includes(side)) {
      return res.status(400).json({ error: 'side must be BUY or SELL' });
    }
    if (!['MARKET', 'LIMIT'].includes(type)) {
      return res.status(400).json({ error: 'type must be MARKET or LIMIT' });
    }

    // Verify the account belongs to the authenticated user
    const accounts = await query(
      `SELECT id, free_margin FROM accounts WHERE id = $1 AND user_id = $2`,
      [accountId, req.userId]
    );
    if (accounts.length === 0) {
      return res.status(404).json({ error: 'Account not found or does not belong to user' });
    }

    // Optional: very basic free margin check (order service can defer full check to engine)
    // We'll only reject if it's a BUY and there is zero free margin (engine will do the precise check)
    const freeMargin = accounts[0].free_margin;
    if (side === 'BUY' && freeMargin <= 0) {
      return res.status(400).json({ error: 'Insufficient free margin' });
    }

    // Generate order ID
    const orderId = uuid();

    // Insert order with PENDING status
    await query(
      `INSERT INTO orders
        (id, user_id, account_id, symbol, side, type, quantity, requested_price, leverage, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'PENDING')`,
      [
        orderId,
        req.userId,
        accountId,
        symbol.toUpperCase(),
        side,
        type,
        quantity,
        requestedPrice || null,
        leverage || null          // will be filled by engine using account default if null
      ]
    );

    // Push orderId to Redis stream for execution engine
    await redis.xadd('orders_stream', '*', 'orderId', orderId);

    res.status(201).json({ orderId, status: 'PENDING' });
  } catch (err) {
    console.error('Order creation error:', err);
    res.status(500).json({ error: 'internal server error' });
  }
});

// GET /orders/:id — get a specific order (must belong to the user)
orderRouter.get('/orders/:id', auth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const id = req.params.id;
    const rows = await query(
      `SELECT * FROM orders WHERE id = $1 AND user_id = $2`,
      [id, req.userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('Get order error:', err);
    res.status(500).json({ error: 'internal server error' });
  }
});

// GET /orders — list recent orders for the authenticated user
orderRouter.get('/orders', auth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const limit = Math.min(
      parseInt(String(req.query.limit || '20'), 10) || 20,
      100
    );
    const rows = await query(
      `SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [req.userId, limit]
    );
    res.json(rows);
  } catch (err) {
    console.error('List orders error:', err);
    res.status(500).json({ error: 'internal server error' });
  }
});

export default orderRouter;