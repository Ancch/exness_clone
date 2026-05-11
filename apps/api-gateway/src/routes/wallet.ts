import { query } from "@repo/db";
import express, { Response, Router } from "express";
import { auth, AuthenticatedRequest } from "src/middleware";



const walletRouter: Router = express.Router();
// POST /wallet/deposit
walletRouter.post('/wallet/deposit', auth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { accountId, amount } = req.body;
    if (!accountId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'accountId and positive amount required' });
    }
    // Verify ownership
    const acc = await query(`SELECT * FROM accounts WHERE id = $1 AND user_id = $2`, [accountId, req.userId]);
    if (acc.length === 0) return res.status(404).json({ error: 'Account not found' });

    // Update balance, equity, free_margin (since no position change, equity = balance)
    await query(
      `UPDATE accounts SET balance = balance + $1, equity = balance + $1, free_margin = free_margin + $1 WHERE id = $2`,
      [amount, accountId]
    );
    // Insert ledger entry
    await query(
      `INSERT INTO ledger (account_id, change_amount, reason) VALUES ($1,$2,'deposit')`,
      [accountId, amount]
    );
    res.json({ message: 'Deposit successful', newBalance: acc[0].balance + amount });
  } catch (err) {
    console.error('Deposit error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// POST /wallet/withdraw
walletRouter.post('/wallet/withdraw', auth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { accountId, amount } = req.body;
    if (!accountId || !amount || amount <= 0) {
      return res.status(400).json({ error: 'accountId and positive amount required' });
    }
    const acc = await query(`SELECT * FROM accounts WHERE id = $1 AND user_id = $2`, [accountId, req.userId]);
    if (acc.length === 0) return res.status(404).json({ error: 'Account not found' });

    const currentBalance = acc[0].balance;
    const freeMargin = acc[0].free_margin;

    // Ensure sufficient balance and free margin (can't withdraw more than free margin)
    if (amount > currentBalance || amount > freeMargin) {
      return res.status(400).json({ error: 'Insufficient funds or margin locked' });
    }

    await query(
      `UPDATE accounts SET balance = balance - $1, equity = balance - $1, free_margin = free_margin - $1 WHERE id = $2`,
      [amount, accountId]
    );
    await query(
      `INSERT INTO ledger (account_id, change_amount, reason) VALUES ($1,$2,'withdrawal')`,
      [accountId, -amount]   // negative change
    );
    res.json({ message: 'Withdrawal successful', newBalance: currentBalance - amount });
  } catch (err) {
    console.error('Withdraw error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// GET /wallet/history?accountId=...&reason=deposit,withdrawal
walletRouter.get('/wallet/history', auth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const accountId = req.query.accountId as string;
    if (!accountId) return res.status(400).json({ error: 'accountId required' });

    // Verify ownership
    const acc = await query(`SELECT id FROM accounts WHERE id = $1 AND user_id = $2`, [accountId, req.userId]);
    if (acc.length === 0) return res.status(404).json({ error: 'Account not found' });

    let sql = `SELECT * FROM ledger WHERE account_id = $1`;
    const params: any[] = [accountId];

    if (req.query.reason) {
      const reasons = (req.query.reason as string).split(',');
      sql += ` AND reason IN (${reasons.map((_, i) => `$${i + 2}`).join(',')})`;
      params.push(...reasons);
    }
    sql += ` ORDER BY created_at DESC LIMIT 100`;

    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Wallet history error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


export default walletRouter;