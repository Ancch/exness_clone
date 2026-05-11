import { query } from "@repo/db";
import express, { Response, Router } from "express";
import { auth, AuthenticatedRequest } from "src/middleware";


const positions: Router = express.Router();

// GET /positions – open positions for all accounts (or filter by ?accountId=...)
positions.get('/positions', auth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const accountId = req.query.accountId as string;
    let rows;
    if (accountId) {
      // Verify account belongs to user
      const acc = await query(`SELECT id FROM accounts WHERE id = $1 AND user_id = $2`, [accountId, req.userId]);
      if (acc.length === 0) return res.status(404).json({ error: 'Account not found' });
      rows = await query(
        `SELECT p.*, a.account_type, a.leverage as account_leverage
         FROM positions p
         JOIN accounts a ON p.account_id = a.id
         WHERE p.account_id = $1`,
        [accountId]
      );
    } else {
      rows = await query(
        `SELECT p.*, a.account_type, a.leverage as account_leverage
         FROM positions p
         JOIN accounts a ON p.account_id = a.id
         WHERE p.user_id = $1`,
        [req.userId]
      );
    }
    res.json(rows);
  } catch (err) {
    console.error('Get positions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default positions;