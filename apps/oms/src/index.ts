import path from 'path';
import dotenv from 'dotenv';

// Load env files early so packages that create DB/Redis pools see the values.
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import express from 'express';
import { v4 as uuid } from 'uuid';
import { query } from '@repo/db';
import { createRedisClient } from '@repo/redis';

const app = express();
app.use(express.json());

const redis = createRedisClient();

// Hardcoded demo user id for Phase 3; later replace with JWT auth.
const DEMO_USER_ID = '00000000-0000-0000-0000-000000000001';
const DEMO_ACCOUNT_ID = '00000000-0000-0000-0000-000000000001';

app.post('/orders', async (req, res) => {
  try {
    const { symbol, side, type, quantity, requestedPrice } = req.body;
    if (!symbol || !side || !type || !quantity) {
      return res.status(400).json({ error: 'missing fields' });
    }

    // Basic balance check: For BUY, ensure account balance >= estimated cost
    if (side === 'BUY') {
      // Fetch current ticker price for rough estimate; fallback to 0 so engine handles exact price
      // For simplicity, we skip precise check here; execution engine will reject if insufficient
    }

    const orderId = uuid();
    await query(
      `INSERT INTO orders (id, user_id, account_id, symbol, side, type, quantity, requested_price, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING')`,
      [orderId, DEMO_USER_ID, DEMO_ACCOUNT_ID, symbol.toUpperCase(), side, type, quantity, requestedPrice || null]
    );

    // Push to Redis Stream
    await redis.xadd('orders_stream', '*', 'orderId', orderId);

    res.status(201).json({ orderId, status: 'PENDING' });
  } catch (err) {
    console.error('Order creation error:', err);
    res.status(500).json({ error: 'internal' });
  }
});

// Get a single order by ID
app.get('/orders/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const rows = await query(`SELECT * FROM orders WHERE id = $1`, [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Get order error:', err);
    res.status(500).json({ error: 'internal' });
  }
});

// List recent orders (optional ?limit=20)
app.get('/orders', async (req, res) => {
  try {
    const limit = Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 100);
    const rows = await query(`SELECT * FROM orders ORDER BY created_at DESC LIMIT $1`, [limit]);
    res.json(rows);
  } catch (err) {
    console.error('List orders error:', err);
    res.status(500).json({ error: 'internal' });
  }
});

// Get account details
app.get('/accounts/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const rows = await query(`SELECT * FROM accounts WHERE id = $1`, [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'not_found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('Get account error:', err);
    res.status(500).json({ error: 'internal' });
  }
});

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => console.log(`Order service on port ${PORT}`));